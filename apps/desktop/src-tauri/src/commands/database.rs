use crate::error::Result;
use crate::state::AppState;
use crate::types::{ConnectionInfo, ConnectionProfile, FieldInfo, QueryResult};
use serde_json::Value;
use std::time::Instant;
use tauri::State;
use tokio_postgres::types::Type;

/// Connect to a PostgreSQL database
#[tauri::command]
pub async fn connect_database(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<String> {
    log::info!("Connecting to database: {}", profile.name);
    state.create_connection(profile).await
}

/// Disconnect from a database
#[tauri::command]
pub async fn disconnect_database(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<()> {
    log::info!("Disconnecting from database: {}", connection_id);
    state.remove_connection(&connection_id).await
}

/// Test a database connection
#[tauri::command]
pub async fn test_connection(
    profile: ConnectionProfile,
) -> Result<ConnectionInfo> {
    log::info!("Testing connection to: {}", profile.name);

    // Create a temporary state to test the connection
    let temp_state = AppState::new();
    let connection_id = temp_state.create_connection(profile.clone()).await?;

    // Get connection info
    let pool = temp_state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    // Query server information
    let version_row = client
        .query_one("SELECT version() as version", &[])
        .await?;
    let server_version: String = version_row.get(0);

    let info_query = r#"
        SELECT
            current_database() as database_name,
            current_user as username,
            current_setting('server_encoding') as server_encoding,
            current_setting('client_encoding') as client_encoding,
            pg_catalog.current_setting('is_superuser') as is_superuser,
            session_user,
            current_schema() as current_schema
    "#;

    let info_row = client.query_one(info_query, &[]).await?;

    let connection_info = ConnectionInfo {
        connection_id: connection_id.clone(),
        server_version,
        database_name: info_row.get(0),
        username: info_row.get(1),
        server_encoding: info_row.get(2),
        client_encoding: info_row.get(3),
        is_superuser: info_row.get::<_, String>(4) == "on",
        session_user: info_row.get(5),
        current_schema: info_row.get(6),
    };

    // Clean up temporary connection
    temp_state.remove_connection(&connection_id).await?;

    Ok(connection_info)
}

/// Execute a SQL query
#[tauri::command]
pub async fn execute_query(
    state: State<'_, AppState>,
    connection_id: String,
    sql: String,
    _params: Vec<Value>,
) -> Result<QueryResult> {
    log::info!("Executing query on connection: {}", connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let start = Instant::now();

    // Execute the query
    let statement = client.prepare(&sql).await?;
    let rows = client.query(&statement, &[]).await?;

    let execution_time = start.elapsed().as_secs_f64() * 1000.0;

    // Extract field information
    let fields: Vec<FieldInfo> = statement
        .columns()
        .iter()
        .map(|col| {
            let type_name = match col.type_() {
                &Type::BOOL => "boolean",
                &Type::INT2 | &Type::INT4 | &Type::INT8 => "integer",
                &Type::FLOAT4 | &Type::FLOAT8 => "float",
                &Type::NUMERIC => "numeric",
                &Type::TEXT | &Type::VARCHAR | &Type::BPCHAR => "text",
                &Type::BYTEA => "bytea",
                &Type::TIMESTAMP | &Type::TIMESTAMPTZ => "timestamp",
                &Type::DATE => "date",
                &Type::TIME | &Type::TIMETZ => "time",
                &Type::UUID => "uuid",
                &Type::JSON | &Type::JSONB => "json",
                _ => col.type_().name(),
            };

            FieldInfo {
                name: col.name().to_string(),
                type_oid: col.type_().oid(),
                type_name: type_name.to_string(),
                nullable: true, // PostgreSQL doesn't provide this info easily
            }
        })
        .collect();

    // Convert rows to JSON values
    let row_values: Vec<Value> = rows
        .iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (idx, col) in statement.columns().iter().enumerate() {
                let value = row_to_json_value(row, idx, col.type_());
                obj.insert(col.name().to_string(), value);
            }
            Value::Object(obj)
        })
        .collect();

    let row_count = row_values.len();

    Ok(QueryResult {
        fields,
        rows: row_values,
        row_count,
        execution_time,
        has_more: false,
    })
}

/// Execute a query with streaming support for large result sets
#[tauri::command]
pub async fn execute_query_stream(
    state: State<'_, AppState>,
    connection_id: String,
    sql: String,
    chunk_size: usize,
    offset: usize,
) -> Result<QueryResult> {
    log::info!(
        "Executing query with pagination on connection: {} (offset: {}, limit: {})",
        connection_id,
        offset,
        chunk_size
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    // Wrap the query with LIMIT and OFFSET
    let paginated_sql = format!(
        "SELECT * FROM ({}) AS subquery LIMIT {} OFFSET {}",
        sql, chunk_size + 1, offset
    );

    let start = Instant::now();

    // Execute the query
    let statement = client.prepare(&paginated_sql).await?;
    let rows = client.query(&statement, &[]).await?;

    let execution_time = start.elapsed().as_secs_f64() * 1000.0;

    let has_more = rows.len() > chunk_size;
    let rows_to_return = if has_more {
        &rows[..chunk_size]
    } else {
        &rows[..]
    };

    // Extract field information
    let fields: Vec<FieldInfo> = statement
        .columns()
        .iter()
        .map(|col| {
            let type_name = match col.type_() {
                &Type::BOOL => "boolean",
                &Type::INT2 | &Type::INT4 | &Type::INT8 => "integer",
                &Type::FLOAT4 | &Type::FLOAT8 => "float",
                &Type::NUMERIC => "numeric",
                &Type::TEXT | &Type::VARCHAR | &Type::BPCHAR => "text",
                &Type::BYTEA => "bytea",
                &Type::TIMESTAMP | &Type::TIMESTAMPTZ => "timestamp",
                &Type::DATE => "date",
                &Type::TIME | &Type::TIMETZ => "time",
                &Type::UUID => "uuid",
                &Type::JSON | &Type::JSONB => "json",
                _ => col.type_().name(),
            };

            FieldInfo {
                name: col.name().to_string(),
                type_oid: col.type_().oid(),
                type_name: type_name.to_string(),
                nullable: true,
            }
        })
        .collect();

    // Convert rows to JSON values
    let row_values: Vec<Value> = rows_to_return
        .iter()
        .map(|row| {
            let mut obj = serde_json::Map::new();
            for (idx, col) in statement.columns().iter().enumerate() {
                let value = row_to_json_value(row, idx, col.type_());
                obj.insert(col.name().to_string(), value);
            }
            Value::Object(obj)
        })
        .collect();

    let row_count = row_values.len();

    Ok(QueryResult {
        fields,
        rows: row_values,
        row_count,
        execution_time,
        has_more,
    })
}

/// Cancel a running query
#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    connection_id: String,
    backend_pid: i32,
) -> Result<()> {
    log::info!(
        "Cancelling query with PID {} on connection: {}",
        backend_pid,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    // Use pg_cancel_backend to cancel the query
    let query = "SELECT pg_cancel_backend($1)";
    client.execute(query, &[&backend_pid]).await?;

    Ok(())
}

/// Get the current backend process ID
#[tauri::command]
pub async fn get_backend_pid(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<i32> {
    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let row = client.query_one("SELECT pg_backend_pid()", &[]).await?;
    let pid: i32 = row.get(0);

    Ok(pid)
}

/// Helper function to convert a PostgreSQL row value to JSON
fn row_to_json_value(row: &tokio_postgres::Row, idx: usize, col_type: &Type) -> Value {
    match col_type {
        &Type::BOOL => row
            .try_get::<_, Option<bool>>(idx)
            .ok()
            .flatten()
            .map(Value::Bool)
            .unwrap_or(Value::Null),
        &Type::INT2 => row
            .try_get::<_, Option<i16>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::Number(v.into()))
            .unwrap_or(Value::Null),
        &Type::INT4 => row
            .try_get::<_, Option<i32>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::Number(v.into()))
            .unwrap_or(Value::Null),
        &Type::INT8 => row
            .try_get::<_, Option<i64>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::Number(v.into()))
            .unwrap_or(Value::Null),
        &Type::FLOAT4 => row
            .try_get::<_, Option<f32>>(idx)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(Value::Number)
            .unwrap_or(Value::Null),
        &Type::FLOAT8 => row
            .try_get::<_, Option<f64>>(idx)
            .ok()
            .flatten()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        &Type::TEXT | &Type::VARCHAR | &Type::BPCHAR | &Type::NAME => row
            .try_get::<_, Option<String>>(idx)
            .ok()
            .flatten()
            .map(Value::String)
            .unwrap_or(Value::Null),
        &Type::JSON | &Type::JSONB => row
            .try_get::<_, Option<Value>>(idx)
            .ok()
            .flatten()
            .unwrap_or(Value::Null),
        &Type::TIMESTAMP | &Type::TIMESTAMPTZ => row
            .try_get::<_, Option<chrono::NaiveDateTime>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_string()))
            .unwrap_or(Value::Null),
        &Type::DATE => row
            .try_get::<_, Option<chrono::NaiveDate>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_string()))
            .unwrap_or(Value::Null),
        _ => row
            .try_get::<_, Option<String>>(idx)
            .ok()
            .flatten()
            .map(Value::String)
            .unwrap_or(Value::Null),
    }
}

/// List connection profiles from MCP server .env file
#[tauri::command]
pub async fn list_mcp_profiles() -> Result<Vec<ConnectionProfile>> {
    use std::fs;
    use std::collections::HashMap;

    // Get MCP server .env file path
    // CARGO_MANIFEST_DIR = .../apps/desktop/src-tauri
    // parent = .../apps/desktop
    // parent = .../apps
    // join mcp-server = .../apps/mcp-server
    let mcp_env_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("mcp-server").join(".env"))
        .ok_or_else(|| crate::error::RowFlowError::InternalError("Failed to resolve MCP server path".to_string()))?;

    log::info!("Reading MCP profiles from: {:?}", mcp_env_path);

    // Read .env file
    let env_content = fs::read_to_string(&mcp_env_path)?;

    // Parse PG_PROFILE_* variables
    let mut profile_data: HashMap<String, HashMap<String, String>> = HashMap::new();

    for line in env_content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();

            if key.starts_with("PG_PROFILE_") {
                // Parse: PG_PROFILE_NAME_FIELD
                let remainder = &key["PG_PROFILE_".len()..];

                // Find the field name (HOST, PORT, etc.)
                let known_fields = ["HOST", "PORT", "DATABASE", "USER", "PASSWORD", "SSL", "MAX_CONNECTIONS"];
                for field in &known_fields {
                    if remainder.ends_with(&format!("_{}", field)) {
                        let profile_name = &remainder[..remainder.len() - field.len() - 1];
                        profile_data.entry(profile_name.to_string())
                            .or_insert_with(HashMap::new)
                            .insert(field.to_string(), value.to_string());
                        break;
                    }
                }
            }
        }
    }

    // Convert to ConnectionProfile structs
    let mut profiles = Vec::new();

    for (name, data) in profile_data {
        if let (Some(host), Some(port), Some(database), Some(user), Some(password)) = (
            data.get("HOST"),
            data.get("PORT"),
            data.get("DATABASE"),
            data.get("USER"),
            data.get("PASSWORD"),
        ) {
            let ssl_enabled = data.get("SSL").map(|s| s == "true").unwrap_or(false);

            profiles.push(ConnectionProfile {
                id: None,
                name: name.to_lowercase(),
                host: host.clone(),
                port: port.parse().unwrap_or(5432),
                database: database.clone(),
                username: user.clone(),
                password: Some(password.clone()),
                use_ssh: false,
                ssh_config: None,
                tls_config: if ssl_enabled {
                    Some(crate::types::TlsConfig {
                        enabled: true,
                        verify_ca: false,
                        ca_cert_path: None,
                        client_cert_path: None,
                        client_key_path: None,
                    })
                } else {
                    None
                },
                connection_timeout: None,
                statement_timeout: None,
                lock_timeout: None,
                idle_timeout: None,
                read_only: false,
            });
        }
    }

    log::info!("Found {} MCP profiles", profiles.len());
    Ok(profiles)
}
