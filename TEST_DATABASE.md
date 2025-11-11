# Test PostgreSQL Database Setup

This guide explains how to set up a test PostgreSQL database for RowFlow development and testing.

## Quick Start

### Option 1: Using Docker (Recommended)

The easiest way to set up a test database is using Docker Compose:

```bash
# Start the test database
docker-compose -f docker-compose.test.yml up -d

# Check if it's running
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs -f

# Stop the database
docker-compose -f docker-compose.test.yml down

# Stop and remove all data
docker-compose -f docker-compose.test.yml down -v
```

### Option 2: Using the Setup Script

The setup script automatically detects Docker or local PostgreSQL and sets up the database:

```bash
# Run the setup script
./scripts/setup-test-db.sh
```

The script will:
- Detect if Docker is available
- Create the test database and user
- Run the initialization SQL script with sample data
- Print connection information

### Option 3: Manual Setup

If you have PostgreSQL installed locally:

```bash
# Create database and user
psql -U postgres <<EOF
CREATE USER rowflow_test WITH PASSWORD 'test_password';
CREATE DATABASE rowflow_test OWNER rowflow_test;
GRANT ALL PRIVILEGES ON DATABASE rowflow_test TO rowflow_test;
EOF

# Run initialization script
psql -U rowflow_test -d rowflow_test -f test-db-init.sql
```

## Connection Details

### Docker Setup
- **Host**: `localhost`
- **Port**: `5433` (to avoid conflicts with existing PostgreSQL on 5432)
- **Database**: `rowflow_test`
- **Username**: `rowflow_test`
- **Password**: `test_password`

### Local Setup
- **Host**: `localhost`
- **Port**: `5432` (or your PostgreSQL port)
- **Database**: `rowflow_test`
- **Username**: `rowflow_test`
- **Password**: `test_password`

## Connection String

```
postgresql://rowflow_test:test_password@localhost:5433/rowflow_test
```

## Test Data

The initialization script (`test-db-init.sql`) creates:

### Schemas
- `test_schema` - Main test schema

### Tables
- `users` - Sample user data with JSONB metadata
- `products` - Product catalog with array fields
- `orders` - Order records with foreign keys
- `logs` - Log entries with JSONB context

### Views
- `user_order_summary` - Aggregated user order statistics

### Functions
- `get_user_stats(user_id)` - Returns user statistics

### Sample Data
- 5 users with various attributes
- 5 products across different categories
- 6 orders with different statuses
- 5 log entries with different levels

## Using in RowFlow

### Create Connection Profile

1. Open RowFlow
2. Click "New Connection" or press `⌘N` / `Ctrl+N`
3. Fill in the connection details:
   - **Name**: Test Database
   - **Host**: `localhost`
   - **Port**: `5433` (Docker) or `5432` (local)
   - **Database**: `rowflow_test`
   - **Username**: `rowflow_test`
   - **Password**: `test_password`
4. Click "Test Connection" to verify
5. Click "Save" and then "Connect"

### Example Queries

Once connected, try these queries:

```sql
-- View all users
SELECT * FROM test_schema.users;

-- View user order summary
SELECT * FROM test_schema.user_order_summary;

-- Get user statistics
SELECT * FROM test_schema.get_user_stats(1);

-- Query with JSONB
SELECT username, metadata->'preferences'->>'theme' as theme
FROM test_schema.users
WHERE metadata->'preferences'->>'theme' = 'dark';

-- Query with arrays
SELECT name, tags
FROM test_schema.products
WHERE 'gaming' = ANY(tags);

-- Join query
SELECT u.username, p.name, o.quantity, o.total_amount
FROM test_schema.orders o
JOIN test_schema.users u ON o.user_id = u.id
JOIN test_schema.products p ON o.product_id = p.id
ORDER BY o.order_date DESC;
```

## Troubleshooting

### Port Already in Use

If port 5433 is already in use, edit `docker-compose.test.yml` and change the port mapping:

```yaml
ports:
  - "5434:5432"  # Change 5433 to 5434 or another port
```

### Permission Denied

If you get permission errors with the setup script:

```bash
chmod +x scripts/setup-test-db.sh
```

### Database Already Exists

If the database already exists and you want to recreate it:

```bash
# Docker
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d

# Local PostgreSQL
psql -U postgres -c "DROP DATABASE IF EXISTS rowflow_test;"
./scripts/setup-test-db.sh
```

### Connection Refused

Make sure PostgreSQL is running:

```bash
# Docker
docker-compose -f docker-compose.test.yml ps

# Local PostgreSQL (macOS)
brew services list | grep postgresql

# Local PostgreSQL (Linux)
sudo systemctl status postgresql
```

## Resetting Test Data

To reset the test data:

```bash
# Docker
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d

# Local PostgreSQL
psql -U rowflow_test -d rowflow_test -f test-db-init.sql
```

## Customization

You can customize the test database by:

1. Editing `test-db-init.sql` to add more tables, data, or functions
2. Modifying `docker-compose.test.yml` to change ports, PostgreSQL version, or environment variables
3. Updating the setup script to change default values

## Notes

- The Docker setup uses PostgreSQL 16 Alpine image for a lightweight container
- Data persists in a Docker volume (`postgres-test-data`)
- The initialization script is idempotent (safe to run multiple times)
- All test data uses the `test_schema` schema to avoid conflicts with other databases

