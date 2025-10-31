# Connection Management Tools

The RowFlow MCP Server now includes 3 new tools for managing database connections directly from Claude.

## Tools Overview

### 1. `pg.connection.list`
Lists all available connection profiles with their details (passwords excluded).

**Input:** None

**Output:**
```json
{
  "connections": [
    {
      "name": "dev",
      "host": "localhost",
      "port": 5432,
      "database": "mydb_dev",
      "user": "postgres",
      "ssl": false,
      "maxConnections": 10
    }
  ],
  "count": 1
}
```

**Example Usage in Claude:**
- "Show me all my database connections"
- "List available PostgreSQL profiles"
- "What databases can I connect to?"

---

### 2. `pg.connection.add`
Adds a new connection profile to the `.env` file. The connection is tested before being added.

**Input:**
- `name` (string, required): Profile name (alphanumeric, converted to uppercase)
- `host` (string, required): Database host (e.g., localhost, db.example.com)
- `port` (number, optional): Database port (default: 5432)
- `database` (string, required): Database name
- `user` (string, required): Database user
- `password` (string, required): Database password
- `ssl` (boolean, optional): Enable SSL connection (default: false)
- `maxConnections` (number, optional): Maximum pool connections (default: 10)

**Output:**
```json
{
  "success": true,
  "message": "Successfully added connection profile: myprofile",
  "profileName": "myprofile",
  "instructions": [
    "Profile has been added to .env file",
    "IMPORTANT: Restart the MCP server for changes to take effect",
    "If using Claude Desktop, restart the Claude Desktop app",
    "You can now use profile=\"myprofile\" in other tools",
    "",
    "Security Note:",
    "- Passwords are stored in plain text in the .env file",
    "- Ensure .env file is in .gitignore",
    "- Use environment-specific credentials",
    "- Consider using connection string encryption for production"
  ]
}
```

**Example Usage in Claude:**
- "Add a connection to my local PostgreSQL database"
- "Create a new profile for my staging database at staging-db.example.com"
- "Connect to database 'myapp' on localhost with user 'admin'"

**After Adding:**
1. The profile is added to `/apps/mcp-server/.env`
2. You MUST restart the MCP server (or Claude Desktop app) for the change to take effect
3. The new profile will then be available for use with other tools

---

### 3. `pg.connection.test`
Tests a connection profile to verify connectivity and retrieve server information.

**Input:**
- `profile` (string, required): Connection profile name to test

**Output:**
```json
{
  "success": true,
  "message": "Successfully connected to profile: dev",
  "serverVersion": "PostgreSQL 15.4 on x86_64-apple-darwin22.6.0...",
  "serverInfo": {
    "version": "PostgreSQL 15.4...",
    "currentDatabase": "mydb_dev",
    "currentUser": "postgres",
    "serverEncoding": "UTF8"
  }
}
```

**Example Usage in Claude:**
- "Test the dev database connection"
- "Check if I can connect to staging"
- "Verify my production database is accessible"

---

## Connection Management Workflow

### Typical Workflow in Claude:

1. **Check existing connections:**
   ```
   User: "What database connections do I have?"
   Claude: [calls pg.connection.list]
   ```

2. **Add a new connection:**
   ```
   User: "Add a connection to my local database 'testdb'"
   Claude: [calls pg.connection.add with:
     name: "local"
     host: "localhost"
     port: 5432
     database: "testdb"
     user: "postgres"
     password: "<password>"
   ]
   ```

3. **Restart required:**
   - Exit Claude Desktop completely
   - Relaunch Claude Desktop
   - MCP server reloads with new profile

4. **Test the connection:**
   ```
   User: "Test the local connection"
   Claude: [calls pg.connection.test with profile: "local"]
   ```

5. **Use the connection:**
   ```
   User: "Show me tables in the local database"
   Claude: [calls pg.describe with profile: "local"]
   ```

---

## Security Considerations

### Plain Text Passwords
- Passwords are stored **unencrypted** in the `.env` file
- The `.env` file is excluded from git via `.gitignore`
- **Never commit** your `.env` file to version control

### Best Practices
1. Use read-only database users when possible
2. Create environment-specific profiles (dev, staging, prod)
3. Rotate credentials regularly
4. Use strong, unique passwords for each environment
5. Consider using PostgreSQL SSL connections for remote databases

### Production Recommendations
- Use connection string encryption
- Store credentials in a secrets manager (AWS Secrets Manager, Vault, etc.)
- Use IAM authentication when available
- Implement IP whitelisting on database servers

---

## File Structure

```
apps/mcp-server/
├── .env                           # Connection profiles (gitignored)
├── .env.example                   # Example configuration
├── src/
│   ├── connections.ts             # Connection management logic
│   ├── tools/
│   │   ├── connection-list.ts     # List profiles tool
│   │   ├── connection-add.ts      # Add profile tool
│   │   └── connection-test.ts     # Test profile tool
│   └── index.ts                   # MCP server (updated with new tools)
└── CONNECTION_MANAGEMENT.md       # This file
```

---

## Environment Variable Format

Profiles are stored in `.env` as:

```bash
# PROFILE_NAME Profile (Added: 2024-01-15T10:30:00Z)
PG_PROFILE_PROFILE_NAME_HOST=localhost
PG_PROFILE_PROFILE_NAME_PORT=5432
PG_PROFILE_PROFILE_NAME_DATABASE=mydb
PG_PROFILE_PROFILE_NAME_USER=postgres
PG_PROFILE_PROFILE_NAME_PASSWORD=secret123
PG_PROFILE_PROFILE_NAME_SSL=false
PG_PROFILE_PROFILE_NAME_MAX_CONNECTIONS=10
```

---

## Error Handling

### Connection Test Failures
- Invalid hostname
- Incorrect port
- Database doesn't exist
- Authentication failure
- Network connectivity issues

### Add Connection Failures
- Profile name already exists
- Invalid profile name (must be alphanumeric)
- Connection test fails before adding
- File system write errors

### Solutions
- Verify database is running
- Check firewall rules
- Confirm credentials
- Ensure proper network connectivity
- Validate `.env` file permissions

---

## Tool Count Update

The MCP server now has **9 tools** (previously 6):

1. `pg.describe` - Schema metadata
2. `pg.query` - Execute SELECT queries
3. `pg.explain` - Query execution plans
4. `pg.sample` - Sample table data
5. `pg.locks` - Database locks monitoring
6. `pg.cancel` - Cancel running queries
7. `pg.connection.list` - List connection profiles **[NEW]**
8. `pg.connection.add` - Add connection profile **[NEW]**
9. `pg.connection.test` - Test connection profile **[NEW]**

---

## Future Enhancements

Potential improvements for connection management:

- `pg.connection.remove` - Remove a profile
- `pg.connection.update` - Update profile settings
- Encrypted password storage
- Connection pooling statistics
- Support for connection strings
- Import/export profile configurations
- Connection health monitoring
- Auto-reconnect on connection loss
