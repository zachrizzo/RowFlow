use super::schema::{
    get_table_columns, qualified_table_name, quote_identifier, validate_identifier,
};
use crate::error::{Result, RowFlowError};
use crate::state::AppState;
use crate::types::{
    Column, ConnectionInfo, ConnectionProfile, DeleteRowRequest, FieldInfo,
    ForeignKeySearchRequest, ForeignKeySearchResult, InsertRowRequest, QueryResult,
};
use serde_json::{Number, Value};
use std::collections::HashMap;
use std::convert::TryFrom;
use std::str::FromStr;
use std::time::Instant;
use tauri::State;
use tokio_postgres::types::{FromSqlOwned, Json, ToSql, Type};
use uuid::Uuid;

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
pub async fn disconnect_database(state: State<'_, AppState>, connection_id: String) -> Result<()> {
    log::info!("Disconnecting from database: {}", connection_id);
    state.remove_connection(&connection_id).await
}

/// Test a database connection
#[tauri::command]
pub async fn test_connection(profile: ConnectionProfile) -> Result<ConnectionInfo> {
    log::info!("Testing connection to: {}", profile.name);

    // Create a temporary state to test the connection
    let temp_state = AppState::new();
    let connection_id = temp_state.create_connection(profile.clone()).await?;

    // Get connection info
    let client = temp_state.get_client(&connection_id).await?;

    // Query server information
    let version_row = client.query_one("SELECT version() as version", &[]).await?;
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

    drop(client);

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
    params: Vec<Value>,
) -> Result<QueryResult> {
    log::info!("Executing query on connection: {}", connection_id);

    let client = state.get_client(&connection_id).await?;

    let start = Instant::now();

    // Execute the query
    let statement = client.prepare(&sql).await?;
    let converted_params = convert_params(&params, statement.params())?;
    let param_refs: Vec<&(dyn ToSql + Sync)> =
        converted_params.iter().map(ConvertedParam::as_sql).collect();
    let rows = client.query(&statement, &param_refs).await?;

    let execution_time = start.elapsed().as_secs_f64() * 1000.0;

    // Extract field information
    let fields: Vec<FieldInfo> = statement
        .columns()
        .iter()
        .map(|col| FieldInfo {
            name: col.name().to_string(),
            type_oid: col.type_().oid(),
            type_name: pg_type_to_name(col.type_()).to_string(),
            nullable: true, // PostgreSQL doesn't provide this info easily
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

    Ok(QueryResult { fields, rows: row_values, row_count, execution_time, has_more: false })
}

/// Execute a SQL statement that modifies data and returns the affected row count.
#[tauri::command]
pub async fn execute_update(
    state: State<'_, AppState>,
    connection_id: String,
    sql: String,
) -> Result<u64> {
    log::info!("Executing update on connection: {}", connection_id);

    let client = state.get_client(&connection_id).await?;

    let sanitized_sql = sanitize_sql_for_wrapping(&sql);

    let start = Instant::now();

    let statement = client.prepare(&sanitized_sql).await?;
    let affected = client.execute(&statement, &[]).await?;

    let duration = start.elapsed().as_secs_f64() * 1000.0;
    log::info!("Update completed: {} rows affected in {:.2}ms", affected, duration);

    Ok(affected)
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

    let client = state.get_client(&connection_id).await?;

    // Wrap the query with LIMIT and OFFSET
    let paginated_sql = format!(
        "SELECT * FROM ({}) AS subquery LIMIT {} OFFSET {}",
        sanitize_sql_for_wrapping(&sql),
        chunk_size + 1,
        offset
    );

    let start = Instant::now();

    // Execute the query
    let statement = client.prepare(&paginated_sql).await?;
    let rows = client.query(&statement, &[]).await?;

    let execution_time = start.elapsed().as_secs_f64() * 1000.0;

    let has_more = rows.len() > chunk_size;
    let rows_to_return = if has_more { &rows[..chunk_size] } else { &rows[..] };

    // Extract field information
    let fields: Vec<FieldInfo> = statement
        .columns()
        .iter()
        .map(|col| FieldInfo {
            name: col.name().to_string(),
            type_oid: col.type_().oid(),
            type_name: pg_type_to_name(col.type_()).to_string(),
            nullable: true,
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

    Ok(QueryResult { fields, rows: row_values, row_count, execution_time, has_more })
}

/// Map PostgreSQL type to a simplified type name string
fn pg_type_to_name(pg_type: &Type) -> &str {
    match pg_type {
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
        _ => pg_type.name(),
    }
}

/// Normalize SQL so it can be wrapped inside a subquery without syntax errors.
fn sanitize_sql_for_wrapping(sql: &str) -> String {
    let trimmed = sql.trim();
    let sanitized = trimmed.trim_end_matches(&[';', ' ', '\t', '\n', '\r']);
    sanitized.to_string()
}

fn escape_sql_string(value: &str) -> String {
    value.replace('\'', "''")
}

fn value_to_sql_literal(value: &Value, column: &Column) -> Result<String> {
    if is_array_column(column) {
        return Ok(value_to_array_literal(value));
    }

    if is_json_column(column) {
        let json_text = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
        let cast = json_cast_for_column(column).unwrap_or("::jsonb");
        return Ok(format!("'{}'{}", escape_sql_string(&json_text), cast));
    }

    if is_numeric_column(column) {
        let literal = match value {
            Value::Null => "NULL".to_string(),
            Value::Number(num) => num.to_string(),
            Value::String(text) => text.clone(),
            Value::Bool(flag) => {
                if *flag {
                    "1".to_string()
                } else {
                    "0".to_string()
                }
            }
            _ => value.to_string(),
        };
        return Ok(literal);
    }

    let literal = match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => if *b { "TRUE" } else { "FALSE" }.to_string(),
        Value::Number(num) => {
            if let Some(i) = num.as_i64() {
                i.to_string()
            } else if let Some(u) = num.as_u64() {
                u.to_string()
            } else if let Some(f) = num.as_f64() {
                if f.is_finite() {
                    f.to_string()
                } else {
                    "NULL".to_string()
                }
            } else {
                "NULL".to_string()
            }
        }
        Value::String(text) => format!("'{}'", escape_sql_string(text)),
        Value::Array(_) | Value::Object(_) => match serde_json::to_string(value) {
            Ok(json) => format!("'{}'", escape_sql_string(&json)),
            Err(_) => "NULL".to_string(),
        },
    };

    Ok(literal)
}

fn is_array_column(column: &Column) -> bool {
    let data_type = column.data_type.to_ascii_lowercase();
    data_type.contains("array") || data_type.ends_with("[]")
}

fn is_numeric_column(column: &Column) -> bool {
    let data_type = column.data_type.to_ascii_lowercase();
    data_type.contains("numeric") || data_type.contains("decimal")
}

fn json_cast_for_column(column: &Column) -> Option<&'static str> {
    let data_type = column.data_type.to_ascii_lowercase();
    match data_type.as_str() {
        "json" => Some("::json"),
        "jsonb" => Some("::jsonb"),
        _ => None,
    }
}

fn is_json_column(column: &Column) -> bool {
    json_cast_for_column(column).is_some()
}

fn escape_array_element(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\")")
}

fn format_array_elements(values: &[Value]) -> String {
    values
        .iter()
        .map(|value| match value {
            Value::Array(nested) => format!("{{{}}}", format_array_elements(nested)),
            Value::String(text) => format!("\"{}\"", escape_array_element(text)),
            Value::Number(num) => num.to_string(),
            Value::Bool(flag) => if *flag { "TRUE" } else { "FALSE" }.to_string(),
            Value::Null => "NULL".to_string(),
            Value::Object(obj) => {
                let json = serde_json::to_string(obj).unwrap_or_else(|_| "{}".to_string());
                format!("\"{}\"", escape_array_element(&json))
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn build_array_literal(values: &[Value]) -> String {
    if values.is_empty() {
        "'{}'".to_string()
    } else {
        format!("'{{{}}}'", format_array_elements(values))
    }
}

fn value_to_array_literal(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Array(items) => build_array_literal(items),
        Value::String(text) => {
            if let Ok(Value::Array(inner)) = serde_json::from_str::<Value>(text) {
                return build_array_literal(&inner);
            }

            let parts: Vec<Value> = text
                .split(',')
                .map(|segment| Value::String(segment.trim().to_string()))
                .filter(|value| match value {
                    Value::String(s) => !s.is_empty(),
                    _ => true,
                })
                .collect();

            if !parts.is_empty() {
                build_array_literal(&parts)
            } else {
                build_array_literal(&[Value::String(text.clone())])
            }
        }
        other => build_array_literal(&[other.clone()]),
    }
}

/// Cancel a running query
#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    connection_id: String,
    backend_pid: i32,
) -> Result<()> {
    log::info!("Cancelling query with PID {} on connection: {}", backend_pid, connection_id);

    let client = state.get_client(&connection_id).await?;

    // Use pg_cancel_backend to cancel the query
    let query = "SELECT pg_cancel_backend($1)";
    client.execute(query, &[&backend_pid]).await?;

    Ok(())
}

/// Get the current backend process ID
#[tauri::command]
pub async fn get_backend_pid(state: State<'_, AppState>, connection_id: String) -> Result<i32> {
    let client = state.get_client(&connection_id).await?;

    let row = client.query_one("SELECT pg_backend_pid()", &[]).await?;
    let pid: i32 = row.get(0);

    Ok(pid)
}

/// Insert a single row into a table
#[tauri::command]
pub async fn insert_table_row(
    state: State<'_, AppState>,
    connection_id: String,
    request: InsertRowRequest,
) -> Result<u64> {
    log::info!(
        "Inserting row into table {}.{} on connection: {}",
        request.schema,
        request.table_name,
        connection_id
    );

    if request.row.values.is_empty() {
        return Err(RowFlowError::SchemaError(
            "Insert request must include at least one column".to_string(),
        ));
    }

    let table = qualified_table_name(&request.schema, &request.table_name)?;

    let columns_metadata = get_table_columns(
        state.clone(),
        connection_id.clone(),
        request.schema.clone(),
        request.table_name.clone(),
    )
    .await?;

    let column_lookup: HashMap<String, Column> =
        columns_metadata.into_iter().map(|column| (column.name.clone(), column)).collect();

    let mut columns = Vec::with_capacity(request.row.values.len());
    let mut values = Vec::with_capacity(request.row.values.len());

    for (column, value) in &request.row.values {
        validate_identifier(column, "column")?;
        let column_info = column_lookup.get(column).ok_or_else(|| {
            RowFlowError::InvalidInput(format!(
                "Column '{}' does not exist on {}.{}",
                column, request.schema, request.table_name
            ))
        })?;

        columns.push(quote_identifier(column));
        let literal = value_to_sql_literal(value, column_info)?;
        log::info!(
            "[insert_table_row] column={} type={} input={} literal={}",
            column,
            column_info.data_type,
            value,
            literal
        );
        values.push(literal);
    }

    let sql =
        format!("INSERT INTO {} ({}) VALUES ({});", table, columns.join(", "), values.join(", "));

    let client = state.get_client(&connection_id).await?;

    let affected = client.execute(sql.as_str(), &[]).await?;
    Ok(affected)
}

/// Search for candidate rows that can satisfy a foreign key reference
#[tauri::command]
pub async fn search_foreign_key_targets(
    state: State<'_, AppState>,
    connection_id: String,
    request: ForeignKeySearchRequest,
) -> Result<Vec<ForeignKeySearchResult>> {
    log::info!(
        "Searching foreign key targets for {}.{} ({}) on connection: {}",
        request.schema,
        request.table,
        request.column,
        connection_id
    );

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table, "table")?;
    validate_identifier(&request.column, "column")?;

    let client = state.get_client(&connection_id).await?;

    let qualified_table = qualified_table_name(&request.schema, &request.table)?;
    let column_ident = quote_identifier(&request.column);

    let pattern = request
        .search
        .as_ref()
        .map(|term| term.trim())
        .filter(|term| !term.is_empty())
        .map(|term| format!("%{term}%"));

    let limit = request.limit.unwrap_or(20).clamp(1, 200);

    let sql = format!(
        "SELECT ({column})::text AS key, row_to_json(t) AS row \
         FROM {table} AS t \
         WHERE ($1::text IS NULL OR ({column})::text ILIKE $1) \
         ORDER BY ({column})::text \
         LIMIT $2",
        column = column_ident,
        table = qualified_table
    );

    let rows = client.query(&sql, &[&pattern, &limit]).await?;

    let results = rows
        .into_iter()
        .map(|row| ForeignKeySearchResult { key: row.get(0), row: row.get(1) })
        .collect();

    Ok(results)
}

/// Delete rows from a table matching the provided criteria
#[tauri::command]
pub async fn delete_table_rows(
    state: State<'_, AppState>,
    connection_id: String,
    request: DeleteRowRequest,
) -> Result<u64> {
    log::info!(
        "Deleting rows from table {}.{} on connection: {}",
        request.schema,
        request.table_name,
        connection_id
    );

    if request.criteria.values.is_empty() {
        return Err(RowFlowError::SchemaError(
            "Delete request must include at least one criteria column".to_string(),
        ));
    }

    let table = qualified_table_name(&request.schema, &request.table_name)?;

    let columns_metadata = get_table_columns(
        state.clone(),
        connection_id.clone(),
        request.schema.clone(),
        request.table_name.clone(),
    )
    .await?;
    let column_lookup: HashMap<String, Column> =
        columns_metadata.into_iter().map(|column| (column.name.clone(), column)).collect();

    let mut predicates = Vec::with_capacity(request.criteria.values.len());
    for (column, value) in &request.criteria.values {
        validate_identifier(column, "column")?;
        let column_info = column_lookup.get(column).ok_or_else(|| {
            RowFlowError::InvalidInput(format!(
                "Column '{}' does not exist on {}.{}",
                column, request.schema, request.table_name
            ))
        })?;
        let ident = quote_identifier(column);
        let predicate = if value.is_null() {
            format!("{ident} IS NULL")
        } else {
            let literal = value_to_sql_literal(value, column_info)?;
            format!("{ident} = {literal}")
        };
        predicates.push(predicate);
    }

    let limit_clause = request.limit.map(|limit| format!(" LIMIT {}", limit)).unwrap_or_default();

    let sql = format!("DELETE FROM {} WHERE {}{};", table, predicates.join(" AND "), limit_clause);

    let client = state.get_client(&connection_id).await?;

    let affected = client.execute(sql.as_str(), &[]).await?;
    Ok(affected)
}

/// Helper function to convert a PostgreSQL row value to JSON
pub(crate) fn row_to_json_value(row: &tokio_postgres::Row, idx: usize, col_type: &Type) -> Value {
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
            .and_then(|v| Number::from_f64(v as f64))
            .map(Value::Number)
            .unwrap_or(Value::Null),
        &Type::FLOAT8 => row
            .try_get::<_, Option<f64>>(idx)
            .ok()
            .flatten()
            .and_then(Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        &Type::NUMERIC => numeric_cell_to_value(row, idx),
        &Type::UUID => row
            .try_get::<_, Option<Uuid>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_string()))
            .unwrap_or(Value::Null),
        &Type::TEXT | &Type::VARCHAR | &Type::BPCHAR | &Type::NAME => row
            .try_get::<_, Option<String>>(idx)
            .ok()
            .flatten()
            .map(Value::String)
            .unwrap_or(Value::Null),
        &Type::TEXT_ARRAY | &Type::VARCHAR_ARRAY | &Type::BPCHAR_ARRAY | &Type::NAME_ARRAY => {
            array_cell_to_value(row, idx, |v: String| Some(Value::String(v)))
        }
        &Type::INT2_ARRAY => {
            array_cell_to_value(row, idx, |v: i16| Some(Value::Number(Number::from(v as i64))))
        }
        &Type::INT4_ARRAY => {
            array_cell_to_value(row, idx, |v: i32| Some(Value::Number(Number::from(v as i64))))
        }
        &Type::INT8_ARRAY => {
            array_cell_to_value(row, idx, |v: i64| Some(Value::Number(Number::from(v))))
        }
        &Type::FLOAT4_ARRAY => {
            array_cell_to_value(row, idx, |v: f32| Number::from_f64(v as f64).map(Value::Number))
        }
        &Type::FLOAT8_ARRAY | &Type::NUMERIC_ARRAY => {
            array_cell_to_value(row, idx, |v: f64| Number::from_f64(v).map(Value::Number))
        }
        &Type::BOOL_ARRAY => array_cell_to_value(row, idx, |v: bool| Some(Value::Bool(v))),
        &Type::JSON_ARRAY => array_cell_to_value(row, idx, |v: Value| Some(v)),
        &Type::JSON | &Type::JSONB => {
            row.try_get::<_, Option<Value>>(idx).ok().flatten().unwrap_or(Value::Null)
        }
        &Type::TIMESTAMP => row
            .try_get::<_, Option<chrono::NaiveDateTime>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_string()))
            .unwrap_or(Value::Null),
        &Type::TIMESTAMPTZ => row
            .try_get::<_, Option<chrono::DateTime<chrono::Utc>>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_rfc3339()))
            .unwrap_or(Value::Null),
        &Type::DATE => row
            .try_get::<_, Option<chrono::NaiveDate>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.to_string()))
            .unwrap_or(Value::Null),
        &Type::TIME => row
            .try_get::<_, Option<chrono::NaiveTime>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.format("%H:%M:%S%.f").to_string()))
            .unwrap_or(Value::Null),
        &Type::TIMETZ => row
            .try_get::<_, Option<chrono::DateTime<chrono::FixedOffset>>>(idx)
            .ok()
            .flatten()
            .map(|v| Value::String(v.format("%H:%M:%S%.f%:z").to_string()))
            .unwrap_or(Value::Null),
        _ => row
            .try_get::<_, Option<String>>(idx)
            .ok()
            .flatten()
            .map(Value::String)
            .unwrap_or(Value::Null),
    }
}

fn numeric_cell_to_value(row: &tokio_postgres::Row, idx: usize) -> Value {
    if let Ok(Some(value)) = row.try_get::<_, Option<f64>>(idx) {
        if let Some(number) = Number::from_f64(value) {
            return Value::Number(number);
        }
    }

    if let Ok(Some(text)) = row.try_get::<_, Option<String>>(idx) {
        if let Ok(number) = Number::from_str(&text) {
            return Value::Number(number);
        }
        return Value::String(text);
    }

    Value::Null
}

fn array_cell_to_value<T, F>(row: &tokio_postgres::Row, idx: usize, mapper: F) -> Value
where
    T: FromSqlOwned + Sync,
    F: Fn(T) -> Option<Value> + Copy,
{
    if let Ok(Some(values)) = row.try_get::<_, Option<Vec<Option<T>>>>(idx) {
        let mapped = values
            .into_iter()
            .map(|item| match item {
                Some(value) => mapper(value).unwrap_or(Value::Null),
                None => Value::Null,
            })
            .collect();
        return Value::Array(mapped);
    }

    if let Ok(Some(values)) = row.try_get::<_, Option<Vec<T>>>(idx) {
        let mapped = values.into_iter().map(|value| mapper(value).unwrap_or(Value::Null)).collect();
        return Value::Array(mapped);
    }

    Value::Null
}

fn convert_params(params: &[Value], expected_types: &[Type]) -> Result<Vec<ConvertedParam>> {
    if params.len() != expected_types.len() {
        return Err(RowFlowError::QueryError(format!(
            "Expected {} parameter(s) but received {}",
            expected_types.len(),
            params.len()
        )));
    }

    let mut converted = Vec::with_capacity(params.len());
    for (idx, (value, ty)) in params.iter().zip(expected_types.iter()).enumerate() {
        converted.push(convert_param(idx, value, ty)?);
    }
    Ok(converted)
}

fn convert_param(index: usize, value: &Value, ty: &Type) -> Result<ConvertedParam> {
    if value.is_null() {
        return Ok(convert_null_param(ty));
    }

    match *ty {
        Type::BOOL => match value {
            Value::Bool(b) => Ok(ConvertedParam::Bool(Some(*b))),
            Value::String(s) => match s.to_lowercase().as_str() {
                "true" | "t" | "1" => Ok(ConvertedParam::Bool(Some(true))),
                "false" | "f" | "0" => Ok(ConvertedParam::Bool(Some(false))),
                _ => Err(param_type_error(index, "BOOLEAN", value)),
            },
            _ => Err(param_type_error(index, "BOOLEAN", value)),
        },
        Type::INT2 => match value_to_i64(value) {
            Some(v) => i16::try_from(v)
                .map(|cast| ConvertedParam::I16(Some(cast)))
                .map_err(|_| param_type_error(index, "SMALLINT", value)),
            None => Err(param_type_error(index, "SMALLINT", value)),
        },
        Type::INT4 => match value_to_i64(value) {
            Some(v) => i32::try_from(v)
                .map(|cast| ConvertedParam::I32(Some(cast)))
                .map_err(|_| param_type_error(index, "INTEGER", value)),
            None => Err(param_type_error(index, "INTEGER", value)),
        },
        Type::INT8 => match value_to_i64(value) {
            Some(v) => Ok(ConvertedParam::I64(Some(v))),
            None => Err(param_type_error(index, "BIGINT", value)),
        },
        Type::FLOAT4 => match value_to_f64(value) {
            Some(v) => Ok(ConvertedParam::F32(Some(v as f32))),
            None => Err(param_type_error(index, "REAL", value)),
        },
        Type::FLOAT8 | Type::NUMERIC => match value_to_f64(value) {
            Some(v) => Ok(ConvertedParam::F64(Some(v))),
            None => Err(param_type_error(index, "DOUBLE PRECISION", value)),
        },
        Type::JSON | Type::JSONB => Ok(ConvertedParam::Json(Some(Json(value.clone())))),
        Type::TIMESTAMP => match value {
            Value::String(s) => parse_naive_datetime(s)
                .map(|ts| ConvertedParam::Timestamp(Some(ts)))
                .ok_or_else(|| param_type_error(index, "TIMESTAMP", value)),
            _ => Err(param_type_error(index, "TIMESTAMP", value)),
        },
        Type::TIMESTAMPTZ => match value {
            Value::String(s) => parse_datetime_with_tz(s)
                .map(|ts| ConvertedParam::Timestamptz(Some(ts)))
                .ok_or_else(|| param_type_error(index, "TIMESTAMP WITH TIME ZONE", value)),
            _ => Err(param_type_error(index, "TIMESTAMP WITH TIME ZONE", value)),
        },
        Type::DATE => match value {
            Value::String(s) => {
                if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    Ok(ConvertedParam::Date(Some(date)))
                } else if let Some(dt) = parse_datetime_with_tz(s) {
                    Ok(ConvertedParam::Date(Some(dt.date_naive())))
                } else if let Some(dt) = parse_naive_datetime(s) {
                    Ok(ConvertedParam::Date(Some(dt.date())))
                } else {
                    Err(param_type_error(index, "DATE", value))
                }
            }
            _ => Err(param_type_error(index, "DATE", value)),
        },
        Type::TIME => match value {
            Value::String(s) => parse_naive_time(s)
                .map(|t| ConvertedParam::Time(Some(t)))
                .ok_or_else(|| param_type_error(index, "TIME", value)),
            _ => Err(param_type_error(index, "TIME", value)),
        },
        Type::TIMETZ => match value {
            Value::String(s) => parse_time_with_tz(s)
                .map(|t| ConvertedParam::TimeTz(Some(t)))
                .ok_or_else(|| param_type_error(index, "TIME WITH TIME ZONE", value)),
            _ => Err(param_type_error(index, "TIME WITH TIME ZONE", value)),
        },
        Type::UUID => match value {
            Value::String(s) => Uuid::from_str(s)
                .map(|uuid| ConvertedParam::Uuid(Some(uuid)))
                .map_err(|_| param_type_error(index, "UUID", value)),
            _ => Err(param_type_error(index, "UUID", value)),
        },
        Type::TEXT | Type::VARCHAR | Type::BPCHAR | Type::NAME | Type::UNKNOWN => {
            Ok(ConvertedParam::String(Some(value_to_string(value))))
        }
        _ => Ok(ConvertedParam::String(Some(value_to_string(value)))),
    }
}

fn convert_null_param(ty: &Type) -> ConvertedParam {
    match *ty {
        Type::BOOL => ConvertedParam::Bool(None),
        Type::INT2 => ConvertedParam::I16(None),
        Type::INT4 => ConvertedParam::I32(None),
        Type::INT8 => ConvertedParam::I64(None),
        Type::FLOAT4 => ConvertedParam::F32(None),
        Type::FLOAT8 | Type::NUMERIC => ConvertedParam::F64(None),
        Type::JSON | Type::JSONB => ConvertedParam::Json(None),
        Type::TIMESTAMP => ConvertedParam::Timestamp(None),
        Type::TIMESTAMPTZ => ConvertedParam::Timestamptz(None),
        Type::DATE => ConvertedParam::Date(None),
        Type::TIME => ConvertedParam::Time(None),
        Type::TIMETZ => ConvertedParam::TimeTz(None),
        Type::UUID => ConvertedParam::Uuid(None),
        _ => ConvertedParam::String(None),
    }
}

enum ConvertedParam {
    Bool(Option<bool>),
    I16(Option<i16>),
    I32(Option<i32>),
    I64(Option<i64>),
    F32(Option<f32>),
    F64(Option<f64>),
    String(Option<String>),
    Json(Option<Json<Value>>),
    Timestamp(Option<chrono::NaiveDateTime>),
    Timestamptz(Option<chrono::DateTime<chrono::Utc>>),
    Date(Option<chrono::NaiveDate>),
    Time(Option<chrono::NaiveTime>),
    TimeTz(Option<chrono::DateTime<chrono::FixedOffset>>),
    Uuid(Option<Uuid>),
}

impl ConvertedParam {
    fn as_sql(&self) -> &(dyn ToSql + Sync) {
        match self {
            ConvertedParam::Bool(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::I16(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::I32(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::I64(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::F32(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::F64(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::String(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Json(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Timestamp(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Timestamptz(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Date(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Time(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::TimeTz(v) => v as &(dyn ToSql + Sync),
            ConvertedParam::Uuid(v) => v as &(dyn ToSql + Sync),
        }
    }
}

fn param_type_error(index: usize, expected: &str, actual: &Value) -> RowFlowError {
    RowFlowError::QueryError(format!(
        "Parameter ${} expected {} but received {:?}",
        index + 1,
        expected,
        actual
    ))
}

fn value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(num) => {
            num.as_i64().or_else(|| num.as_u64().and_then(|u| i64::try_from(u).ok()))
        }
        Value::String(s) => s.parse::<i64>().ok(),
        Value::Bool(b) => Some(if *b { 1 } else { 0 }),
        _ => None,
    }
}

fn value_to_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(num) => num.as_f64(),
        Value::String(s) => s.parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(num) => num.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
        Value::Null => String::new(),
    }
}

fn parse_naive_datetime(input: &str) -> Option<chrono::NaiveDateTime> {
    chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%d %H:%M:%S%.f")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%d %H:%M:%S"))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S%.f"))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(input).map(|dt| dt.naive_utc()))
        .ok()
}

fn parse_datetime_with_tz(input: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(input).map(|dt| dt.with_timezone(&chrono::Utc)).ok()
}

fn parse_naive_time(input: &str) -> Option<chrono::NaiveTime> {
    chrono::NaiveTime::parse_from_str(input, "%H:%M:%S%.f")
        .or_else(|_| chrono::NaiveTime::parse_from_str(input, "%H:%M:%S"))
        .ok()
}

fn parse_time_with_tz(input: &str) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    chrono::DateTime::parse_from_rfc3339(input)
        .or_else(|_| {
            chrono::DateTime::parse_from_str(
                &format!("1970-01-01T{input}"),
                "%Y-%m-%dT%H:%M:%S%.f%:z",
            )
        })
        .ok()
}

fn normalize_env_file_value(raw: &str) -> String {
    let trimmed = raw.trim();
    let without_quotes = if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    unescape_env_value(without_quotes)
}

fn unescape_env_value(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.next() {
                match next {
                    'n' => output.push('\n'),
                    'r' => output.push('\r'),
                    't' => output.push('\t'),
                    '\\' => output.push('\\'),
                    '"' => output.push('"'),
                    '\'' => output.push('\''),
                    _ => {
                        output.push('\\');
                        output.push(next);
                    }
                }
            } else {
                output.push('\\');
            }
        } else {
            output.push(ch);
        }
    }
    output
}

/// List connection profiles from MCP server .env file
#[tauri::command]
pub async fn list_mcp_profiles() -> Result<Vec<ConnectionProfile>> {
    use std::collections::HashMap;
    use std::fs;

    // Get MCP server .env file path
    // CARGO_MANIFEST_DIR = .../apps/desktop/src-tauri
    // parent = .../apps/desktop
    // parent = .../apps
    // join mcp-server = .../apps/mcp-server
    let mcp_env_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("mcp-server").join(".env"))
        .ok_or_else(|| {
            crate::error::RowFlowError::InternalError(
                "Failed to resolve MCP server path".to_string(),
            )
        })?;

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
                let known_fields =
                    ["HOST", "PORT", "DATABASE", "USER", "PASSWORD", "SSL", "MAX_CONNECTIONS"];
                for field in &known_fields {
                    if remainder.ends_with(&format!("_{}", field)) {
                        let profile_name = &remainder[..remainder.len() - field.len() - 1];
                        profile_data
                            .entry(profile_name.to_string())
                            .or_insert_with(HashMap::new)
                            .insert(field.to_string(), normalize_env_file_value(value));
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
            let ssl_enabled =
                data.get("SSL").map(|s| s.eq_ignore_ascii_case("true")).unwrap_or(false);
            let parsed_port = port.parse::<u16>().unwrap_or(5432);

            profiles.push(ConnectionProfile {
                id: None,
                name: name.to_lowercase(),
                host: host.clone(),
                port: parsed_port,
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
