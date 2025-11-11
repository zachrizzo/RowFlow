use serde::{Deserialize, Serialize};
use typeshare::typeshare;

use std::collections::BTreeMap;

/// Connection profile for PostgreSQL database
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: Option<String>,
    pub use_ssh: bool,
    pub ssh_config: Option<SshConfig>,
    pub tls_config: Option<TlsConfig>,
    pub connection_timeout: Option<u64>, // seconds
    pub statement_timeout: Option<u64>,  // milliseconds
    pub lock_timeout: Option<u64>,       // milliseconds
    pub idle_timeout: Option<u64>,       // seconds
    pub read_only: bool,
}

/// SSH tunnel configuration
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

/// TLS configuration
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsConfig {
    pub enabled: bool,
    pub verify_ca: bool,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
}

/// Result of a query execution
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub fields: Vec<FieldInfo>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub execution_time: f64, // milliseconds
    pub has_more: bool,
}

/// Information about a query result field
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldInfo {
    pub name: String,
    pub type_oid: u32,
    pub type_name: String,
    pub nullable: bool,
}

/// Database connection information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub connection_id: String,
    pub server_version: String,
    pub database_name: String,
    pub username: String,
    pub server_encoding: String,
    pub client_encoding: String,
    pub is_superuser: bool,
    pub session_user: String,
    pub current_schema: String,
}

/// Database schema information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schema {
    pub name: String,
    pub owner: String,
    pub is_system: bool,
    pub description: Option<String>,
}

/// Table information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub schema: String,
    pub name: String,
    pub table_type: String, // BASE TABLE, VIEW, MATERIALIZED VIEW, etc.
    pub owner: Option<String>,
    pub row_count: Option<i64>,
    pub size: Option<String>,
    pub description: Option<String>,
}

/// Column information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub character_maximum_length: Option<i32>,
    pub numeric_precision: Option<i32>,
    pub numeric_scale: Option<i32>,
    pub is_primary_key: bool,
    pub is_unique: bool,
    pub is_foreign_key: bool,
    pub foreign_key_schema: Option<String>,
    pub foreign_key_table: Option<String>,
    pub foreign_key_column: Option<String>,
    pub description: Option<String>,
}

/// Index information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: String, // btree, hash, gist, gin, etc.
    pub definition: String,
    pub size: Option<String>,
}

/// Table statistics
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableStats {
    pub schema: String,
    pub table: String,
    pub row_count: Option<i64>,
    pub total_size: String,
    pub table_size: String,
    pub indexes_size: String,
    pub toast_size: Option<String>,
    pub seq_scan: Option<i64>,
    pub seq_tup_read: Option<i64>,
    pub idx_scan: Option<i64>,
    pub idx_tup_fetch: Option<i64>,
    pub n_tup_ins: Option<i64>,
    pub n_tup_upd: Option<i64>,
    pub n_tup_del: Option<i64>,
    pub n_live_tup: Option<i64>,
    pub n_dead_tup: Option<i64>,
    pub last_vacuum: Option<String>,
    pub last_autovacuum: Option<String>,
    pub last_analyze: Option<String>,
    pub last_autoanalyze: Option<String>,
}

/// Query execution plan
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPlan {
    pub plan: serde_json::Value,
    pub execution_time: Option<f64>,
    pub planning_time: Option<f64>,
}

/// Foreign key information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKey {
    pub name: String,
    pub columns: Vec<String>,
    pub foreign_schema: String,
    pub foreign_table: String,
    pub foreign_columns: Vec<String>,
    pub on_delete: String,
    pub on_update: String,
}

/// Metadata about an Ollama model available locally
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInfo {
    pub name: String,
    pub size: Option<u64>,
    pub digest: Option<String>,
    pub modified_at: Option<String>,
}

/// Status information about the Ollama runtime
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub available: bool,
    pub endpoint: String,
    pub version: Option<String>,
    pub models: Vec<OllamaModelInfo>,
    pub message: Option<String>,
}

/// Installation information about Ollama
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaInstallInfo {
    pub is_bundled: bool,
    pub is_installed: bool,
    pub system_ollama_available: bool,
    pub system_ollama_path: Option<String>,
    pub models_dir: String,
    pub models_size: u64,
    pub models_size_formatted: String,
}

/// Request to generate embeddings for a table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingJobRequest {
    pub connection_id: String,
    pub schema: String,
    pub table: String,
    pub columns: Vec<String>,
    pub model: String,
    pub limit: Option<i64>,
}

/// Result summary from an embedding job
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingJobResult {
    pub embedded_rows: usize,
    pub skipped_rows: usize,
}

/// Request to perform semantic search against stored embeddings
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingSearchRequest {
    pub connection_id: String,
    pub schema: Option<String>,
    pub table: Option<String>,
    pub query: String,
    pub model: String,
    pub top_k: usize,
}

/// A semantic search match result
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingSearchMatch {
    pub row_reference: String,
    pub schema: String,
    pub table: String,
    pub score: f32,
    pub content: String,
    pub metadata: serde_json::Value,
}

/// Metadata about embeddings for a table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingTableMetadata {
    pub connection_id: String,
    pub schema_name: String,
    pub table_name: String,
    pub row_count: i64,
    pub last_updated: i64,
}

/// Constraint information
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constraint {
    pub name: String,
    pub constraint_type: String, // PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK
    pub columns: Vec<String>,
    pub definition: Option<String>,
}

/// Definition for creating or altering table columns
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableColumnDefinition {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_expression: Option<String>,
    pub is_primary_key: bool,
    pub references: Option<ColumnReference>,
}

/// Foreign key reference details for a column
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnReference {
    pub schema: Option<String>,
    pub table: String,
    pub column: String,
    pub on_delete: Option<String>,
    pub on_update: Option<String>,
}

/// Request payload for creating a new table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTableRequest {
    pub schema: String,
    pub table_name: String,
    pub columns: Vec<TableColumnDefinition>,
    pub if_not_exists: bool,
}

/// Request payload for dropping a table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropTableRequest {
    pub schema: String,
    pub table_name: String,
    pub cascade: bool,
    pub if_exists: bool,
}

/// Request payload for adding a column to an existing table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTableColumnRequest {
    pub schema: String,
    pub table_name: String,
    pub column: TableColumnDefinition,
    pub if_not_exists: bool,
}

/// Request payload for dropping a column from an existing table
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropTableColumnRequest {
    pub schema: String,
    pub table_name: String,
    pub column_name: String,
    pub cascade: bool,
    pub if_exists: bool,
}

/// Row payload used for inserts and deletes
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRowData {
    pub values: BTreeMap<String, serde_json::Value>,
}

/// Request payload for creating a schema
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSchemaRequest {
    pub name: String,
    pub if_not_exists: bool,
}

/// Request payload for dropping a schema
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropSchemaRequest {
    pub name: String,
    pub cascade: bool,
    pub if_exists: bool,
}

/// Request payload for renaming a schema
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSchemaRequest {
    pub current_name: String,
    pub new_name: String,
}

/// Request payload for inserting a row
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertRowRequest {
    pub schema: String,
    pub table_name: String,
    pub row: TableRowData,
}

/// Request payload for deleting rows based on criteria
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRowRequest {
    pub schema: String,
    pub table_name: String,
    pub criteria: TableRowData,
    pub limit: Option<u32>,
}

/// Request payload for searching foreign key candidates
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeySearchRequest {
    pub schema: String,
    pub table: String,
    pub column: String,
    pub search: Option<String>,
    pub limit: Option<i64>,
}

/// Result returned when searching for foreign key candidates
#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeySearchResult {
    pub key: String,
    pub row: serde_json::Value,
}
