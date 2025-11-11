use crate::error::{Result, RowFlowError};
use crate::types::{EmbeddingSearchMatch, EmbeddingTableMetadata};

use rusqlite::{params, params_from_iter, Connection};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::task;

pub struct VectorStore {
    db_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct EmbeddingRecord {
    pub connection_id: String,
    pub schema_name: String,
    pub table_name: String,
    pub row_reference: String,
    pub chunk_hash: String,
    pub content: String,
    pub metadata: Value,
    pub embedding: Vec<f32>,
}

impl VectorStore {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let store = Self { db_path: path };
        store.initialize()?;
        Ok(store)
    }

    pub async fn insert_embeddings(&self, records: Vec<EmbeddingRecord>) -> Result<usize> {
        if records.is_empty() {
            return Ok(0);
        }

        let db_path = self.db_path.clone();
        let inserted = task::spawn_blocking(move || -> Result<usize> {
            let mut conn = Connection::open(db_path)?;
            conn.pragma_update(None, "journal_mode", "wal")?;
            let tx = conn.transaction()?;

            let mut stmt = tx.prepare(
                r#"
                INSERT INTO embeddings (
                    connection_id,
                    schema_name,
                    table_name,
                    row_reference,
                    chunk_hash,
                    content,
                    metadata,
                    embedding,
                    created_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ON CONFLICT(connection_id, schema_name, table_name, row_reference, chunk_hash)
                DO UPDATE SET
                    content = excluded.content,
                    metadata = excluded.metadata,
                    embedding = excluded.embedding,
                    created_at = excluded.created_at
                "#,
            )?;

            let mut inserted = 0usize;
            for record in records {
                let metadata = serde_json::to_string(&record.metadata)?;
                let embedding = serde_json::to_string(&record.embedding)?;
                stmt.execute(params![
                    record.connection_id,
                    record.schema_name,
                    record.table_name,
                    record.row_reference,
                    record.chunk_hash,
                    record.content,
                    metadata,
                    embedding,
                    current_timestamp()
                ])?;
                inserted += 1;
            }

            drop(stmt);

            tx.commit()?;
            Ok(inserted)
        })
        .await
        .map_err(|err| RowFlowError::InternalError(err.to_string()))??;

        Ok(inserted)
    }

    pub async fn search(
        &self,
        connection_id: &str,
        schema: Option<&str>,
        table: Option<&str>,
        query_embedding: &[f32],
        top_k: usize,
    ) -> Result<Vec<EmbeddingSearchMatch>> {
        let db_path = self.db_path.clone();
        let schema = schema.map(|s| s.to_string());
        let table = table.map(|t| t.to_string());
        let query_embedding = query_embedding.to_vec();
        let connection_id = connection_id.to_string();

        let matches = task::spawn_blocking(move || -> Result<Vec<EmbeddingSearchMatch>> {
            let conn = Connection::open(db_path)?;

            let mut sql = String::from(
                "SELECT row_reference, schema_name, table_name, content, metadata, embedding \
                FROM embeddings WHERE connection_id = ?",
            );

            let mut bindings: Vec<String> = vec![connection_id];
            if let Some(schema) = schema {
                sql.push_str(" AND schema_name = ?");
                bindings.push(schema);
            }
            if let Some(table) = table {
                sql.push_str(" AND table_name = ?");
                bindings.push(table);
            }

            let mut stmt = conn.prepare(&sql)?;
            let params = params_from_iter(bindings.iter());
            let mut rows = stmt.query(params)?;

            let mut results = Vec::new();
            while let Some(row) = rows.next()? {
                let row_reference: String = row.get(0)?;
                let schema_name: String = row.get(1)?;
                let table_name: String = row.get(2)?;
                let content: String = row.get(3)?;
                let metadata: String = row.get(4)?;
                let embedding: String = row.get(5)?;

                let metadata: Value = serde_json::from_str(&metadata)?;
                let embedding: Vec<f32> = serde_json::from_str(&embedding)?;
                let score = cosine_similarity(&query_embedding, &embedding);

                results.push(EmbeddingSearchMatch {
                    row_reference,
                    schema: schema_name,
                    table: table_name,
                    score,
                    content,
                    metadata,
                });
            }

            results
                .sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
            results.truncate(top_k);

            Ok(results)
        })
        .await
        .map_err(|err| RowFlowError::InternalError(err.to_string()))??;

        Ok(matches)
    }

    /// Get metadata about embedded tables including row counts and last update time
    pub async fn get_table_metadata(
        &self,
        connection_id: &str,
    ) -> Result<Vec<EmbeddingTableMetadata>> {
        let db_path = self.db_path.clone();
        let connection_id = connection_id.to_string();

        let metadata = task::spawn_blocking(move || -> Result<Vec<EmbeddingTableMetadata>> {
            let conn = Connection::open(db_path)?;

            let mut stmt = conn.prepare(
                r#"
                SELECT
                    connection_id,
                    schema_name,
                    table_name,
                    COUNT(*) as row_count,
                    MAX(created_at) as last_updated
                FROM embeddings
                WHERE connection_id = ?
                GROUP BY connection_id, schema_name, table_name
                "#,
            )?;

            let mut rows = stmt.query(params![connection_id])?;
            let mut results = Vec::new();

            while let Some(row) = rows.next()? {
                results.push(EmbeddingTableMetadata {
                    connection_id: row.get(0)?,
                    schema_name: row.get(1)?,
                    table_name: row.get(2)?,
                    row_count: row.get(3)?,
                    last_updated: row.get(4)?,
                });
            }

            Ok(results)
        })
        .await
        .map_err(|err| RowFlowError::InternalError(err.to_string()))??;

        Ok(metadata)
    }

    /// Delete all embeddings for a specific table
    pub async fn delete_table_embeddings(
        &self,
        connection_id: &str,
        schema: &str,
        table: &str,
    ) -> Result<usize> {
        let db_path = self.db_path.clone();
        let connection_id = connection_id.to_string();
        let schema = schema.to_string();
        let table = table.to_string();

        let deleted = task::spawn_blocking(move || -> Result<usize> {
            let conn = Connection::open(db_path)?;
            let count = conn.execute(
                "DELETE FROM embeddings WHERE connection_id = ?1 AND schema_name = ?2 AND table_name = ?3",
                params![connection_id, schema, table],
            )?;
            Ok(count)
        })
        .await
        .map_err(|err| RowFlowError::InternalError(err.to_string()))??;

        Ok(deleted)
    }

    fn initialize(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = wal;
            CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                connection_id TEXT NOT NULL,
                schema_name TEXT NOT NULL,
                table_name TEXT NOT NULL,
                row_reference TEXT NOT NULL,
                chunk_hash TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT NOT NULL,
                embedding TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_unique
                ON embeddings(connection_id, schema_name, table_name, row_reference, chunk_hash);

            CREATE INDEX IF NOT EXISTS idx_embeddings_lookup
                ON embeddings(connection_id, schema_name, table_name);

            CREATE INDEX IF NOT EXISTS idx_embeddings_created
                ON embeddings(connection_id, schema_name, table_name, created_at);
            "#,
        )?;

        Ok(())
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot = a.iter().zip(b).map(|(lhs, rhs)| lhs * rhs).sum::<f32>();
    let norm_a = a.iter().map(|value| value * value).sum::<f32>().sqrt();
    let norm_b = b.iter().map(|value| value * value).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}
