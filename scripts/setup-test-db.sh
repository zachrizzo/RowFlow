#!/bin/bash

# Setup script for RowFlow test PostgreSQL database
# This script can be used to set up a test database using Docker or a local PostgreSQL instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="rowflow_test"
DB_USER="rowflow_test"
DB_PASSWORD="test_password"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DOCKER_PORT="5433"

echo -e "${GREEN}RowFlow Test Database Setup${NC}"
echo "================================"
echo ""

# Function to check if Docker is available
check_docker() {
    if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to check if PostgreSQL client is available
check_psql() {
    if command -v psql &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to setup using Docker
setup_docker() {
    echo -e "${YELLOW}Setting up test database using Docker...${NC}"
    
    # Check if container already exists
    if docker ps -a --format '{{.Names}}' | grep -q "^rowflow-test-db$"; then
        echo -e "${YELLOW}Container 'rowflow-test-db' already exists.${NC}"
        read -p "Do you want to remove it and start fresh? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Stopping and removing existing container..."
            docker-compose -f docker-compose.test.yml down -v
        else
            echo "Starting existing container..."
            docker-compose -f docker-compose.test.yml up -d
            wait_for_db "localhost" "$DOCKER_PORT"
            echo -e "${GREEN}Test database is ready!${NC}"
            print_connection_info "localhost" "$DOCKER_PORT"
            return 0
        fi
    fi
    
    # Start the database
    echo "Starting PostgreSQL container..."
    docker-compose -f docker-compose.test.yml up -d
    
    # Wait for database to be ready
    wait_for_db "localhost" "$DOCKER_PORT"
    
    echo -e "${GREEN}Test database is ready!${NC}"
    print_connection_info "localhost" "$DOCKER_PORT"
}

# Function to setup using local PostgreSQL
setup_local() {
    echo -e "${YELLOW}Setting up test database using local PostgreSQL...${NC}"
    
    # Check if database already exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        echo -e "${YELLOW}Database '$DB_NAME' already exists.${NC}"
        read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Dropping existing database..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
        else
            echo -e "${GREEN}Using existing database.${NC}"
            print_connection_info "$DB_HOST" "$DB_PORT"
            return 0
        fi
    fi
    
    # Create database and user
    echo "Creating database and user..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U postgres <<EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
    
    # Run initialization script
    if [ -f "test-db-init.sql" ]; then
        echo "Running initialization script..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f test-db-init.sql
    else
        echo -e "${YELLOW}Warning: test-db-init.sql not found. Skipping initialization.${NC}"
    fi
    
    echo -e "${GREEN}Test database is ready!${NC}"
    print_connection_info "$DB_HOST" "$DB_PORT"
}

# Function to wait for database to be ready
wait_for_db() {
    local host=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    echo "Waiting for database to be ready..."
    while [ $attempt -lt $max_attempts ]; do
        if PGPASSWORD="$DB_PASSWORD" psql -h "$host" -p "$port" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
            echo -e "${GREEN}Database is ready!${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    echo -e "\n${RED}Database failed to become ready after ${max_attempts} seconds${NC}"
    return 1
}

# Function to print connection information
print_connection_info() {
    local host=$1
    local port=$2
    
    echo ""
    echo -e "${GREEN}Connection Information:${NC}"
    echo "  Host:     $host"
    echo "  Port:     $port"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo ""
    echo -e "${GREEN}Connection String:${NC}"
    echo "  postgresql://$DB_USER:$DB_PASSWORD@$host:$port/$DB_NAME"
    echo ""
    echo -e "${GREEN}For RowFlow connection profile:${NC}"
    echo "  Name:     Test Database"
    echo "  Host:     $host"
    echo "  Port:     $port"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo ""
}

# Main logic
if check_docker; then
    echo -e "${GREEN}Docker detected.${NC}"
    read -p "Do you want to use Docker? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        setup_docker
        exit 0
    fi
fi

if check_psql; then
    echo -e "${GREEN}PostgreSQL client detected.${NC}"
    echo "Setting up using local PostgreSQL instance..."
    echo "Note: You may need to provide PostgreSQL superuser password."
    setup_local
else
    echo -e "${RED}Error: Neither Docker nor PostgreSQL client (psql) found.${NC}"
    echo "Please install Docker or PostgreSQL client tools."
    exit 1
fi

