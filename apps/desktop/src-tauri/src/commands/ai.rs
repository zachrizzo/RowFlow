use crate::ai::vector_store::EmbeddingRecord;
use crate::ai::EmbeddingState;
use crate::commands::database::row_to_json_value;
use crate::commands::schema::{qualified_table_name, quote_identifier, validate_identifier};
use crate::error::{Result, RowFlowError};
use crate::state::AppState;
use crate::types::{
    Column, EmbeddingJobRequest, EmbeddingJobResult, EmbeddingSearchMatch, EmbeddingSearchRequest,
    EmbeddingTableMetadata, GenerateTestDataRequest, GenerateTestDataResponse, GeneratedTestRow,
    OllamaInstallInfo, OllamaStatus,
};

use blake3::Hasher;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use tauri::{Emitter, State};
use tokio::sync::Mutex;
use tokio_postgres::Row;
use uuid::Uuid;

const DEFAULT_CHAT_MODEL: &str = "gemma3:4b";
const MAX_TEST_DATA_ROWS: usize = 25;
const UNIQUE_SAMPLE_LIMIT: i64 = 200;
const UNIQUE_PREVIEW_LIMIT: usize = 5;

#[tauri::command]
pub async fn check_ollama_status(state: State<'_, Mutex<EmbeddingState>>) -> Result<OllamaStatus> {
    let state = state.lock().await;
    state.ollama().status().await
}

#[tauri::command]
pub async fn get_ollama_install_info(
    state: State<'_, Mutex<EmbeddingState>>,
) -> Result<OllamaInstallInfo> {
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

        let http = match Client::builder().timeout(Duration::from_secs(300)).build() {
            Ok(c) => c,
            Err(e) => {
                let _ = app_clone.emit(
                    "ollama-pull-progress",
                    serde_json::json!({
                        "model": model_clone,
                        "status": "error",
                        "message": format!("Failed to create HTTP client: {}", e),
                        "progress": null
                    }),
                );
                return;
            }
        };

        let url = format!("{}/api/pull", endpoint);
        let response =
            match http.post(&url).json(&serde_json::json!({ "name": model_clone })).send().await {
                Ok(r) => r,
                Err(e) => {
                    let _ = app_clone.emit(
                        "ollama-pull-progress",
                        serde_json::json!({
                            "model": model_clone,
                            "status": "error",
                            "message": format!("Request failed: {}", e),
                            "progress": null
                        }),
                    );
                    return;
                }
            };

        let status_code = response.status();
        if !status_code.is_success() {
            let body = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
            let _ = app_clone.emit(
                "ollama-pull-progress",
                serde_json::json!({
                    "model": model_clone,
                    "status": "error",
                    "message": format!("HTTP {}: {}", status_code, body),
                    "progress": null
                }),
            );
            return;
        }

        // Read response in chunks and parse JSON lines
        use bytes::Bytes;
        use futures_util::StreamExt;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk: Bytes = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let _ = app_clone.emit(
                        "ollama-pull-progress",
                        serde_json::json!({
                            "model": model_clone,
                            "status": "error",
                            "message": format!("Stream error: {}", e),
                            "progress": null
                        }),
                    );
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
                        let _ = app_clone.emit(
                            "ollama-pull-progress",
                            serde_json::json!({
                                "model": model_clone,
                                "status": "error",
                                "message": error,
                                "progress": null
                            }),
                        );
                        return;
                    }

                    if let Some(status) = value.get("status").and_then(|v| v.as_str()) {
                        if status.eq_ignore_ascii_case("success") {
                            let _ = app_clone.emit(
                                "ollama-pull-progress",
                                serde_json::json!({
                                    "model": model_clone,
                                    "status": "completed",
                                    "message": "Model downloaded successfully",
                                    "progress": 100.0
                                }),
                            );
                            return;
                        }

                        let progress = if let Some(completed) =
                            value.get("completed").and_then(|v| v.as_u64())
                        {
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

                        let message =
                            if let Some(digest) = value.get("digest").and_then(|v| v.as_str()) {
                                format!("Downloading: {}", digest)
                            } else {
                                status.to_string()
                            };

                        let _ = app_clone.emit(
                            "ollama-pull-progress",
                            serde_json::json!({
                                "model": model_clone,
                                "status": status,
                                "message": message,
                                "progress": progress
                            }),
                        );
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

fn type_example_for_column(column: &Column) -> (Value, &'static str) {
    let data_type = column.data_type.to_lowercase();

    if data_type.contains("array") || column.data_type.ends_with("[]") {
        return (json!(["example", "value"]), "array");
    }

    // Return (example_value, type_description)
    // Check boolean BEFORE integer (since "boolean" might be confused with int checks)
    if data_type.contains("bool") {
        return (json!(true), "boolean");
    }

    if column.is_primary_key || data_type.contains("int") || data_type.contains("serial") {
        return (json!(0), "integer");
    }

    if data_type.contains("numeric") || data_type.contains("decimal") {
        return (json!(0.0), "decimal");
    }

    if data_type.contains("real") || data_type.contains("float") || data_type.contains("double") {
        return (json!(0.0), "float");
    }

    if data_type.contains("timestamp") {
        return (json!("2024-01-01T00:00:00Z"), "timestamp (ISO 8601)");
    }

    if data_type.contains("date") {
        return (json!("2024-01-01"), "date (YYYY-MM-DD)");
    }

    if data_type.contains("time") {
        return (json!("00:00:00"), "time (HH:MM:SS)");
    }

    if data_type.contains("json") {
        return (json!({}), "json object");
    }

    if data_type.contains("uuid") {
        return (json!("00000000-0000-0000-0000-000000000000"), "uuid");
    }

    (json!(""), "text")
}

fn should_skip_column(column: &Column) -> bool {
    if column.column_default.is_none() {
        return false; // No default, don't skip
    }

    // Check if it's an auto-generated default we should skip
    let default_str = column.column_default.as_ref().unwrap().to_lowercase();
    default_str.contains("nextval") || // SERIAL/SEQUENCE
    default_str.contains("now()") ||    // Timestamp defaults
    default_str.contains("current_timestamp") ||
    default_str.contains("gen_random_uuid") ||
    default_str.contains("uuid_generate")
}

#[derive(Debug, Default, Clone)]
struct UniqueColumnSample {
    seen: HashSet<String>,
    preview: Vec<String>,
}

type UniqueColumnSamples = HashMap<String, UniqueColumnSample>;

impl UniqueColumnSample {
    fn record(&mut self, value: String) {
        if self.seen.insert(value.clone()) && self.preview.len() < UNIQUE_PREVIEW_LIMIT {
            self.preview.push(value);
        }
    }
}

#[derive(Debug, Default)]
struct UniqueValueTracker {
    used: HashMap<String, HashSet<String>>,
}

impl UniqueValueTracker {
    fn from_samples(samples: &UniqueColumnSamples) -> Self {
        let mut used = HashMap::new();
        for (column, sample) in samples {
            used.insert(column.clone(), sample.seen.clone());
        }
        Self { used }
    }

    fn contains(&self, column: &str, candidate: &str) -> bool {
        self.used.get(column).map(|set| set.contains(candidate)).unwrap_or(false)
    }

    fn register(&mut self, column: &str, value: &str) {
        self.used.entry(column.to_string()).or_default().insert(value.to_string());
    }

    fn ensure_unique_string(&mut self, column: &Column, candidate: Option<&str>) -> String {
        let base = candidate
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(String::from)
            .unwrap_or_else(|| default_seed_for_column(column));

        if !self.contains(&column.name, &base) {
            self.register(&column.name, &base);
            return base;
        }

        for attempt in 0..32 {
            let mutated = mutate_string_value(column, &base, attempt);
            if !self.contains(&column.name, &mutated) {
                self.register(&column.name, &mutated);
                return mutated;
            }
        }

        let fallback = format!("{}-{}", sanitize_identifier(&base), random_suffix());
        self.register(&column.name, &fallback);
        fallback
    }
}

fn random_suffix() -> String {
    Uuid::new_v4().to_string().split('-').next().unwrap_or("0000").to_string()
}

fn sanitize_identifier(text: &str) -> String {
    let mut sanitized = text
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>();
    if sanitized.is_empty() {
        sanitized.push_str("value");
    }
    sanitized.truncate(48);
    sanitized.trim_matches('_').to_string()
}

fn mutate_email_value(value: &str, suffix: &str) -> String {
    if let Some((local, domain)) = value.split_once('@') {
        let cleaned_local = local.split('+').next().unwrap_or(local);
        if !cleaned_local.is_empty() && !domain.is_empty() {
            return format!("{}+{}@{}", cleaned_local, suffix, domain);
        }
    }
    format!("user+{}@example.com", suffix)
}

fn mutate_string_value(column: &Column, base: &str, attempt: usize) -> String {
    let suffix = format!("{}{:02}", random_suffix(), attempt);
    let lowered = column.name.to_ascii_lowercase();
    if lowered.contains("email") {
        return mutate_email_value(base, &suffix);
    }

    if lowered.contains("username")
        || lowered.contains("user_name")
        || lowered.contains("slug")
        || lowered.contains("handle")
        || lowered.contains("code")
    {
        return format!("{}_{suffix}", sanitize_identifier(base));
    }

    format!("{}_{suffix}", sanitize_identifier(base))
}

fn default_seed_for_column(column: &Column) -> String {
    if is_uuid_column(column) {
        return Uuid::new_v4().to_string();
    }

    if column.name.to_ascii_lowercase().contains("email") {
        return format!("{}@example.com", sanitize_identifier(&column.name));
    }

    format!("{}-{}", sanitize_identifier(&column.name), random_suffix())
}

fn is_uuid_column(column: &Column) -> bool {
    column.data_type.to_ascii_lowercase().contains("uuid")
}

fn is_text_like_column(column: &Column) -> bool {
    let data_type = column.data_type.to_ascii_lowercase();
    data_type.contains("char") || data_type.contains("text") || data_type.contains("citext")
}

fn json_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        Value::Number(num) => Some(num.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        other => serde_json::to_string(other).ok(),
    }
}

async fn fetch_unique_column_samples(
    app_state: &State<'_, AppState>,
    connection_id: &str,
    schema: &str,
    table: &str,
    columns: &[Column],
) -> Result<UniqueColumnSamples> {
    let mut samples = UniqueColumnSamples::new();
    let candidate_columns: Vec<&Column> = columns
        .iter()
        .filter(|column| (column.is_unique || column.is_primary_key) && !should_skip_column(column))
        .collect();

    if candidate_columns.is_empty() {
        return Ok(samples);
    }

    let client = app_state.get_client(connection_id).await?;
    let qualified_table = qualified_table_name(schema, table)?;

    for column in candidate_columns {
        let ident = quote_identifier(&column.name);
        let query = format!(
            "SELECT {ident} FROM {table} WHERE {ident} IS NOT NULL LIMIT {limit}",
            ident = ident,
            table = qualified_table,
            limit = UNIQUE_SAMPLE_LIMIT
        );

        match client.query(query.as_str(), &[]).await {
            Ok(rows) => {
                let mut sample = UniqueColumnSample::default();
                for row in rows {
                    if let Some(column_meta) = row.columns().first() {
                        let value = row_to_json_value(&row, 0, column_meta.type_());
                        if let Some(text) = json_value_to_string(&value) {
                            sample.record(text);
                        }
                    }
                }

                if !sample.seen.is_empty() {
                    samples.insert(column.name.clone(), sample);
                }
            }
            Err(error) => {
                log::warn!(
                    "[generate_test_data] Failed to inspect existing values for {}.{}: {}",
                    schema,
                    column.name,
                    error
                );
            }
        }
    }

    Ok(samples)
}

fn build_unique_constraints_prompt(
    columns: &[Column],
    samples: &UniqueColumnSamples,
) -> Option<String> {
    let mut lines = Vec::new();
    for column in columns {
        if !column.is_unique && !column.is_primary_key {
            continue;
        }
        if should_skip_column(column) {
            continue;
        }

        let mut line = format!("- Column '{}' must be unique.", column.name);
        if let Some(sample) = samples.get(&column.name) {
            if !sample.preview.is_empty() {
                let preview = sample.preview.join(", ");
                line.push_str(&format!(" Avoid existing values such as: {}", preview));
            }
        }
        lines.push(line);
    }

    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

fn enforce_unique_constraints(
    row: &mut Map<String, Value>,
    columns: &[Column],
    tracker: &mut UniqueValueTracker,
) {
    for column in columns {
        if (!column.is_unique && !column.is_primary_key) || should_skip_column(column) {
            continue;
        }

        if is_uuid_column(column) {
            let value = Uuid::new_v4().to_string();
            tracker.register(&column.name, &value);
            row.insert(column.name.clone(), Value::String(value));
            continue;
        }

        if !is_text_like_column(column) {
            continue;
        }

        let existing_value = row.get(&column.name).and_then(|value| value.as_str());
        let enforced = tracker.ensure_unique_string(column, existing_value);
        row.insert(column.name.clone(), Value::String(enforced));
    }
}

fn build_example_row_with_types(columns: &[Column]) -> (Value, String) {
    let mut map = serde_json::Map::new();
    let mut type_hints = Vec::new();

    for column in columns.iter() {
        // Skip columns with auto-generated defaults
        if should_skip_column(column) {
            log::debug!(
                "[build_example_row] Skipping column '{}' with auto-generated default: {:?}",
                column.name,
                column.column_default
            );
            continue;
        }

        let (example_value, type_desc) = type_example_for_column(column);
        let nullable = if column.is_nullable { " (nullable)" } else { "" };

        log::debug!(
            "[build_example_row] Including column '{}' ({}): {:?}",
            column.name,
            column.data_type,
            example_value
        );

        map.insert(column.name.clone(), example_value);
        type_hints.push(format!("  - {}: {} {}", column.name, type_desc, nullable));
    }

    (Value::Object(map), type_hints.join("\n"))
}

struct TemplatePromptContext {
    template_row: Value,
    example_rows_text: Option<String>,
}

fn build_template_prompt_context(
    base_template: &Value,
    user_template: Option<&Value>,
) -> TemplatePromptContext {
    let mut context =
        TemplatePromptContext { template_row: base_template.clone(), example_rows_text: None };

    match user_template {
        Some(Value::Object(map)) => {
            context.template_row = merge_with_template(base_template, map);
        }
        Some(Value::Array(items)) => {
            let mut examples = Vec::new();
            for value in items {
                if let Value::Object(obj) = value {
                    examples.push(Value::Object(obj.clone()));
                }
            }

            if let Some(Value::Object(first)) = examples.first() {
                context.template_row = merge_with_template(base_template, first);
            }

            context.example_rows_text = format_example_rows(&examples);
        }
        _ => {}
    }

    context
}

fn merge_with_template(base_template: &Value, overlay: &Map<String, Value>) -> Value {
    if let Value::Object(base_map) = base_template {
        let mut merged = base_map.clone();
        for (key, value) in overlay {
            merged.insert(key.clone(), value.clone());
        }
        Value::Object(merged)
    } else {
        Value::Object(overlay.clone())
    }
}

fn format_example_rows(examples: &[Value]) -> Option<String> {
    if examples.is_empty() {
        return None;
    }

    let preview_count = examples.len().min(3);
    let mut formatted = Vec::new();

    for example in examples.iter().take(preview_count) {
        match serde_json::to_string_pretty(example) {
            Ok(text) => formatted.push(text),
            Err(_) => continue,
        }
    }

    if formatted.is_empty() {
        return None;
    }

    let mut combined = formatted.join("\n---\n");
    if examples.len() > preview_count {
        combined
            .push_str(&format!("\n... plus {} more example(s)", examples.len() - preview_count));
    }

    if combined.len() > 2000 {
        combined.truncate(2000);
        combined.push_str("\n...truncated");
    }

    Some(combined)
}

fn strip_code_fences(output: &str) -> String {
    let mut trimmed = output.trim().to_string();

    if trimmed.starts_with("```") {
        trimmed = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```JSON")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string();
    }

    if trimmed.to_ascii_lowercase().starts_with("json\n") {
        trimmed = trimmed[5..].trim_start().to_string();
    }

    trimmed
}

fn extract_rows_from_value(value: Value) -> Option<Vec<Value>> {
    match value {
        Value::Array(items) => Some(items),
        Value::Object(mut map) => map.remove("rows").and_then(|rows| rows.as_array().cloned()),
        _ => None,
    }
}

fn parse_value(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok().or_else(|| json5::from_str(text).ok())
}

fn parse_rows_from_output(output: &str) -> Result<Vec<Value>> {
    let cleaned = strip_code_fences(output);
    if let Some(value) = parse_value(&cleaned) {
        if let Some(rows) = extract_rows_from_value(value.clone()) {
            return Ok(rows);
        }
        if value.is_object() {
            return Ok(vec![value]);
        }
    }

    if let (Some(start), Some(end)) = (cleaned.find('['), cleaned.rfind(']')) {
        if end > start {
            let slice = &cleaned[start..=end];
            if let Some(value) = parse_value(slice) {
                if let Some(rows) = extract_rows_from_value(value.clone()) {
                    return Ok(rows);
                }
                if value.is_object() {
                    return Ok(vec![value]);
                }
            }
        }
    }

    if let Some(rows) = extract_rows_from_objects(&cleaned) {
        return Ok(rows);
    }

    let preview = cleaned.chars().take(400).collect::<String>();
    log::warn!("[generate_test_data] Failed to parse model output: {}", preview);

    Err(RowFlowError::OllamaError(format!(
        "Model response was not valid JSON. Response preview: {}",
        preview
    )))
}

fn extract_rows_from_objects(text: &str) -> Option<Vec<Value>> {
    let mut rows = Vec::new();
    let mut depth = 0usize;
    let mut start_idx = None;
    let mut in_string = false;
    let mut escape = false;
    let chars: Vec<char> = text.chars().collect();

    let mut idx = 0;
    while idx < chars.len() {
        let ch = chars[idx];

        if in_string {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            idx += 1;
            continue;
        }

        match ch {
            '"' => {
                in_string = true;
            }
            '{' => {
                if depth == 0 {
                    start_idx = Some(idx);
                }
                depth += 1;
            }
            '}' => {
                if depth > 0 {
                    depth -= 1;
                    if depth == 0 {
                        if let Some(start) = start_idx {
                            let slice: String = chars[start..=idx].iter().collect();
                            if let Some(value) = parse_value(&slice) {
                                rows.push(value);
                            }
                        }
                        start_idx = None;
                    }
                }
            }
            _ => {}
        }

        idx += 1;
    }

    if rows.is_empty() {
        None
    } else {
        Some(rows)
    }
}

fn project_row_to_columns(value: &Value, columns: &[Column]) -> Option<Value> {
    let source = value.as_object()?;
    let mut map = serde_json::Map::new();

    for column in columns {
        // Skip columns with auto-generated defaults
        if should_skip_column(column) {
            continue;
        }

        if let Some(val) = source.get(&column.name) {
            map.insert(column.name.clone(), val.clone());
        } else if !column.is_nullable {
            log::warn!(
                "[generate_test_data] Missing required column '{}' in model output",
                column.name
            );
            return None;
        }
        // Skip optional columns that aren't provided
    }

    Some(Value::Object(map))
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
    embedding_state.vector_store().delete_table_embeddings(&connection_id, &schema, &table).await
}

#[tauri::command]
pub async fn generate_sql_from_question(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    question: String,
    context: Option<String>,
    model: String,
) -> Result<String> {
    let embedding_state = embedding_state.lock().await;
    embedding_state.ollama().generate(&model, &question, context.as_deref()).await
}

#[tauri::command]
pub async fn generate_test_data(
    app_state: State<'_, AppState>,
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    request: GenerateTestDataRequest,
) -> Result<GenerateTestDataResponse> {
    if request.row_count == 0 {
        return Err(RowFlowError::InvalidInput("Row count must be at least 1".to_string()));
    }

    if request.row_count > MAX_TEST_DATA_ROWS {
        return Err(RowFlowError::InvalidInput(format!(
            "Row count cannot exceed {}",
            MAX_TEST_DATA_ROWS
        )));
    }

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table, "table")?;

    let columns = crate::commands::schema::get_table_columns(
        app_state.clone(),
        request.connection_id.clone(),
        request.schema.clone(),
        request.table.clone(),
    )
    .await?;

    if columns.is_empty() {
        return Err(RowFlowError::InvalidInput("Selected table has no columns".to_string()));
    }

    let unique_samples = match fetch_unique_column_samples(
        &app_state,
        &request.connection_id,
        &request.schema,
        &request.table,
        &columns,
    )
    .await
    {
        Ok(samples) => samples,
        Err(error) => {
            log::warn!(
                "[generate_test_data] Unable to inspect unique columns on {}.{}: {}",
                request.schema,
                request.table,
                error
            );
            UniqueColumnSamples::new()
        }
    };

    // Build example row with type information and merge any user-provided template/context
    let (base_template, type_hints) = build_example_row_with_types(&columns);
    let template_context =
        build_template_prompt_context(&base_template, request.user_template.as_ref());

    let example_json = serde_json::to_string_pretty(&template_context.template_row)
        .unwrap_or_else(|_| "{}".to_string());

    log::info!("[generate_test_data] Example row format:\n{}", example_json);

    // Build prompt for generating a single row
    let mut prompt = String::new();
    prompt.push_str("Generate 1 realistic test data row for a database table.\n\n");

    prompt.push_str("Column types:\n");
    prompt.push_str(&type_hints);
    prompt.push_str("\n\n");

    if let Some(unique_notes) = build_unique_constraints_prompt(&columns, &unique_samples) {
        prompt.push_str("Constraints:\n");
        prompt.push_str(&unique_notes);
        prompt.push_str("\n\n");
    }

    prompt.push_str("Template structure:\n");
    prompt.push_str(&example_json);
    prompt.push_str("\n\n");

    if let Some(example_rows_text) = template_context.example_rows_text.as_ref() {
        prompt.push_str("User-provided example rows to mimic style:\n");
        prompt.push_str(example_rows_text);
        prompt.push_str("\n\n");
    }

    if let Some(instructions) = request.instructions.as_ref().filter(|s| !s.trim().is_empty()) {
        prompt.push_str("Additional instructions:\n");
        prompt.push_str(&format!("{}\n\n", instructions.trim()));
    }

    prompt.push_str(
        "IMPORTANT:\n\
        - Return ONLY a single JSON object (not an array)\n\
        - Include every column listed above (required columns must not be null)\n\
        - Use the exact field names from the template and column list\n\
        - Match the data types exactly (integers as numbers, booleans as true/false, dates as strings in ISO format, etc.)\n\
        - Generate realistic, varied data that makes sense for each field\n\
        - Do NOT include any explanatory text, markdown formatting, or code fences\n\
        - Return pure JSON only"
    );

    let model = DEFAULT_CHAT_MODEL.to_string();

    // Clone the Ollama client so we don't hold the global lock during long-running generations
    let ollama_client = {
        let state = embedding_state.lock().await;
        state.ollama().clone()
    };

    let ollama_status = ollama_client.status().await?;

    if !ollama_status.available {
        // Check if Ollama is installed
        let install_info = {
            let state = embedding_state.lock().await;
            let bundler = state.bundler();
            let system_path = crate::ai::detect_system_ollama();
            (bundler.is_installed(), bundler.is_bundled(), system_path.is_some())
        };

        let error_msg = if !install_info.0 && !install_info.2 {
            if install_info.1 {
                "Ollama is not installed. Please install it in Settings > AI Models.".to_string()
            } else {
                "Ollama is not installed and no bundled version is available. Please install Ollama to use AI features.".to_string()
            }
        } else {
            "Ollama is not running. Please start Ollama in Settings > AI Models.".to_string()
        };

        return Err(RowFlowError::OllamaError(error_msg));
    }

    let model_available = ollama_status.models.iter().any(|m| {
        m.name == model
            || m.name.starts_with(&format!("{}:", model.split(':').next().unwrap_or(&model)))
    });

    if !model_available {
        // Check if Ollama is installed
        let install_info = {
            let state = embedding_state.lock().await;
            let bundler = state.bundler();
            let system_path = crate::ai::detect_system_ollama();
            (bundler.is_installed(), bundler.is_bundled(), system_path.is_some())
        };

        let error_msg = if !install_info.0 && !install_info.2 {
            if install_info.1 {
                format!(
                    "Model '{}' is not installed. Ollama is also not installed. Please install Ollama first, then install the model in Settings > AI Models.",
                    model
                )
            } else {
                format!(
                    "Model '{}' is not installed. Ollama is not installed and no bundled version is available. Please install Ollama to use AI features.",
                    model
                )
            }
        } else {
            format!(
                "Model '{}' is not installed. Please install it in Settings > AI Models.",
                model
            )
        };

        return Err(RowFlowError::OllamaError(error_msg));
    }

    log::info!("[generate_test_data] Using model: {}", model);
    log::info!("[generate_test_data] Generating {} rows one at a time", request.row_count);
    log::info!("[generate_test_data] Prompt template: {}", prompt);

    // Generate rows, retrying when the model omits required data
    let mut projected_rows = Vec::new();
    let mut attempts = 0usize;
    let mut max_attempts = request.row_count.saturating_mul(3);
    let mut unique_tracker = UniqueValueTracker::from_samples(&unique_samples);
    if max_attempts < 3 {
        max_attempts = 3;
    }

    while projected_rows.len() < request.row_count && attempts < max_attempts {
        attempts += 1;
        let target_row_index = projected_rows.len() + 1;
        log::info!(
            "[generate_test_data] Generating row attempt {}/{} (target row {}/{})",
            attempts,
            max_attempts,
            target_row_index,
            request.row_count
        );

        // Try with JSON mode first, fallback to regular mode if empty
        let mut response_text = ollama_client.generate_json(&model, &prompt).await?;

        if response_text.is_empty() {
            log::warn!("[generate_test_data] JSON mode returned empty response, trying without format constraint");
            response_text = ollama_client.complete(&model, &prompt).await?;
        }

        if response_text.is_empty() {
            log::error!(
                "[generate_test_data] Model returned empty response on attempt {}",
                attempts
            );
            continue;
        }

        log::debug!(
            "[generate_test_data] Attempt {} response (first 500 chars): {}",
            attempts,
            response_text.chars().take(500).collect::<String>()
        );

        // Parse the single row from output
        let raw_rows = parse_rows_from_output(&response_text)?;
        if raw_rows.is_empty() {
            log::warn!(
                "[generate_test_data] Failed to parse response on attempt {}, skipping",
                attempts
            );
            continue;
        }

        // Take the first parsed object and project it to the columns
        if let Some(raw_row) = raw_rows.into_iter().next() {
            if let Some(projected) = project_row_to_columns(&raw_row, &columns) {
                let mut values = projected;
                if let Value::Object(ref mut map) = values {
                    enforce_unique_constraints(map, &columns, &mut unique_tracker);
                }
                projected_rows.push(GeneratedTestRow { values });
                log::info!(
                    "[generate_test_data] Successfully generated row {}/{}",
                    projected_rows.len(),
                    request.row_count
                );
            } else {
                log::warn!(
                    "[generate_test_data] Generated row on attempt {} was missing required columns",
                    attempts
                );
            }
        }
    }

    if projected_rows.len() < request.row_count {
        log::warn!(
            "[generate_test_data] Only generated {} out of {} requested rows after {} attempts",
            projected_rows.len(),
            request.row_count,
            attempts
        );
    }

    if projected_rows.is_empty() {
        return Err(RowFlowError::OllamaError(
            "Failed to generate any valid rows. Please check the model and try again.".to_string(),
        ));
    }

    log::info!(
        "[generate_test_data] Successfully generated {} out of {} requested rows",
        projected_rows.len(),
        request.row_count
    );
    Ok(GenerateTestDataResponse { rows: projected_rows, model })
}

#[tauri::command]
pub async fn classify_user_message(
    embedding_state: State<'_, Mutex<EmbeddingState>>,
    message: String,
) -> Result<crate::ai::agent::AgentState> {
    let embedding_state = embedding_state.lock().await;
    let endpoint = embedding_state.ollama().endpoint().to_string();
    let chat_model = DEFAULT_CHAT_MODEL.to_string();

    let agent = crate::ai::Agent::new(endpoint, chat_model);
    agent.process_message(message).await
}
