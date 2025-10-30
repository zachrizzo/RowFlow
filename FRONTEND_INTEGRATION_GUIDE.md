# Frontend Integration Guide - RowFlow Backend

Quick reference for integrating React/TypeScript frontend with Tauri Rust backend.

## Installation

```bash
npm install @tauri-apps/api
```

## Basic Import

```typescript
import { invoke } from '@tauri-apps/api/core';
```

## Command Reference

### Connection Commands

#### Connect to Database
```typescript
const connectionId = await invoke<string>('connect_database', {
  profile: {
    name: 'My Database',
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    username: 'admin',
    password: 'secret',
    useSSH: false,
    sshConfig: null,
    tlsConfig: {
      enabled: true,
      verifyCa: true,
      caCertPath: null,
      clientCertPath: null,
      clientKeyPath: null,
    },
    connectionTimeout: 10,  // seconds
    statementTimeout: 30000, // milliseconds
    lockTimeout: 5000,      // milliseconds
    idleTimeout: 300,       // seconds
    readOnly: true,
  }
});
```

#### Test Connection
```typescript
const info = await invoke<ConnectionInfo>('test_connection', {
  profile: { /* same as above */ }
});

console.log(info.serverVersion);  // "PostgreSQL 16.1"
console.log(info.databaseName);   // "myapp"
console.log(info.isSuperuser);    // false
```

#### Disconnect
```typescript
await invoke('disconnect_database', { connectionId });
```

### Query Commands

#### Execute Query
```typescript
const result = await invoke<QueryResult>('execute_query', {
  connectionId: 'abc-123',
  sql: 'SELECT * FROM users WHERE active = true',
  params: []  // Future: prepared statement params
});

console.log(`Found ${result.rowCount} rows`);
console.log(`Execution time: ${result.executionTime}ms`);

result.fields.forEach(field => {
  console.log(`${field.name}: ${field.typeName}`);
});

result.rows.forEach(row => {
  console.log(row);  // JSON object
});
```

#### Execute Query with Pagination
```typescript
// First page
const page1 = await invoke<QueryResult>('execute_query_stream', {
  connectionId: 'abc-123',
  sql: 'SELECT * FROM large_table',
  chunkSize: 1000,
  offset: 0
});

if (page1.hasMore) {
  // Next page
  const page2 = await invoke<QueryResult>('execute_query_stream', {
    connectionId: 'abc-123',
    sql: 'SELECT * FROM large_table',
    chunkSize: 1000,
    offset: 1000
  });
}
```

#### Cancel Query
```typescript
// Get backend PID first
const pid = await invoke<number>('get_backend_pid', {
  connectionId: 'abc-123'
});

// Cancel the query
await invoke('cancel_query', {
  connectionId: 'abc-123',
  backendPid: pid
});
```

### Schema Commands

#### List Schemas
```typescript
const schemas = await invoke<Schema[]>('list_schemas', {
  connectionId: 'abc-123'
});

schemas.forEach(schema => {
  console.log(`${schema.name} (${schema.owner})`);
  if (schema.isSystem) {
    console.log('  [System Schema]');
  }
});
```

#### List Tables
```typescript
// All tables
const allTables = await invoke<Table[]>('list_tables', {
  connectionId: 'abc-123',
  schema: null
});

// Specific schema
const publicTables = await invoke<Table[]>('list_tables', {
  connectionId: 'abc-123',
  schema: 'public'
});

publicTables.forEach(table => {
  console.log(`${table.schema}.${table.name}`);
  console.log(`  Type: ${table.tableType}`);
  console.log(`  Rows: ${table.rowCount}`);
  console.log(`  Size: ${table.size}`);
});
```

#### Get Table Columns
```typescript
const columns = await invoke<Column[]>('get_table_columns', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'users'
});

columns.forEach(col => {
  console.log(`${col.name} ${col.dataType}`);
  if (col.isPrimaryKey) console.log('  [PK]');
  if (col.isForeignKey) {
    console.log(`  → ${col.foreignKeyTable}.${col.foreignKeyColumn}`);
  }
  if (!col.isNullable) console.log('  NOT NULL');
  if (col.columnDefault) console.log(`  DEFAULT ${col.columnDefault}`);
});
```

#### Get Primary Keys
```typescript
const pks = await invoke<string[]>('get_primary_keys', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'users'
});

console.log(`Primary key: ${pks.join(', ')}`);
```

#### Get Indexes
```typescript
const indexes = await invoke<Index[]>('get_indexes', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'users'
});

indexes.forEach(idx => {
  console.log(`${idx.name}`);
  console.log(`  Type: ${idx.indexType}`);
  console.log(`  Columns: ${idx.columns.join(', ')}`);
  console.log(`  Unique: ${idx.isUnique}`);
  console.log(`  Size: ${idx.size}`);
});
```

#### Get Foreign Keys
```typescript
const fks = await invoke<ForeignKey[]>('get_foreign_keys', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'orders'
});

fks.forEach(fk => {
  console.log(`${fk.name}:`);
  console.log(`  ${fk.columns.join(', ')} →`);
  console.log(`  ${fk.foreignSchema}.${fk.foreignTable}.${fk.foreignColumns.join(', ')}`);
  console.log(`  ON DELETE ${fk.onDelete}`);
  console.log(`  ON UPDATE ${fk.onUpdate}`);
});
```

#### Get Constraints
```typescript
const constraints = await invoke<Constraint[]>('get_constraints', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'users'
});

constraints.forEach(con => {
  console.log(`${con.name} (${con.constraintType})`);
  console.log(`  ${con.definition}`);
});
```

#### Get Table Stats
```typescript
const stats = await invoke<TableStats>('get_table_stats', {
  connectionId: 'abc-123',
  schema: 'public',
  table: 'users'
});

console.log(`Total size: ${stats.totalSize}`);
console.log(`Table size: ${stats.tableSize}`);
console.log(`Indexes size: ${stats.indexesSize}`);
console.log(`Live rows: ${stats.nLiveTup}`);
console.log(`Dead rows: ${stats.nDeadTup}`);
console.log(`Sequential scans: ${stats.seqScan}`);
console.log(`Index scans: ${stats.idxScan}`);
console.log(`Last vacuum: ${stats.lastVacuum}`);
console.log(`Last analyze: ${stats.lastAnalyze}`);
```

## TypeScript Types

Generate TypeScript types from Rust:

```bash
cd apps/desktop/src-tauri
cargo install typeshare-cli
typeshare . --lang typescript --output-file ../src/types/backend.ts
```

Then import:

```typescript
import type {
  ConnectionProfile,
  ConnectionInfo,
  QueryResult,
  Schema,
  Table,
  Column,
  Index,
  ForeignKey,
  Constraint,
  TableStats,
} from './types/backend';
```

## React Hooks

### useDatabase Hook

```typescript
import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback } from 'react';
import type { ConnectionProfile, QueryResult } from './types/backend';

export function useDatabase() {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (profile: ConnectionProfile) => {
    setLoading(true);
    setError(null);
    try {
      const id = await invoke<string>('connect_database', { profile });
      setConnectionId(id);
      return id;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!connectionId) return;
    try {
      await invoke('disconnect_database', { connectionId });
      setConnectionId(null);
    } catch (err) {
      setError(err as string);
    }
  }, [connectionId]);

  const executeQuery = useCallback(async (sql: string) => {
    if (!connectionId) {
      throw new Error('Not connected to database');
    }
    return await invoke<QueryResult>('execute_query', {
      connectionId,
      sql,
      params: []
    });
  }, [connectionId]);

  return {
    connectionId,
    loading,
    error,
    connect,
    disconnect,
    executeQuery,
    isConnected: !!connectionId,
  };
}
```

### useSchema Hook

```typescript
import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback } from 'react';
import type { Schema, Table, Column } from './types/backend';

export function useSchema(connectionId: string | null) {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSchemas = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await invoke<Schema[]>('list_schemas', { connectionId });
      setSchemas(result);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const loadTables = useCallback(async (schema?: string) => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await invoke<Table[]>('list_tables', {
        connectionId,
        schema: schema || null
      });
      setTables(result);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const loadColumns = useCallback(async (schema: string, table: string) => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await invoke<Column[]>('get_table_columns', {
        connectionId,
        schema,
        table
      });
      setColumns(result);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  return {
    schemas,
    tables,
    columns,
    loading,
    loadSchemas,
    loadTables,
    loadColumns,
  };
}
```

## Complete Example Component

```typescript
import React, { useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { useSchema } from './hooks/useSchema';

export function DatabaseExplorer() {
  const {
    connectionId,
    loading: connecting,
    error: connectionError,
    connect,
    disconnect,
    executeQuery,
    isConnected,
  } = useDatabase();

  const {
    schemas,
    tables,
    columns,
    loading: schemaLoading,
    loadSchemas,
    loadTables,
    loadColumns,
  } = useSchema(connectionId);

  const handleConnect = async () => {
    try {
      await connect({
        name: 'Local Database',
        host: 'localhost',
        port: 5432,
        database: 'myapp',
        username: 'admin',
        password: 'secret',
        useSSH: false,
        sshConfig: null,
        tlsConfig: null,
        connectionTimeout: 10,
        statementTimeout: 30000,
        lockTimeout: 5000,
        idleTimeout: 300,
        readOnly: true,
      });
    } catch (err) {
      console.error('Connection failed:', err);
    }
  };

  useEffect(() => {
    if (isConnected) {
      loadSchemas();
    }
  }, [isConnected, loadSchemas]);

  const handleQueryClick = async () => {
    try {
      const result = await executeQuery('SELECT * FROM users LIMIT 10');
      console.log('Query result:', result);
    } catch (err) {
      console.error('Query failed:', err);
    }
  };

  return (
    <div>
      {!isConnected ? (
        <div>
          <button onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect to Database'}
          </button>
          {connectionError && <p style={{ color: 'red' }}>{connectionError}</p>}
        </div>
      ) : (
        <div>
          <button onClick={disconnect}>Disconnect</button>
          <button onClick={handleQueryClick}>Run Test Query</button>

          <h3>Schemas</h3>
          {schemaLoading ? (
            <p>Loading...</p>
          ) : (
            <ul>
              {schemas.map(schema => (
                <li key={schema.name} onClick={() => loadTables(schema.name)}>
                  {schema.name}
                </li>
              ))}
            </ul>
          )}

          <h3>Tables</h3>
          <ul>
            {tables.map(table => (
              <li
                key={`${table.schema}.${table.name}`}
                onClick={() => loadColumns(table.schema, table.name)}
              >
                {table.schema}.{table.name} ({table.rowCount} rows, {table.size})
              </li>
            ))}
          </ul>

          <h3>Columns</h3>
          <ul>
            {columns.map(col => (
              <li key={col.name}>
                {col.name}: {col.dataType}
                {col.isPrimaryKey && ' [PK]'}
                {col.isForeignKey && ` → ${col.foreignKeyTable}`}
                {!col.isNullable && ' NOT NULL'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Error Handling

All commands return `Result<T, String>` in Rust, which translates to throwing errors in TypeScript:

```typescript
try {
  const result = await invoke('execute_query', { ... });
} catch (error) {
  // error is a string with the error message
  console.error('Error:', error);

  // Parse error type
  if (error.includes('Connection not found')) {
    // Handle connection error
  } else if (error.includes('Query execution error')) {
    // Handle query error
  }
}
```

## Best Practices

1. **Always disconnect when done:**
   ```typescript
   useEffect(() => {
     return () => {
       if (connectionId) {
         disconnect();
       }
     };
   }, [connectionId, disconnect]);
   ```

2. **Handle connection timeouts:**
   ```typescript
   const profile = {
     ...baseProfile,
     connectionTimeout: 10,    // 10 seconds
     statementTimeout: 30000,  // 30 seconds
   };
   ```

3. **Use read-only mode for queries:**
   ```typescript
   const profile = {
     ...baseProfile,
     readOnly: true,  // Prevents accidental writes
   };
   ```

4. **Paginate large result sets:**
   ```typescript
   const loadMore = async (offset: number) => {
     const result = await invoke('execute_query_stream', {
       connectionId,
       sql: query,
       chunkSize: 100,
       offset
     });
     return result;
   };
   ```

5. **Test connections before storing credentials:**
   ```typescript
   const testBeforeConnect = async (profile: ConnectionProfile) => {
     try {
       const info = await invoke('test_connection', { profile });
       console.log('Connection OK:', info.serverVersion);
       return true;
     } catch (err) {
       console.error('Connection failed:', err);
       return false;
     }
   };
   ```

## Performance Tips

1. **Reuse connections:** Create one connection per database, reuse for multiple queries
2. **Use streaming for large results:** `execute_query_stream` instead of `execute_query`
3. **Batch schema operations:** Load all schemas/tables at once, cache in state
4. **Cancel long queries:** Use `cancel_query` when user navigates away
5. **Connection pooling:** Each connection supports up to 16 concurrent queries

## Troubleshooting

### "Connection not found"
- Connection was disconnected or never created
- Check if `connectionId` is still valid
- Reconnect if necessary

### "Query execution error: timeout"
- Query took longer than `statementTimeout`
- Increase timeout in connection profile
- Optimize query with indexes

### "Database connection error: connection refused"
- PostgreSQL not running
- Firewall blocking port
- Wrong host/port in profile

### "TLS error"
- Certificate path incorrect
- Certificate expired
- Try `verifyCa: false` for self-signed certs

## Resources

- [Tauri IPC Documentation](https://tauri.app/v2/reference/javascript/api/core/#invoke)
- [TypeShare Documentation](https://github.com/1Password/typeshare)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Need Help?** Check the full backend README at `/apps/desktop/src-tauri/README.md`
