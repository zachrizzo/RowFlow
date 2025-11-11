use crate::ai::vector_store::EmbeddingRecord;
use crate::ai::EmbeddingState;
use crate::commands::database::row_to_json_value;
use crate::commands::schema::{qualified_table_name, quote_identifier, validate_identifier};
use crate::error::{Result, RowFlowError};
use crate::state::AppState;
use crate::types::{
    EmbeddingJobRequest, EmbeddingJobResult, EmbeddingSearchMatch, EmbeddingSearchRequest,
    EmbeddingTableMetadata, OllamaInstallInfo, OllamaStatus,
};

use blake3::Hasher;
use serde_json::Value;
use tauri::{State, Emitter};
use tokio_postgres::Row;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn check_ollama_status(state: State<'_, Mutex<EmbeddingState>>) -> Result<OllamaStatus> {
    let state = state.lock().await;
    state.ollama().status().await
}

#[tauri::command]
pub async fn get_ollama_install_info(state: State<'_, Mutex<EmbeddingState>>) -> Result<OllamaInstallInfo> {
    let state = state.lock().await;
    let bundler = state.bundler();
    let system_path = crate::ai::detect_system_ollama();

    Ok(OllamaInstallInfo {
        is_bundled: bundler.is_bundled(),
        is_installed: bundler.is_installed(),
        system_ollama_available: system_path.is_some(),
        system_ollama_path: system_path.map(|p| p.to_string_lossy().to_string()),
        models_dir: bundler.models_dir().to_string_lossy().to_string(),
        models_size: bundler.models_size().unwrap_or(0),
        models_size_formatted: crate::ai::format_bytes(bundler.models_size().unwrap_or(0)),
    })
}

#[tauri::command]
pub async fn install_ollama(state: State<'_, Mutex<EmbeddingState>>) -> Result<String> {
    let state = state.lock().await;
    let bundler = state.bundler();

    if !bundler.is_bundled() {
        return Err(RowFlowError::OllamaError(
            "Ollama is not bundled with this application".to_string(),
        ));
    }

    let path = bundler.install()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_ollama(state: State<'_, Mutex<EmbeddingState>>) -> Result<()> {
    let mut state = state.lock().await;
    state.start_supervised_ollama().await
}

#[tauri::command]
pub async fn stop_ollama(state: State<'_, Mutex<EmbeddingState>>) -> Result<()> {
    let state = state.lock().await;
    if let Some(supervisor) = state.supervisor() {
        supervisor.stop().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pull_ollama_model(
    app: tauri::AppHandle,
    state: State<'_, Mutex<EmbeddingState>>,
    model: String,
) -> Result<()> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err(RowFlowError::OllamaError("Model name cannot be empty".to_string()));
    }

    let endpoint = {
        let state = state.lock().await;
        state.ollama().endpoint().to_string()
    };

    // Use the existing pull_model but emit progress events
    // For now, we'll use a background task to emit progress
    let model_clone = model.clone();
    let app_clone = app.clone();
    
    tokio::spawn(async move {
        // Create HTTP client for streaming
        use reqwest::Client;
        use std::time::Duration;
        
        let http = match Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                    "model": model_clone,
                    "status": "error",
                    "message": format!("Failed to create HTTP client: {}", e),
                    "progress": null
                }));
                return;
            }
        };

        let url = format!("{}/api/pull", endpoint);
        let response = match http.post(&url).json(&serde_json::json!({ "name": model_clone })).send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                    "model": model_clone,
                    "status": "error",
                    "message": format!("Request failed: {}", e),
                    "progress": null
                }));
                return;
            }
        };

        let status_code = response.status();
        if !status_code.is_success() {
            let body = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
            let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                "model": model_clone,
                "status": "error",
                "message": format!("HTTP {}: {}", status_code, body),
                "progress": null
            }));
            return;
        }

        // Read response in chunks and parse JSON lines
        use futures_util::StreamExt;
        use bytes::Bytes;
        
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        
        while let Some(chunk_result) = stream.next().await {
            let chunk: Bytes = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                        "model": model_clone,
                        "status": "error",
                        "message": format!("Stream error: {}", e),
                        "progress": null
                    }));
                    return;
                }
            };
            
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            
            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].to_string();
                buffer = buffer[newline_pos + 1..].to_string();
                
                if line.trim().is_empty() {
                    continue;
                }

                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
                        let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                            "model": model_clone,
                            "status": "error",
                            "message": error,
                            "progress": null
                        }));
                        return;
                    }

                    if let Some(status) = value.get("status").and_then(|v| v.as_str()) {
                        if status.eq_ignore_ascii_case("success") {
                            let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                                "model": model_clone,
                                "status": "completed",
                                "message": "Model downloaded successfully",
                                "progress": 100.0
                            }));
                            return;
                        }
                        
                        let progress = if let Some(completed) = value.get("completed").and_then(|v| v.as_u64()) {
                            if let Some(total) = value.get("total").and_then(|v| v.as_u64()) {
                                if total > 0 {
                                    Some((completed as f64 / total as f64) * 100.0)
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        };

                        let message = if let Some(digest) = value.get("digest").and_then(|v| v.as_str()) {
                            format!("Downloading: {}", digest)
                        } else {
                            status.to_string()
                        };

                        let _ = app_clone.emit("ollama-pull-progress", serde_json::json!({
                            "model": model_clone,
                            "status": status,
                            "message": message,
                            "progress": progress
                        }));
                    }
                }
            }
        }
    });

    // Return immediately - progress will come via events
    Ok(())
}

#[tauri::command]
pub async fn embed_table(
    app_state: State<'_, AppState>,
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    request: EmbeddingJobRequest,
) -> Result<EmbeddingJobResult> {
    let embedding_state = embedding_state.lock().await;
    if request.columns.is_empty() {
        return Err(RowFlowError::InvalidInput(
            "At least one column must be selected for embedding".to_string(),
        ));
    }

    let table = qualified_table_name(&request.schema, &request.table)?;
    let columns: Vec<String> = request
        .columns
        .iter()
        .map(|column| {
            validate_identifier(column, "column")?;
            Ok(quote_identifier(column))
        })
        .collect::<Result<Vec<String>>>()?;

    let limit_clause = request
        .limit
        .filter(|limit| *limit > 0)
        .map(|limit| format!(" LIMIT {}", limit))
        .unwrap_or_else(|| String::new());

    let sql = format!("SELECT {} FROM {}{}", columns.join(", "), table, limit_clause);

    let client = app_state.get_client(&request.connection_id).await?;
    let rows = client.query(sql.as_str(), &[]).await?;

    let mut serialized_rows = Vec::with_capacity(rows.len());
    let mut metadata_values = Vec::with_capacity(rows.len());

    for (index, row) in rows.iter().enumerate() {
        let (content, metadata) = serialize_row(&request, row, index)?;
        serialized_rows.push(content);
        metadata_values.push(metadata);
    }

    let embeddings = embedding_state.ollama().embed(&request.model, &serialized_rows).await?;

    if embeddings.len() != serialized_rows.len() {
        return Err(RowFlowError::InternalError(
            "Embedding service returned mismatched results".to_string(),
        ));
    }

    let records = serialized_rows
        .into_iter()
        .zip(metadata_values.into_iter())
        .zip(embeddings.into_iter())
        .enumerate()
        .map(|(index, ((content, metadata), embedding))| EmbeddingRecord {
            connection_id: request.connection_id.clone(),
            schema_name: request.schema.clone(),
            table_name: request.table.clone(),
            row_reference: format!("row-{}", index + 1),
            chunk_hash: hash_record(&request, &metadata),
            content,
            metadata,
            embedding,
        })
        .collect::<Vec<_>>();

    let embedded_rows = embedding_state.vector_store().insert_embeddings(records).await?;

    Ok(EmbeddingJobResult { embedded_rows, skipped_rows: 0 })
}

#[tauri::command]
pub async fn search_embeddings(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    request: EmbeddingSearchRequest,
) -> Result<Vec<EmbeddingSearchMatch>> {
    let embedding_state = embedding_state.lock().await;
    let top_k = if request.top_k == 0 { 5 } else { request.top_k };

    let query_embeddings = embedding_state.ollama().embed(&request.model, &[request.query]).await?;
    let query_embedding = match query_embeddings.first() {
        Some(vector) => vector.clone(),
        None => return Ok(Vec::new()),
    };

    embedding_state
        .vector_store()
        .search(
            &request.connection_id,
            request.schema.as_deref(),
            request.table.as_deref(),
            &query_embedding,
            top_k,
        )
        .await
}

fn serialize_row(
    request: &EmbeddingJobRequest,
    row: &Row,
    index: usize,
) -> Result<(String, Value)> {
    use serde_json::Map;

    let mut metadata = Map::new();
    let mut lines = Vec::with_capacity(request.columns.len());

    for (col_index, column_name) in request.columns.iter().enumerate() {
        let column = row.columns().get(col_index).ok_or_else(|| {
            RowFlowError::InternalError("Unexpected column metadata mismatch".to_string())
        })?;

        let value = row_to_json_value(row, col_index, column.type_());
        metadata.insert(column_name.clone(), value.clone());

        let rendered = match value {
            Value::Null => "NULL".to_string(),
            Value::Bool(flag) => flag.to_string(),
            Value::Number(ref number) => number.to_string(),
            Value::String(ref string) => string.clone(),
            Value::Array(_) | Value::Object(_) => serde_json::to_string(&value)?,
        };

        lines.push(format!("{}: {}", column_name, rendered));
    }

    let content = format!(
        "Table: {}.{}\nRow: {}\n{}",
        request.schema,
        request.table,
        index + 1,
        lines.join("\n")
    );

    Ok((content, Value::Object(metadata)))
}

fn hash_record(request: &EmbeddingJobRequest, metadata: &Value) -> String {
    let mut hasher = Hasher::new();
    hasher.update(request.connection_id.as_bytes());
    hasher.update(request.schema.as_bytes());
    hasher.update(request.table.as_bytes());
    if let Ok(payload) = serde_json::to_vec(metadata) {
        hasher.update(&payload);
    }

    hasher.finalize().to_hex().to_string()
}

#[tauri::command]
pub async fn get_embedding_metadata(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    connection_id: String,
) -> Result<Vec<EmbeddingTableMetadata>> {
    let embedding_state = embedding_state.lock().await;
    embedding_state.vector_store().get_table_metadata(&connection_id).await
}

#[tauri::command]
pub async fn delete_table_embeddings(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<usize> {
    let embedding_state = embedding_state.lock().await;
    embedding_state
        .vector_store()
        .delete_table_embeddings(&connection_id, &schema, &table)
        .await
}

#[tauri::command]
pub async fn generate_sql_from_question(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    question: String,
    context: Option<String>,
    model: String,
) -> Result<String> {
    let embedding_state = embedding_state.lock().await;
    embedding_state
        .ollama()
        .generate(&model, &question, context.as_deref())
        .await
}

#[tauri::command]
pub async fn classify_user_message(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    message: String,
) -> Result<crate::ai::agent::AgentState> {
    let embedding_state = embedding_state.lock().await;
    let endpoint = embedding_state.ollama().endpoint().to_string();
    let chat_model = "qwen3:4b".to_string();
    
    let agent = crate::ai::Agent::new(endpoint, chat_model);
    agent.process_message(message).await
}
