-- Test database initialization script for RowFlow
-- This script creates sample tables and data for testing

-- Create a test schema
CREATE SCHEMA IF NOT EXISTS test_schema;

-- Create sample tables with various data types
CREATE TABLE IF NOT EXISTS test_schema.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    full_name VARCHAR(100),
    age INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS test_schema.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    category VARCHAR(50),
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_available BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS test_schema.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES test_schema.users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES test_schema.products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS test_schema.logs (
    id BIGSERIAL PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON test_schema.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON test_schema.users(username);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON test_schema.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON test_schema.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON test_schema.logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_level ON test_schema.logs(level);

-- Insert sample data
INSERT INTO test_schema.users (username, email, full_name, age, is_active, metadata) VALUES
    ('alice', 'alice@example.com', 'Alice Smith', 28, true, '{"preferences": {"theme": "dark"}, "last_login": "2024-01-15T10:30:00Z"}'::jsonb),
    ('bob', 'bob@example.com', 'Bob Johnson', 35, true, '{"preferences": {"theme": "light"}, "last_login": "2024-01-14T15:20:00Z"}'::jsonb),
    ('charlie', 'charlie@example.com', 'Charlie Brown', 22, false, '{"preferences": {"theme": "auto"}}'::jsonb),
    ('diana', 'diana@example.com', 'Diana Prince', 30, true, '{"preferences": {"theme": "dark"}, "notifications": true}'::jsonb),
    ('eve', 'eve@example.com', 'Eve Wilson', 27, true, NULL)
ON CONFLICT (username) DO NOTHING;

INSERT INTO test_schema.products (name, description, price, stock_quantity, category, tags) VALUES
    ('Laptop', 'High-performance laptop', 1299.99, 15, 'Electronics', ARRAY['laptop', 'computer', 'tech']),
    ('Mouse', 'Wireless mouse', 29.99, 50, 'Electronics', ARRAY['mouse', 'peripheral', 'wireless']),
    ('Keyboard', 'Mechanical keyboard', 89.99, 30, 'Electronics', ARRAY['keyboard', 'mechanical', 'gaming']),
    ('Monitor', '27-inch 4K monitor', 399.99, 10, 'Electronics', ARRAY['monitor', '4k', 'display']),
    ('Desk', 'Standing desk', 599.99, 5, 'Furniture', ARRAY['desk', 'furniture', 'standing'])
ON CONFLICT DO NOTHING;

INSERT INTO test_schema.orders (user_id, product_id, quantity, total_amount, status, notes) VALUES
    (1, 1, 1, 1299.99, 'completed', 'Express shipping'),
    (1, 2, 2, 59.98, 'pending', NULL),
    (2, 3, 1, 89.99, 'completed', 'Gift wrapping requested'),
    (2, 4, 1, 399.99, 'shipped', NULL),
    (4, 5, 1, 599.99, 'pending', 'Delivery to office'),
    (4, 2, 1, 29.99, 'completed', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO test_schema.logs (level, message, context) VALUES
    ('INFO', 'User logged in', '{"user_id": 1, "ip": "192.168.1.100"}'::jsonb),
    ('WARN', 'Low stock warning', '{"product_id": 5, "current_stock": 5, "threshold": 10}'::jsonb),
    ('ERROR', 'Payment processing failed', '{"order_id": 2, "error_code": "PAYMENT_001"}'::jsonb),
    ('INFO', 'Order shipped', '{"order_id": 4, "tracking_number": "TRACK123456"}'::jsonb),
    ('DEBUG', 'Cache cleared', '{"cache_type": "user_sessions"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Create a view
CREATE OR REPLACE VIEW test_schema.user_order_summary AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.total_amount), 0) AS total_spent,
    MAX(o.order_date) AS last_order_date
FROM test_schema.users u
LEFT JOIN test_schema.orders o ON u.id = o.user_id
GROUP BY u.id, u.username, u.email;

-- Create a function
CREATE OR REPLACE FUNCTION test_schema.get_user_stats(user_id INTEGER)
RETURNS TABLE (
    total_orders BIGINT,
    total_spent NUMERIC,
    favorite_category TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT o.id)::BIGINT AS total_orders,
        COALESCE(SUM(o.total_amount), 0) AS total_spent,
        MODE() WITHIN GROUP (ORDER BY p.category) AS favorite_category
    FROM test_schema.orders o
    JOIN test_schema.products p ON o.product_id = p.id
    WHERE o.user_id = get_user_stats.user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA test_schema TO rowflow_test;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA test_schema TO rowflow_test;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA test_schema TO rowflow_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_schema TO rowflow_test;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA test_schema GRANT ALL ON TABLES TO rowflow_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA test_schema GRANT ALL ON SEQUENCES TO rowflow_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA test_schema GRANT EXECUTE ON FUNCTIONS TO rowflow_test;

