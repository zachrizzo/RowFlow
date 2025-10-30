# RowFlow MCP Server - Quick Start Guide

Get up and running with the RowFlow MCP server in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database accessible
- Claude Desktop (optional, for testing with Claude)

## Step 1: Install Dependencies

```bash
cd /Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server
npm install
```

## Step 2: Configure Database

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure at least one profile:

```env
PG_PROFILE_DEV_HOST=localhost
PG_PROFILE_DEV_PORT=5432
PG_PROFILE_DEV_DATABASE=your_database
PG_PROFILE_DEV_USER=your_user
PG_PROFILE_DEV_PASSWORD=your_password
```

## Step 3: Build the Server

```bash
npm run build
```

## Step 4: Test the Server

Test that the server starts correctly:

```bash
# This should output tool definitions
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## Step 5: Configure Claude Desktop

Edit your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "rowflow": {
      "command": "node",
      "args": ["/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server/dist/index.js"],
      "cwd": "/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server"
    }
  }
}
```

## Step 6: Restart Claude Desktop

Quit and restart Claude Desktop completely for the configuration to take effect.

## Step 7: Test in Claude

Try these prompts in Claude Desktop:

1. **List schemas:**
   "Can you describe my database schema using the dev profile?"

2. **Query data:**
   "Show me the first 10 rows from the users table in the public schema"

3. **Check performance:**
   "Can you explain the query plan for: SELECT * FROM users WHERE email = 'test@example.com'"

4. **Monitor locks:**
   "Are there any blocking queries in the database?"

## Available Tools

Once configured, you can use these tools in Claude:

- `pg.describe` - Get schema metadata
- `pg.query` - Run SELECT queries
- `pg.explain` - Analyze query performance
- `pg.sample` - Get sample rows from tables
- `pg.locks` - Check for blocking queries
- `pg.cancel` - Cancel running queries

## Troubleshooting

### "Profile not found" error

Make sure your `.env` file is in the correct location and follows the naming pattern:
```
PG_PROFILE_<NAME>_HOST=...
PG_PROFILE_<NAME>_PORT=...
etc.
```

### Connection timeout

- Check that PostgreSQL is running
- Verify the host and port are correct
- Ensure your firewall allows the connection
- Try `psql` with the same credentials to verify

### Claude Desktop doesn't see the tools

- Verify the absolute path in `claude_desktop_config.json`
- Ensure you ran `npm run build`
- Completely quit and restart Claude Desktop
- Check Claude Desktop's logs for errors

### "Only SELECT queries allowed" error

The `pg.query` tool only accepts SELECT statements for safety. Use the appropriate PostgreSQL client for DML/DDL operations.

## Next Steps

- Configure additional profiles (staging, production)
- Review the security features in README.md
- Explore advanced querying with parameterized queries
- Set up monitoring for long-running queries

## Need Help?

See the full documentation in [README.md](./README.md) for:
- Detailed tool documentation
- Security considerations
- Development guide
- Advanced configuration options
