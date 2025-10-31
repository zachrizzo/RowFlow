# RowFlow MCP Server

Model Context Protocol (MCP) server that exposes PostgreSQL database tools for RowFlow.

## Features

- **pg.describe** - Get comprehensive schema metadata
- **pg.query** - Execute SELECT queries (read-only)
- **pg.explain** - Analyze query execution plans
- **pg.sample** - Get sample rows from tables
- **pg.locks** - Monitor database locks and blocking queries
- **pg.cancel** - Cancel running queries

## Installation

### From Source

```bash
cd apps/mcp-server
npm install
npm run build
```

### Global Installation

```bash
npm link
```

After linking, the `rowflow-mcp` command will be available globally.

## Configuration

### 1. Create Environment File

Copy the example environment file and configure your database profiles:

```bash
cp .env.example .env
```

### 2. Configure Database Profiles

Edit `.env` and add your PostgreSQL connection profiles. Each profile requires:

- `PG_PROFILE_<NAME>_HOST` - Database host
- `PG_PROFILE_<NAME>_PORT` - Database port
- `PG_PROFILE_<NAME>_DATABASE` - Database name
- `PG_PROFILE_<NAME>_USER` - Database user
- `PG_PROFILE_<NAME>_PASSWORD` - Database password
- `PG_PROFILE_<NAME>_SSL` - Enable SSL (optional, default: false)
- `PG_PROFILE_<NAME>_MAX_CONNECTIONS` - Max pool connections (optional, default: 10)

Example:

```env
PG_PROFILE_DEV_HOST=localhost
PG_PROFILE_DEV_PORT=5432
PG_PROFILE_DEV_DATABASE=mydb
PG_PROFILE_DEV_USER=postgres
PG_PROFILE_DEV_PASSWORD=postgres
```

### 3. Claude Desktop Configuration

Add the MCP server to your Claude Desktop configuration:

**macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rowflow": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp-server/dist/index.js"],
      "env": {
        "PG_PROFILE_DEV_HOST": "localhost",
        "PG_PROFILE_DEV_PORT": "5432",
        "PG_PROFILE_DEV_DATABASE": "mydb",
        "PG_PROFILE_DEV_USER": "postgres",
        "PG_PROFILE_DEV_PASSWORD": "postgres"
      }
    }
  }
}
```

**Alternative:** If you have the `.env` file:

```json
{
  "mcpServers": {
    "rowflow": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp-server/dist/index.js"],
      "cwd": "/absolute/path/to/apps/mcp-server"
    }
  }
}
```

## Tools Documentation

### pg.describe

Get comprehensive schema metadata including tables, columns, types, and comments.

**Inputs:**
- `profile` (string, required) - Connection profile name
- `schema` (string, optional) - Specific schema to describe

**Example:**
```json
{
  "profile": "dev",
  "schema": "public"
}
```

**Output:**
```json
{
  "schemas": [
    {
      "schemaName": "public",
      "tables": [
        {
          "tableName": "users",
          "tableType": "BASE TABLE",
          "comment": "User accounts",
          "columns": [
            {
              "columnName": "id",
              "dataType": "integer",
              "isNullable": false,
              "isPrimaryKey": true,
              "isForeignKey": false
            }
          ]
        }
      ]
    }
  ]
}
```

### pg.query

Execute SELECT queries against the database. Only SELECT statements are allowed.

**Inputs:**
- `profile` (string, required) - Connection profile name
- `sql` (string, required) - SELECT query to execute
- `params` (array, optional) - Parameterized query values
- `maxRows` (number, optional) - Maximum rows to return (default: 1000, max: 10000)

**Example:**
```json
{
  "profile": "dev",
  "sql": "SELECT * FROM users WHERE created_at > $1",
  "params": ["2024-01-01"],
  "maxRows": 100
}
```

**Output:**
```json
{
  "fields": [
    {"name": "id", "dataTypeID": 23, "dataType": "int4"},
    {"name": "email", "dataTypeID": 1043, "dataType": "varchar"}
  ],
  "rows": [
    {"id": 1, "email": "user@example.com"}
  ],
  "rowCount": 1,
  "truncated": false
}
```

### pg.explain

Get detailed query execution plan with EXPLAIN ANALYZE.

**Inputs:**
- `profile` (string, required) - Connection profile name
- `sql` (string, required) - Query to analyze

**Example:**
```json
{
  "profile": "dev",
  "sql": "SELECT * FROM users WHERE email = 'test@example.com'"
}
```

**Output:**
```json
{
  "plan": {
    "Node Type": "Seq Scan",
    "Relation Name": "users",
    "Startup Cost": 0.00,
    "Total Cost": 15.50
  },
  "executionTime": 0.123,
  "planningTime": 0.045
}
```

### pg.sample

Get sample rows from a table with intelligent pagination.

**Inputs:**
- `profile` (string, required) - Connection profile name
- `schema` (string, required) - Schema name
- `table` (string, required) - Table name
- `limit` (number, optional) - Number of rows (default: 100, max: 1000)

**Example:**
```json
{
  "profile": "dev",
  "schema": "public",
  "table": "users",
  "limit": 50
}
```

**Output:**
```json
{
  "fields": [...],
  "rows": [...],
  "rowCount": 50,
  "totalRows": 1000
}
```

### pg.locks

Get information about current database locks and blocking queries.

**Inputs:**
- `profile` (string, required) - Connection profile name

**Example:**
```json
{
  "profile": "dev"
}
```

**Output:**
```json
{
  "locks": [
    {
      "blockedPid": 12345,
      "blockedQuery": "UPDATE users SET ...",
      "blockedDuration": "5.2s",
      "blockingPid": 12344,
      "blockingQuery": "SELECT * FROM users FOR UPDATE",
      "blockingDuration": "10.5s",
      "lockType": "tuple",
      "relation": "users"
    }
  ],
  "blockerCount": 1
}
```

### pg.cancel

Cancel a running query by process ID (PID).

**WARNING:** This terminates the query immediately. Use with caution.

**Inputs:**
- `profile` (string, required) - Connection profile name
- `pid` (number, required) - Process ID to cancel

**Example:**
```json
{
  "profile": "dev",
  "pid": 12345
}
```

**Output:**
```json
{
  "success": true,
  "message": "Successfully cancelled query for PID 12345"
}
```

## Running the Server

### Development Mode

```bash
npm run dev
```

This runs TypeScript in watch mode and rebuilds on changes.

### Production Mode

```bash
npm run build
npm start
```

### As MCP Server

The server uses stdio transport and is designed to be run by MCP clients like Claude Desktop. It logs to stderr (not stdout, which is used for the MCP protocol).

## Security Features

### SQL Injection Prevention
- All queries use parameterized statements
- Input validation on all parameters
- Identifier sanitization for schema/table names

### Query Safety
- `pg.query` only allows SELECT statements
- DML/DDL operations (INSERT, UPDATE, DELETE, etc.) are blocked
- Dangerous keywords are detected and rejected

### Connection Security
- Connection pooling with limits
- Support for SSL connections
- Passwords are never logged
- Connection timeouts to prevent hanging

### Rate Limiting
- `maxRows` limits prevent excessive data transfer
- Default limits on all data-fetching operations
- Configurable pool sizes per profile

## Troubleshooting

### Server Not Starting

Check that:
1. Environment variables are properly configured
2. Database is accessible from your machine
3. User has necessary permissions

View logs in stderr output.

### Connection Errors

- Verify host, port, and database name
- Check firewall rules
- Ensure PostgreSQL accepts connections from your IP
- Try enabling SSL if required by your database

### Permission Denied

The database user needs:
- `SELECT` permission on tables for queries
- `EXECUTE` permission on `pg_cancel_backend()` for cancel tool
- Access to `information_schema` and `pg_catalog` for metadata

### Tool Not Found in Claude Desktop

1. Verify the path in `claude_desktop_config.json` is absolute
2. Ensure the server is built (`npm run build`)
3. Restart Claude Desktop after configuration changes
4. Check Claude Desktop logs for errors

## Development

### Project Structure

```
apps/mcp-server/
├── src/
│   ├── index.ts          # Main server entry point
│   ├── db.ts             # Database connection management
│   ├── types.ts          # TypeScript type definitions
│   ├── utils.ts          # Utility functions
│   └── tools/            # Tool implementations
│       ├── describe.ts
│       ├── query.ts
│       ├── explain.ts
│       ├── sample.ts
│       ├── locks.ts
│       └── cancel.ts
├── dist/                 # Compiled JavaScript output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Adding New Tools

1. Create a new file in `src/tools/`
2. Implement the handler function
3. Add tool definition in `src/index.ts` TOOLS array
4. Add case in CallToolRequestSchema handler
5. Update type definitions in `src/types.ts`

### Testing

```bash
# Install dependencies
npm install

# Build
npm run build

# Run automated test script
./test-connection.sh

# Or test manually with stdio transport
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

### Adding to Claude Code CLI

The easiest way to use this MCP server with Claude Code is via the CLI:

```bash
claude mcp add rowflow --command node --args "/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server/dist/index.js" --cwd "/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server"
```

Replace the paths with your actual project location.

**Or use the RowFlow Desktop App:**
1. Open RowFlow desktop app
2. Click the "MCP" badge in the Connections panel
3. Go to the "Setup" tab
4. Click "Copy Command" under Claude Code section
5. Run the command in your terminal
6. Restart Claude Code

## Next Steps

1. **Test the Tools** - Try each tool with your database
2. **Configure Multiple Profiles** - Set up dev, staging, prod profiles
3. **Security Review** - Ensure passwords are secure and not logged
4. **Performance Tuning** - Adjust pool sizes based on usage
5. **Monitoring** - Watch stderr logs for errors and performance issues

## License

MIT
