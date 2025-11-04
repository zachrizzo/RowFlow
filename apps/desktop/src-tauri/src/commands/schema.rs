use crate::error::{Result, RowFlowError};
use crate::state::AppState;
use crate::types::{
    AddTableColumnRequest, Column, ColumnReference, Constraint, CreateSchemaRequest,
    CreateTableRequest, DropSchemaRequest, DropTableColumnRequest, DropTableRequest, ForeignKey,
    Index, RenameSchemaRequest, Schema, Table, TableColumnDefinition, TableStats,
};
use std::collections::{BTreeMap, HashSet};
use tauri::State;

/// Ensure the provided identifier is safe to use in generated SQL
pub(crate) fn validate_identifier(identifier: &str, label: &str) -> Result<()> {
    if identifier.trim().is_empty() {
        return Err(RowFlowError::SchemaError(format!("{label} name cannot be empty")));
    }

    if identifier.contains('\0') {
        return Err(RowFlowError::SchemaError(format!("{label} name contains invalid characters")));
    }

    Ok(())
}

/// Quote an identifier for safe usage in SQL statements
pub(crate) fn quote_identifier(identifier: &str) -> String {
    let mut quoted = String::with_capacity(identifier.len() + 2);
    quoted.push('"');
    for ch in identifier.chars() {
        if ch == '"' {
            quoted.push('"');
        }
        quoted.push(ch);
    }
    quoted.push('"');
    quoted
}

/// Convenience helper for `schema.table` formatting with validation
pub(crate) fn qualified_table_name(schema: &str, table: &str) -> Result<String> {
    validate_identifier(schema, "schema")?;
    validate_identifier(table, "table")?;
    Ok(format!("{}.{}", quote_identifier(schema), quote_identifier(table)))
}

fn build_column_definition(
    column: &TableColumnDefinition,
    inline_primary_key: bool,
) -> Result<String> {
    validate_identifier(&column.name, "column")?;

    let mut parts = vec![format!("{} {}", quote_identifier(&column.name), column.data_type.trim())];

    if !column.is_nullable {
        parts.push("NOT NULL".to_string());
    }

    if let Some(default) = &column.default_expression {
        let trimmed = default.trim();
        if !trimmed.is_empty() {
            parts.push(format!("DEFAULT {trimmed}"));
        }
    }

    if inline_primary_key && column.is_primary_key {
        parts.push("PRIMARY KEY".to_string());
    }

    if let Some(reference) = &column.references {
        parts.push(build_reference_clause(reference)?);
    }

    Ok(parts.join(" "))
}

fn build_reference_clause(reference: &ColumnReference) -> Result<String> {
    let table = reference.table.trim();
    let column = reference.column.trim();
    if table.is_empty() || column.is_empty() {
        return Err(RowFlowError::SchemaError(
            "Foreign key requires target table and column".to_string(),
        ));
    }

    if let Some(schema) = &reference.schema {
        validate_identifier(schema, "schema")?;
    }
    validate_identifier(table, "table")?;
    validate_identifier(column, "column")?;

    let mut clause = String::from("REFERENCES ");
    if let Some(schema) = &reference.schema {
        clause.push_str(&format!("{}.", quote_identifier(schema)));
    }
    clause.push_str(&format!("{}({})", quote_identifier(table), quote_identifier(column)));

    if let Some(on_delete) = reference.on_delete.as_ref().and_then(|s| parse_fk_action(s)) {
        clause.push_str(&format!(" ON DELETE {on_delete}"));
    }

    if let Some(on_update) = reference.on_update.as_ref().and_then(|s| parse_fk_action(s)) {
        clause.push_str(&format!(" ON UPDATE {on_update}"));
    }

    Ok(clause)
}

fn parse_fk_action(action: &str) -> Option<&'static str> {
    match action.to_uppercase().as_str() {
        "CASCADE" => Some("CASCADE"),
        "SET NULL" => Some("SET NULL"),
        "SET DEFAULT" => Some("SET DEFAULT"),
        "RESTRICT" => Some("RESTRICT"),
        "NO ACTION" => Some("NO ACTION"),
        _ => None,
    }
}

/// List all schemas in the database
#[tauri::command]
pub async fn list_schemas(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<Schema>> {
    log::info!("Listing schemas for connection: {}", connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            n.nspname AS name,
            pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
            CASE
                WHEN n.nspname LIKE 'pg_%' OR n.nspname = 'information_schema' THEN true
                ELSE false
            END AS is_system,
            pg_catalog.obj_description(n.oid, 'pg_namespace') AS description
        FROM pg_catalog.pg_namespace n
        ORDER BY
            is_system ASC,
            n.nspname ASC
    "#;

    let rows = client.query(query, &[]).await?;

    let schemas = rows
        .iter()
        .map(|row| Schema {
            name: row.get(0),
            owner: row.get(1),
            is_system: row.get(2),
            description: row.get(3),
        })
        .collect();

    Ok(schemas)
}

/// List tables in a schema
#[tauri::command]
pub async fn list_tables(
    state: State<'_, AppState>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<Table>> {
    log::info!("Listing tables for connection: {}", connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            t.table_schema,
            t.table_name,
            t.table_type,
            pg_catalog.pg_get_userbyid(c.relowner) AS owner,
            CASE
                WHEN c.reltuples >= 0 THEN c.reltuples::bigint
                ELSE NULL
            END AS row_count,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
            pg_catalog.obj_description(c.oid, 'pg_class') AS description
        FROM information_schema.tables t
        LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = t.table_schema AND n.oid = c.relnamespace
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
            AND ($1::text IS NULL OR t.table_schema = $1)
        ORDER BY t.table_schema, t.table_name
    "#;

    let rows = client.query(query, &[&schema]).await?;

    let mut table_map: BTreeMap<String, Table> = BTreeMap::new();

    for row in rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        let table_type: String = row.get(2);
        let owner: Option<String> = row.get(3);
        let row_count: Option<i64> = row.get(4);
        let size: Option<String> = row.get(5);
        let description: Option<String> = row.get(6);

        let key = format!("{}::{}::{}", schema, name, table_type);

        table_map.entry(key).or_insert(Table {
            schema,
            name,
            table_type,
            owner,
            row_count,
            size,
            description,
        });
    }

    let tables = table_map.into_values().collect();

    Ok(tables)
}

/// Get columns for a table
#[tauri::command]
pub async fn get_table_columns(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<Column>> {
    log::info!("Getting columns for table: {}.{} on connection: {}", schema, table, connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable = 'YES' AS is_nullable,
            c.column_default,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
            ) AS is_primary_key,
            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'UNIQUE'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
            ) AS is_unique,
            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
            ) AS is_foreign_key,
            (
                SELECT ccu.table_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
                LIMIT 1
            ) AS foreign_key_table,
            (
                SELECT ccu.table_schema
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
                LIMIT 1
            ) AS foreign_key_schema,
            (
                SELECT ccu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
                LIMIT 1
            ) AS foreign_key_column,
            pg_catalog.col_description(
                (c.table_schema || '.' || c.table_name)::regclass::oid,
                c.ordinal_position
            ) AS description
        FROM information_schema.columns c
        WHERE c.table_schema = $1
            AND c.table_name = $2
        ORDER BY c.ordinal_position
    "#;

    let rows = client.query(query, &[&schema, &table]).await?;

    let columns = rows
        .iter()
        .map(|row| Column {
            name: row.get(0),
            data_type: row.get(1),
            is_nullable: row.get(2),
            column_default: row.get(3),
            character_maximum_length: row.get(4),
            numeric_precision: row.get(5),
            numeric_scale: row.get(6),
            is_primary_key: row.get(7),
            is_unique: row.get(8),
            is_foreign_key: row.get(9),
            foreign_key_schema: row.get(11),
            foreign_key_table: row.get(10),
            foreign_key_column: row.get(12),
            description: row.get(13),
        })
        .collect();

    Ok(columns)
}

/// Get primary keys for a table
#[tauri::command]
pub async fn get_primary_keys(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<String>> {
    log::info!(
        "Getting primary keys for table: {}.{} on connection: {}",
        schema,
        table,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
        ORDER BY kcu.ordinal_position
    "#;

    let rows = client.query(query, &[&schema, &table]).await?;

    let primary_keys = rows.iter().map(|row| row.get(0)).collect();

    Ok(primary_keys)
}

/// Get indexes for a table
#[tauri::command]
pub async fn get_indexes(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<Index>> {
    log::info!("Getting indexes for table: {}.{} on connection: {}", schema, table, connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            i.relname AS index_name,
            ARRAY_AGG(a.attname ORDER BY k.ordinality) AS columns,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary,
            am.amname AS index_type,
            pg_get_indexdef(ix.indexrelid) AS definition,
            pg_size_pretty(pg_relation_size(i.oid)) AS size
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE n.nspname = $1
            AND t.relname = $2
        GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, ix.indexrelid, i.oid
        ORDER BY i.relname
    "#;

    let rows = client.query(query, &[&schema, &table]).await?;

    let indexes = rows
        .iter()
        .map(|row| Index {
            name: row.get(0),
            columns: row.get(1),
            is_unique: row.get(2),
            is_primary: row.get(3),
            index_type: row.get(4),
            definition: row.get(5),
            size: row.get(6),
        })
        .collect();

    Ok(indexes)
}

/// Get table statistics
#[tauri::command]
pub async fn get_table_stats(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<TableStats> {
    log::info!(
        "Getting statistics for table: {}.{} on connection: {}",
        schema,
        table,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            schemaname,
            relname,
            n_tup_ins + n_tup_upd + n_tup_del AS total_modifications,
            pg_size_pretty(pg_total_relation_size((schemaname || '.' || relname)::regclass)) AS total_size,
            pg_size_pretty(pg_relation_size((schemaname || '.' || relname)::regclass)) AS table_size,
            pg_size_pretty(pg_total_relation_size((schemaname || '.' || relname)::regclass) -
                          pg_relation_size((schemaname || '.' || relname)::regclass)) AS indexes_size,
            pg_size_pretty(COALESCE(pg_total_relation_size(reltoastrelid), 0)) AS toast_size,
            seq_scan,
            seq_tup_read,
            idx_scan,
            idx_tup_fetch,
            n_tup_ins,
            n_tup_upd,
            n_tup_del,
            n_live_tup,
            n_dead_tup,
            TO_CHAR(last_vacuum, 'YYYY-MM-DD HH24:MI:SS') AS last_vacuum,
            TO_CHAR(last_autovacuum, 'YYYY-MM-DD HH24:MI:SS') AS last_autovacuum,
            TO_CHAR(last_analyze, 'YYYY-MM-DD HH24:MI:SS') AS last_analyze,
            TO_CHAR(last_autoanalyze, 'YYYY-MM-DD HH24:MI:SS') AS last_autoanalyze
        FROM pg_stat_user_tables
        LEFT JOIN pg_class c ON c.relname = relname
        WHERE schemaname = $1
            AND relname = $2
    "#;

    let row = client.query_one(query, &[&schema, &table]).await?;

    Ok(TableStats {
        schema: row.get(0),
        table: row.get(1),
        row_count: row.get(2),
        total_size: row.get(3),
        table_size: row.get(4),
        indexes_size: row.get(5),
        toast_size: row.get(6),
        seq_scan: row.get(7),
        seq_tup_read: row.get(8),
        idx_scan: row.get(9),
        idx_tup_fetch: row.get(10),
        n_tup_ins: row.get(11),
        n_tup_upd: row.get(12),
        n_tup_del: row.get(13),
        n_live_tup: row.get(14),
        n_dead_tup: row.get(15),
        last_vacuum: row.get(16),
        last_autovacuum: row.get(17),
        last_analyze: row.get(18),
        last_autoanalyze: row.get(19),
    })
}

/// Get foreign keys for a table
#[tauri::command]
pub async fn get_foreign_keys(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<ForeignKey>> {
    log::info!(
        "Getting foreign keys for table: {}.{} on connection: {}",
        schema,
        table,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            tc.constraint_name,
            ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
            ccu.table_schema AS foreign_schema,
            ccu.table_name AS foreign_table,
            ARRAY_AGG(ccu.column_name ORDER BY kcu.ordinal_position) AS foreign_columns,
            rc.delete_rule AS on_delete,
            rc.update_rule AS on_update
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
        GROUP BY tc.constraint_name, ccu.table_schema, ccu.table_name, rc.delete_rule, rc.update_rule
        ORDER BY tc.constraint_name
    "#;

    let rows = client.query(query, &[&schema, &table]).await?;

    let foreign_keys: Vec<ForeignKey> = rows
        .iter()
        .map(|row| {
            // PostgreSQL ARRAY_AGG returns arrays that need to be extracted directly
            let columns: Vec<String> = row.get(1);
            let foreign_columns: Vec<String> = row.get(4);

            log::debug!(
                "FK {}: columns={:?}, foreign_columns={:?}",
                row.get::<_, String>(0),
                columns,
                foreign_columns
            );

            ForeignKey {
                name: row.get(0),
                columns,
                foreign_schema: row.get(2),
                foreign_table: row.get(3),
                foreign_columns,
                on_delete: row.get(5),
                on_update: row.get(6),
            }
        })
        .collect();

    log::info!(
        "Found {} foreign keys for {}.{}: {:?}",
        foreign_keys.len(),
        schema,
        table,
        foreign_keys.iter().map(|fk| &fk.name).collect::<Vec<_>>()
    );

    Ok(foreign_keys)
}

/// Get constraints for a table
#[tauri::command]
pub async fn get_constraints(
    state: State<'_, AppState>,
    connection_id: String,
    schema: String,
    table: String,
) -> Result<Vec<Constraint>> {
    log::info!(
        "Getting constraints for table: {}.{} on connection: {}",
        schema,
        table,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    let query = r#"
        SELECT
            tc.constraint_name,
            tc.constraint_type,
            ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
            pg_get_constraintdef(c.oid) AS definition
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        LEFT JOIN pg_constraint c
            ON c.conname = tc.constraint_name
        WHERE tc.table_schema = $1
            AND tc.table_name = $2
        GROUP BY tc.constraint_name, tc.constraint_type, c.oid
        ORDER BY tc.constraint_type, tc.constraint_name
    "#;

    let rows = client.query(query, &[&schema, &table]).await?;

    let constraints = rows
        .iter()
        .map(|row| Constraint {
            name: row.get(0),
            constraint_type: row.get(1),
            columns: row.get(2),
            definition: row.get(3),
        })
        .collect();

    Ok(constraints)
}

/// Create a new schema in the database
#[tauri::command]
pub async fn create_schema(
    state: State<'_, AppState>,
    connection_id: String,
    request: CreateSchemaRequest,
) -> Result<()> {
    log::info!("Creating schema: {} on connection: {}", request.name, connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.name, "schema")?;

    let if_not_exists = if request.if_not_exists { "IF NOT EXISTS " } else { "" };
    let sql = format!(
        "CREATE SCHEMA {}{};",
        if_not_exists,
        quote_identifier(&request.name)
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Drop an existing schema
#[tauri::command]
pub async fn drop_schema(
    state: State<'_, AppState>,
    connection_id: String,
    request: DropSchemaRequest,
) -> Result<()> {
    log::info!("Dropping schema: {} on connection: {}", request.name, connection_id);

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.name, "schema")?;

    let if_exists = if request.if_exists { "IF EXISTS " } else { "" };
    let cascade = if request.cascade { " CASCADE" } else { "" };
    let sql = format!(
        "DROP SCHEMA {}{}{};",
        if_exists,
        quote_identifier(&request.name),
        cascade
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Rename an existing schema
#[tauri::command]
pub async fn rename_schema(
    state: State<'_, AppState>,
    connection_id: String,
    request: RenameSchemaRequest,
) -> Result<()> {
    log::info!(
        "Renaming schema: {} -> {} on connection: {}",
        request.current_name,
        request.new_name,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.current_name, "schema")?;
    validate_identifier(&request.new_name, "schema")?;

    let sql = format!(
        "ALTER SCHEMA {} RENAME TO {};",
        quote_identifier(&request.current_name),
        quote_identifier(&request.new_name)
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Create a new table using the provided column definitions
#[tauri::command]
pub async fn create_table(
    state: State<'_, AppState>,
    connection_id: String,
    request: CreateTableRequest,
) -> Result<()> {
    log::info!(
        "Creating table: {}.{} on connection: {}",
        request.schema,
        request.table_name,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table_name, "table")?;

    if request.columns.is_empty() {
        return Err(RowFlowError::SchemaError("Cannot create a table without columns".to_string()));
    }

    let mut seen_columns = HashSet::new();
    let primary_key_columns: Vec<String> = request
        .columns
        .iter()
        .filter(|col| col.is_primary_key)
        .map(|col| col.name.clone())
        .collect();

    let inline_primary_key = primary_key_columns.len() <= 1;

    let mut column_definitions = Vec::with_capacity(request.columns.len());
    for column in &request.columns {
        let lowered = column.name.to_lowercase();
        if !seen_columns.insert(lowered) {
            return Err(RowFlowError::SchemaError(format!(
                "Duplicate column name '{}' in create table request",
                column.name
            )));
        }

        column_definitions.push(build_column_definition(column, inline_primary_key)?);
    }

    if !primary_key_columns.is_empty() && !inline_primary_key {
        let pk_clause = format!(
            "PRIMARY KEY ({})",
            primary_key_columns
                .iter()
                .map(|name| quote_identifier(name))
                .collect::<Vec<_>>()
                .join(", ")
        );
        column_definitions.push(pk_clause);
    }

    let if_not_exists = if request.if_not_exists { "IF NOT EXISTS " } else { "" };
    let sql = format!(
        "CREATE TABLE {}{}.{} (\n    {}\n);",
        if_not_exists,
        quote_identifier(&request.schema),
        quote_identifier(&request.table_name),
        column_definitions.join(",\n    ")
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Drop an existing table with optional cascade
#[tauri::command]
pub async fn drop_table(
    state: State<'_, AppState>,
    connection_id: String,
    request: DropTableRequest,
) -> Result<()> {
    log::info!(
        "Dropping table: {}.{} on connection: {}",
        request.schema,
        request.table_name,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table_name, "table")?;

    let if_exists = if request.if_exists { "IF EXISTS " } else { "" };
    let cascade = if request.cascade { " CASCADE" } else { "" };
    let sql = format!(
        "DROP TABLE {}{}.{}{};",
        if_exists,
        quote_identifier(&request.schema),
        quote_identifier(&request.table_name),
        cascade
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Add a new column to an existing table
#[tauri::command]
pub async fn add_table_column(
    state: State<'_, AppState>,
    connection_id: String,
    request: AddTableColumnRequest,
) -> Result<()> {
    log::info!(
        "Adding column '{}' to table {}.{} on connection: {}",
        request.column.name,
        request.schema,
        request.table_name,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table_name, "table")?;

    if request.column.is_primary_key {
        return Err(RowFlowError::SchemaError(
            "Adding primary key columns via this operation is not supported".to_string(),
        ));
    }

    let column_definition = build_column_definition(&request.column, true)?;
    let if_not_exists = if request.if_not_exists { "IF NOT EXISTS " } else { "" };
    let sql = format!(
        "ALTER TABLE {} ADD COLUMN {}{};",
        qualified_table_name(&request.schema, &request.table_name)?,
        if_not_exists,
        column_definition
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

/// Drop a column from an existing table
#[tauri::command]
pub async fn drop_table_column(
    state: State<'_, AppState>,
    connection_id: String,
    request: DropTableColumnRequest,
) -> Result<()> {
    log::info!(
        "Dropping column '{}' from table {}.{} on connection: {}",
        request.column_name,
        request.schema,
        request.table_name,
        connection_id
    );

    let pool = state.get_connection(&connection_id).await?;
    let client = pool.get().await?;

    validate_identifier(&request.schema, "schema")?;
    validate_identifier(&request.table_name, "table")?;
    validate_identifier(&request.column_name, "column")?;

    let if_exists = if request.if_exists { "IF EXISTS " } else { "" };
    let cascade = if request.cascade { " CASCADE" } else { "" };
    let sql = format!(
        "ALTER TABLE {} DROP COLUMN {}{}{};",
        qualified_table_name(&request.schema, &request.table_name)?,
        if_exists,
        quote_identifier(&request.column_name),
        cascade
    );

    client.batch_execute(&sql).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_column() -> TableColumnDefinition {
        TableColumnDefinition {
            name: "customer_id".to_string(),
            data_type: "INTEGER".to_string(),
            is_nullable: false,
            default_expression: None,
            is_primary_key: false,
            references: None,
        }
    }

    #[test]
    fn builds_column_without_reference() {
        let column = base_column();
        let definition = build_column_definition(&column, true).expect("column definition");
        assert_eq!(definition, "\"customer_id\" INTEGER NOT NULL");
    }

    #[test]
    fn builds_column_with_reference_same_schema() {
        let mut column = base_column();
        column.references = Some(ColumnReference {
            schema: None,
            table: "accounts".to_string(),
            column: "id".to_string(),
            on_delete: Some("CASCADE".to_string()),
            on_update: None,
        });

        let definition = build_column_definition(&column, true).expect("column definition");
        assert_eq!(
            definition,
            "\"customer_id\" INTEGER NOT NULL REFERENCES \"accounts\"(\"id\") ON DELETE CASCADE"
        );
    }

    #[test]
    fn builds_column_with_reference_different_schema_and_actions() {
        let mut column = base_column();
        column.references = Some(ColumnReference {
            schema: Some("billing".to_string()),
            table: "accounts".to_string(),
            column: "id".to_string(),
            on_delete: Some("SET NULL".to_string()),
            on_update: Some("RESTRICT".to_string()),
        });

        let definition = build_column_definition(&column, true).expect("column definition");
        assert_eq!(
            definition,
            "\"customer_id\" INTEGER NOT NULL REFERENCES \"billing\".\"accounts\"(\"id\") ON DELETE SET NULL ON UPDATE RESTRICT"
        );
    }
}
