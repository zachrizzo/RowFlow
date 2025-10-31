# Connection Management - Usage Examples

## Example 1: Listing All Connections

**User asks Claude:**
> "What database connections do I have configured?"

**Claude calls:**
```json
{
  "tool": "pg.connection.list",
  "arguments": {}
}
```

**Response:**
```json
{
  "connections": [
    {
      "name": "dev",
      "host": "localhost",
      "port": 5432,
      "database": "myapp_dev",
      "user": "postgres",
      "ssl": false,
      "maxConnections": 10
    },
    {
      "name": "staging",
      "host": "staging-db.example.com",
      "port": 5432,
      "database": "myapp_staging",
      "user": "staging_user",
      "ssl": true,
      "maxConnections": 20
    }
  ],
  "count": 2
}
```

---

## Example 2: Adding a New Connection

**User asks Claude:**
> "Add a connection to my local PostgreSQL database. The database name is 'testdb', user is 'admin', and password is 'secret123'"

**Claude calls:**
```json
{
  "tool": "pg.connection.add",
  "arguments": {
    "name": "local",
    "host": "localhost",
    "port": 5432,
    "database": "testdb",
    "user": "admin",
    "password": "secret123",
    "ssl": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully added connection profile: local",
  "profileName": "local",
  "instructions": [
    "Profile has been added to .env file",
    "IMPORTANT: Restart the MCP server for changes to take effect",
    "If using Claude Desktop, restart the Claude Desktop app",
    "You can now use profile=\"local\" in other tools",
    "",
    "Security Note:",
    "- Passwords are stored in plain text in the .env file",
    "- Ensure .env file is in .gitignore",
    "- Use environment-specific credentials",
    "- Consider using connection string encryption for production"
  ]
}
```

**What happens:**
1. Connection is tested before adding (fails if cannot connect)
2. New profile added to `/apps/mcp-server/.env`:
   ```bash
   # LOCAL Profile (Added: 2024-10-30T16:52:00.000Z)
   PG_PROFILE_LOCAL_HOST=localhost
   PG_PROFILE_LOCAL_PORT=5432
   PG_PROFILE_LOCAL_DATABASE=testdb
   PG_PROFILE_LOCAL_USER=admin
   PG_PROFILE_LOCAL_PASSWORD=secret123
   PG_PROFILE_LOCAL_SSL=false
   ```
3. User must restart Claude Desktop for changes to take effect

---

## Example 3: Testing a Connection

**User asks Claude:**
> "Test the dev database connection"

**Claude calls:**
```json
{
  "tool": "pg.connection.test",
  "arguments": {
    "profile": "dev"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully connected to profile: dev",
  "serverVersion": "PostgreSQL 15.4 on x86_64-apple-darwin22.6.0, compiled by Apple clang version 14.0.3",
  "serverInfo": {
    "version": "PostgreSQL 15.4...",
    "currentDatabase": "myapp_dev",
    "currentUser": "postgres",
    "serverEncoding": "UTF8"
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Connection test failed for profile: dev",
  "error": "connection to server at \"localhost\" (127.0.0.1), port 5432 failed: Connection refused"
}
```

---

## Example 4: Complete Workflow - Adding and Using a Connection

**Step 1: Check existing connections**
```
User: "Show me my database connections"
Claude: [calls pg.connection.list]
Output: Shows "dev" and "staging" profiles
```

**Step 2: Add production connection**
```
User: "Add a production database connection at prod-db.example.com, database name is 'myapp_prod', user is 'prod_reader', password is 'prod_secret_123', and enable SSL"
Claude: [calls pg.connection.add with:
  name: "production"
  host: "prod-db.example.com"
  port: 5432
  database: "myapp_prod"
  user: "prod_reader"
  password: "prod_secret_123"
  ssl: true
]
Output: Success message with restart instructions
```

**Step 3: User restarts Claude Desktop**
```
User: [Quits and relaunches Claude Desktop]
```

**Step 4: Verify connection works**
```
User: "Test the production connection"
Claude: [calls pg.connection.test with profile: "production"]
Output: Connection successful, shows PostgreSQL version and info
```

**Step 5: Use the connection**
```
User: "Show me all tables in the production database"
Claude: [calls pg.describe with profile: "production"]
Output: Lists all schemas and tables
```

---

## Example 5: Error Handling - Duplicate Profile

**User asks Claude:**
> "Add a connection called 'dev' to my local database"

**Claude calls:**
```json
{
  "tool": "pg.connection.add",
  "arguments": {
    "name": "dev",
    "host": "localhost",
    "database": "newdb",
    "user": "admin",
    "password": "password"
  }
}
```

**Response:**
```json
{
  "success": false,
  "message": "Profile already exists",
  "error": "A profile named \"dev\" already exists. Please choose a different name."
}
```

---

## Example 6: Error Handling - Connection Test Failure

**User asks Claude:**
> "Add a connection to my database at wrong-host.example.com"

**Claude calls:**
```json
{
  "tool": "pg.connection.add",
  "arguments": {
    "name": "badhost",
    "host": "wrong-host.example.com",
    "port": 5432,
    "database": "mydb",
    "user": "user",
    "password": "pass"
  }
}
```

**Response:**
```json
{
  "success": false,
  "message": "Connection test failed",
  "error": "Unable to connect to database: getaddrinfo ENOTFOUND wrong-host.example.com"
}
```

**What happens:**
- Connection is tested BEFORE being added to .env
- If test fails, nothing is written to .env file
- User gets clear error message about what went wrong

---

## Example 7: Testing Non-Existent Profile

**User asks Claude:**
> "Test the production2 connection"

**Claude calls:**
```json
{
  "tool": "pg.connection.test",
  "arguments": {
    "profile": "production2"
  }
}
```

**Response:**
```json
{
  "success": false,
  "message": "Profile not found: production2",
  "error": "Available profiles: dev, staging, local"
}
```

---

## Integration with Other Tools

### After adding a connection, use it with existing tools:

**Query data:**
```
User: "Show me the first 10 users from the local database"
Claude: [calls pg.query with:
  profile: "local"
  sql: "SELECT * FROM users LIMIT 10"
]
```

**Get schema:**
```
User: "Describe all tables in the local database"
Claude: [calls pg.describe with profile: "local"]
```

**Sample data:**
```
User: "Show me sample data from the orders table in local"
Claude: [calls pg.sample with:
  profile: "local"
  schema: "public"
  table: "orders"
  limit: 50
]
```

**Check locks:**
```
User: "Check for database locks in local"
Claude: [calls pg.locks with profile: "local"]
```

---

## Security Best Practices from Examples

### Good: Environment-Specific Users
```json
{
  "name": "prod_readonly",
  "user": "readonly_user",  // Read-only user
  "password": "strong_password_123!"
}
```

### Good: SSL for Remote Connections
```json
{
  "name": "prod",
  "host": "prod-db.example.com",
  "ssl": true  // Always use SSL for remote databases
}
```

### Bad: Using Admin User
```json
{
  "name": "prod",
  "user": "postgres",  // DON'T use superuser for applications
  "password": "admin"  // DON'T use weak passwords
}
```

### Good: Descriptive Profile Names
```json
{
  "name": "prod_analytics_readonly",  // Clear, descriptive name
  "user": "analytics_reader"
}
```
