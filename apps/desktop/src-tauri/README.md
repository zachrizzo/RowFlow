# RowFlow Rust Backend

This is the Tauri 2.1 backend for RowFlow, a PostgreSQL database viewer and query tool.

## Architecture Overview

### Module Structure

```
src/
├── main.rs           # Application entry point and command registration
├── lib.rs            # Library exports for reusability
├── error.rs          # Custom error types using thiserror
├── state.rs          # Application state and connection pool management
├── types.rs          # Shared types and structs (with TypeShare for TS)
└── commands/
    ├── mod.rs        # Command module exports
    ├── database.rs   # Database connection and query commands
    └── schema.rs     # Schema introspection commands
```

### State Management

The application uses **Tauri's State management** system with `AppState`:

- **Connection Pooling**: Uses `deadpool-postgres` for efficient connection management
- **Thread Safety**: All state is wrapped in `Arc<Mutex<>>` for safe concurrent access
- **Connection Lifecycle**: Each connection is assigned a UUID that acts as a handle
- **Automatic Cleanup**: Connections are properly closed when removed

#### How it works:

```rust
pub struct AppState {
    connections: Arc<Mutex<HashMap<String, ConnectionPool>>>,
}
```

Each database connection profile creates a connection pool (not a single connection), which:
- Reuses connections efficiently
- Handles connection errors gracefully
- Supports up to 16 concurrent queries per connection
- Implements fast recycling for better performance

### Connection Pool Configuration

**Key Features:**
- Max pool size: 16 connections
- Recycling method: Fast (checks connection validity quickly)
- TLS support with native-tls
- Custom session parameters (timeouts, read-only mode)
- SSH tunnel support (planned)

**Timeouts:**
- `connection_timeout`: Maximum time to establish a connection (seconds)
- `statement_timeout`: Maximum query execution time (milliseconds)
- `lock_timeout`: Maximum time to wait for locks (milliseconds)
- `idle_in_transaction_session_timeout`: Automatic rollback for idle transactions (seconds)

### Error Handling

All errors use a custom `RowFlowError` enum with `thiserror`:

```rust
pub enum RowFlowError {
    ConnectionError(String),
    QueryError(String),
    SchemaError(String),
    // ... etc
}
```

Errors are automatically converted to `String` for Tauri commands, providing user-friendly messages to the frontend.

## API Commands

### Database Commands

#### `connect_database(profile: ConnectionProfile) -> Result<String>`
Creates a new database connection pool and returns a connection ID.

**Parameters:**
- `profile`: Connection profile with host, port, credentials, TLS, timeouts

**Returns:** Unique connection ID (UUID)

**Example:**
```typescript
const connectionId = await invoke('connect_database', {
  profile: {
    name: 'Production DB',
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    username: 'admin',
    password: 'secret',
    readOnly: true,
    statementTimeout: 30000, // 30 seconds
  }
});
```

---

#### `disconnect_database(connection_id: String) -> Result<()>`
Closes and removes a database connection.

**Parameters:**
- `connection_id`: The connection ID to close

---

#### `test_connection(profile: ConnectionProfile) -> Result<ConnectionInfo>`
Tests a connection profile without permanently storing it.

**Returns:** Server information (version, encoding, user privileges)

---

#### `execute_query(connection_id: String, sql: String, params: Vec<Value>) -> Result<QueryResult>`
Executes a SQL query and returns all results.

**Parameters:**
- `connection_id`: Active connection ID
- `sql`: SQL query string
- `params`: Query parameters (prepared statement support)

**Returns:**
- `fields`: Column information (name, type, nullable)
- `rows`: Array of result rows as JSON
- `row_count`: Number of rows returned
- `execution_time`: Query execution time in milliseconds
- `has_more`: Whether there are more results (always false for this command)

**Example:**
```typescript
const result = await invoke('execute_query', {
  connectionId: 'abc-123',
  sql: 'SELECT * FROM users WHERE active = true',
  params: []
});

console.log(`Found ${result.rowCount} users in ${result.executionTime}ms`);
```

---

#### `execute_query_stream(connection_id: String, sql: String, chunk_size: usize, offset: usize) -> Result<QueryResult>`
Executes a query with pagination for large result sets.

**Parameters:**
- `connection_id`: Active connection ID
- `sql`: SQL query string
- `chunk_size`: Number of rows per page
- `offset`: Starting row offset

**Returns:** Same as `execute_query`, but with `has_more: true` if more pages exist

**Example:**
```typescript
// Fetch first 1000 rows
const page1 = await invoke('execute_query_stream', {
  connectionId: 'abc-123',
  sql: 'SELECT * FROM large_table',
  chunkSize: 1000,
  offset: 0
});

if (page1.hasMore) {
  // Fetch next 1000 rows
  const page2 = await invoke('execute_query_stream', {
    connectionId: 'abc-123',
    sql: 'SELECT * FROM large_table',
    chunkSize: 1000,
    offset: 1000
  });
}
```

---

#### `cancel_query(connection_id: String, backend_pid: i32) -> Result<()>`
Cancels a running query using PostgreSQL's `pg_cancel_backend`.

**Parameters:**
- `connection_id`: Active connection ID
- `backend_pid`: Backend process ID from `get_backend_pid`

---

#### `get_backend_pid(connection_id: String) -> Result<i32>`
Gets the PostgreSQL backend process ID for query cancellation.

**Returns:** Backend PID

---

### Schema Introspection Commands

#### `list_schemas(connection_id: String) -> Result<Vec<Schema>>`
Lists all schemas in the database.

**Returns:** Array of schema objects with:
- `name`: Schema name
- `owner`: Schema owner username
- `is_system`: Whether it's a system schema
- `description`: Schema comment/description

---

#### `list_tables(connection_id: String, schema: Option<String>) -> Result<Vec<Table>>`
Lists all tables in a schema (or all schemas if None).

**Returns:** Array of table objects with:
- `schema`: Schema name
- `name`: Table name
- `table_type`: BASE TABLE, VIEW, MATERIALIZED VIEW, etc.
- `owner`: Table owner
- `row_count`: Estimated row count
- `size`: Human-readable size (e.g., "42 MB")
- `description`: Table comment

---

#### `get_table_columns(connection_id: String, schema: String, table: String) -> Result<Vec<Column>>`
Gets detailed column information for a table.

**Returns:** Array of column objects with:
- `name`: Column name
- `data_type`: PostgreSQL data type
- `is_nullable`: Whether NULL is allowed
- `column_default`: Default value expression
- `character_maximum_length`: Max length for text types
- `numeric_precision`/`numeric_scale`: For numeric types
- `is_primary_key`: Is part of primary key
- `is_unique`: Has unique constraint
- `is_foreign_key`: Is part of foreign key
- `foreign_key_table`/`foreign_key_column`: FK reference
- `description`: Column comment

---

#### `get_primary_keys(connection_id: String, schema: String, table: String) -> Result<Vec<String>>`
Gets the primary key column names for a table.

**Returns:** Array of column names in PK order

---

#### `get_indexes(connection_id: String, schema: String, table: String) -> Result<Vec<Index>>`
Gets all indexes for a table.

**Returns:** Array of index objects with:
- `name`: Index name
- `columns`: Array of column names
- `is_unique`: Unique index
- `is_primary`: Primary key index
- `index_type`: btree, hash, gin, gist, etc.
- `definition`: Full CREATE INDEX statement
- `size`: Human-readable size

---

#### `get_table_stats(connection_id: String, schema: String, table: String) -> Result<TableStats>`
Gets comprehensive statistics for a table from `pg_stat_user_tables`.

**Returns:** Statistics object with:
- Row counts (live, dead, inserted, updated, deleted)
- Size information (total, table, indexes, TOAST)
- Scan statistics (sequential, index)
- Maintenance info (last vacuum/analyze timestamps)

---

#### `get_foreign_keys(connection_id: String, schema: String, table: String) -> Result<Vec<ForeignKey>>`
Gets all foreign key constraints for a table.

**Returns:** Array of FK objects with:
- `name`: Constraint name
- `columns`: Source columns
- `foreign_schema`/`foreign_table`/`foreign_columns`: Target reference
- `on_delete`/`on_update`: Referential actions

---

#### `get_constraints(connection_id: String, schema: String, table: String) -> Result<Vec<Constraint>>`
Gets all constraints (PK, FK, UNIQUE, CHECK) for a table.

**Returns:** Array of constraint objects

---

## Security Considerations

### Read-Only Mode
When `read_only: true` is set in the connection profile:
```sql
SET default_transaction_read_only = true;
```
This prevents any write operations (INSERT, UPDATE, DELETE, DDL) at the session level.

### Statement Timeouts
All connections can have timeouts to prevent:
- Long-running queries consuming resources
- Accidental full table scans
- Deadlocks holding locks indefinitely

### TLS Configuration
Supports:
- CA certificate verification
- Client certificate authentication
- Custom certificate paths
- Self-signed certificates (with `verify_ca: false`)

### Password Handling
- Passwords are stored in memory only during connection
- Consider using OS keyring (via `tauri-plugin-keyring`) for persistent storage
- Support for SSH key-based authentication (when using SSH tunnels)

### SQL Injection Prevention
- Uses PostgreSQL prepared statements with parameter binding
- Never concatenates user input into SQL strings

---

## Type Sharing with TypeScript

All types in `types.rs` use `#[typeshare]` macro to generate TypeScript definitions.

To generate TypeScript types:
```bash
cargo install typeshare-cli
typeshare . --lang typescript --output-file ../src/types/backend.ts
```

This ensures type safety between Rust and TypeScript.

---

## Frontend Integration Example

### React Hook for Database Connection

```typescript
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

interface ConnectionProfile {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  readOnly: boolean;
  statementTimeout?: number;
}

export function useDatabase() {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (profile: ConnectionProfile) => {
    setLoading(true);
    setError(null);
    try {
      const id = await invoke<string>('connect_database', { profile });
      setConnectionId(id);
      return id;
    } catch (err) {
      setError(err as string);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!connectionId) return;
    try {
      await invoke('disconnect_database', { connectionId });
      setConnectionId(null);
    } catch (err) {
      setError(err as string);
    }
  };

  const executeQuery = async (sql: string) => {
    if (!connectionId) throw new Error('Not connected');
    return await invoke('execute_query', {
      connectionId,
      sql,
      params: []
    });
  };

  return {
    connectionId,
    loading,
    error,
    connect,
    disconnect,
    executeQuery,
    isConnected: !!connectionId
  };
}
```

### Usage in Component

```typescript
function DatabaseExplorer() {
  const { connect, executeQuery, isConnected } = useDatabase();
  const [schemas, setSchemas] = useState([]);

  const handleConnect = async () => {
    await connect({
      name: 'My Database',
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      username: 'admin',
      password: 'secret',
      readOnly: true,
      statementTimeout: 30000
    });

    // Load schemas after connecting
    const result = await invoke('list_schemas', {
      connectionId: connectionId
    });
    setSchemas(result);
  };

  return (
    <div>
      {!isConnected ? (
        <button onClick={handleConnect}>Connect</button>
      ) : (
        <SchemaTree schemas={schemas} />
      )}
    </div>
  );
}
```

---

## Next Steps

### 1. SSH Tunnel Implementation
Currently, the SSH tunnel support is in the types but not implemented. To add:

1. Create a tunnel manager in `state.rs`
2. Use `async-ssh2-tokio` to establish SSH tunnel
3. Forward local port to remote PostgreSQL
4. Connect to `localhost:[forwarded_port]` instead of remote host

### 2. Query History
Add a persistent query history:
- Store in SQLite using `tauri-plugin-sql`
- Track query execution time, results, errors
- Search and filter history

### 3. Export Functionality
Add commands to export query results:
- CSV export
- JSON export
- Excel export (using `rust_xlsxwriter`)

### 4. Query Explain/Analyze
Add commands for query planning:
```rust
#[tauri::command]
pub async fn explain_query(connection_id: String, sql: String, analyze: bool)
```

### 5. Real-time Query Progress
For long queries, implement progress reporting:
- Use Tauri events to stream progress
- Show row count as it streams
- Cancel support

### 6. Connection Profiles
Persist connection profiles securely:
- Use `tauri-plugin-keyring` for password storage
- Store profiles in app data directory
- Support import/export of profiles

---

## Building and Running

### Development
```bash
cd apps/desktop
npm install
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```

### Testing Rust Backend Only
```bash
cd apps/desktop/src-tauri
cargo test
```

---

## Troubleshooting

### Connection Timeout
If connections timeout, check:
- `pg_hba.conf` allows the connection
- Firewall allows PostgreSQL port
- Increase `connection_timeout` in profile

### TLS Errors
If TLS fails:
- Verify certificate paths are correct
- Check certificate permissions
- Try `verify_ca: false` for self-signed certs

### Query Timeout
If queries timeout:
- Increase `statement_timeout`
- Add indexes to improve performance
- Use `execute_query_stream` for large results

### Pool Exhaustion
If "no connections available":
- Too many concurrent queries (max 16 per connection)
- Queries not completing (check for locks)
- Consider creating multiple connections

---

## Dependencies

- **tauri 2.1**: Application framework
- **tokio**: Async runtime
- **tokio-postgres**: PostgreSQL driver
- **deadpool-postgres**: Connection pooling
- **native-tls**: TLS support
- **serde/serde_json**: Serialization
- **thiserror**: Error handling
- **chrono**: Date/time handling
- **uuid**: Connection ID generation
- **typeshare**: TypeScript type generation

---

## License

[Your License Here]
