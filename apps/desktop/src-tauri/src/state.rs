use crate::error::{Result, RowFlowError};
use crate::types::ConnectionProfile;
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use postgres_native_tls::MakeTlsConnector;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_postgres::NoTls;
use uuid::Uuid;

/// Application state managing database connections
pub struct AppState {
    connections: Arc<Mutex<HashMap<String, ConnectionPool>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a new database connection pool
    pub async fn create_connection(
        &self,
        profile: ConnectionProfile,
    ) -> Result<String> {
        let connection_id = Uuid::new_v4().to_string();

        // Build the connection pool
        let pool = Self::build_pool(&profile).await?;

        // Test the connection
        let client = pool.get().await.map_err(|e| {
            RowFlowError::ConnectionError(format!("Failed to get connection from pool: {}", e))
        })?;

        // Verify connection is working
        client
            .query_one("SELECT 1", &[])
            .await
            .map_err(|e| {
                RowFlowError::ConnectionError(format!("Connection test query failed: {}", e))
            })?;

        // Set session parameters
        Self::set_session_parameters(&client, &profile).await?;

        // Store the connection pool
        let mut connections = self.connections.lock().await;
        connections.insert(
            connection_id.clone(),
            ConnectionPool {
                pool,
                profile: profile.clone(),
            },
        );

        Ok(connection_id)
    }

    /// Get an existing connection pool
    pub async fn get_connection(&self, connection_id: &str) -> Result<Pool> {
        let connections = self.connections.lock().await;
        connections
            .get(connection_id)
            .map(|cp| cp.pool.clone())
            .ok_or_else(|| RowFlowError::ConnectionNotFound(connection_id.to_string()))
    }

    /// Get connection profile
    pub async fn get_profile(&self, connection_id: &str) -> Result<ConnectionProfile> {
        let connections = self.connections.lock().await;
        connections
            .get(connection_id)
            .map(|cp| cp.profile.clone())
            .ok_or_else(|| RowFlowError::ConnectionNotFound(connection_id.to_string()))
    }

    /// Remove a connection pool
    pub async fn remove_connection(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.lock().await;
        connections
            .remove(connection_id)
            .ok_or_else(|| RowFlowError::ConnectionNotFound(connection_id.to_string()))?;
        Ok(())
    }

    /// List all active connection IDs
    pub async fn list_connections(&self) -> Vec<String> {
        let connections = self.connections.lock().await;
        connections.keys().cloned().collect()
    }

    /// Build a connection pool from a profile
    async fn build_pool(profile: &ConnectionProfile) -> Result<Pool> {
        // Build tokio_postgres::Config
        let mut pg_config = tokio_postgres::Config::new();
        pg_config.host(&profile.host);
        pg_config.port(profile.port);
        pg_config.dbname(&profile.database);
        pg_config.user(&profile.username);

        if let Some(ref password) = profile.password {
            pg_config.password(password);
        }

        // Connection timeout
        if let Some(timeout) = profile.connection_timeout {
            pg_config.connect_timeout(std::time::Duration::from_secs(timeout));
        }

        // Manager configuration
        let manager_config = ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        };

        // TLS configuration
        if let Some(ref tls_config) = profile.tls_config {
            if tls_config.enabled {
                let mut builder = native_tls::TlsConnector::builder();

                // Verify CA
                builder.danger_accept_invalid_certs(!tls_config.verify_ca);

                // Load CA certificate if provided
                if let Some(ref ca_path) = tls_config.ca_cert_path {
                    let ca_cert = std::fs::read(ca_path)?;
                    let cert = native_tls::Certificate::from_pem(&ca_cert)?;
                    builder.add_root_certificate(cert);
                }

                // Load client certificate if provided
                if let (Some(ref cert_path), Some(ref key_path)) =
                    (&tls_config.client_cert_path, &tls_config.client_key_path) {
                    let cert = std::fs::read(cert_path)?;
                    let key = std::fs::read(key_path)?;
                    let identity = native_tls::Identity::from_pkcs8(&cert, &key)?;
                    builder.identity(identity);
                }

                let connector = builder.build()?;
                let tls_connector = MakeTlsConnector::new(connector);

                let manager = Manager::from_config(pg_config, tls_connector, manager_config);

                return Pool::builder(manager)
                    .max_size(16)
                    .build()
                    .map_err(|e| e.into());
            }
        }

        // No TLS
        let manager = Manager::from_config(pg_config, NoTls, manager_config);
        Pool::builder(manager)
            .max_size(16)
            .build()
            .map_err(|e| e.into())
    }

    /// Set session parameters for a connection
    async fn set_session_parameters(
        client: &deadpool_postgres::Client,
        profile: &ConnectionProfile,
    ) -> Result<()> {
        // Set read-only mode if requested
        if profile.read_only {
            client
                .execute("SET default_transaction_read_only = true", &[])
                .await?;
        }

        // Set statement timeout
        if let Some(timeout) = profile.statement_timeout {
            let query = format!("SET statement_timeout = {}", timeout);
            client.execute(&query, &[]).await?;
        }

        // Set lock timeout
        if let Some(timeout) = profile.lock_timeout {
            let query = format!("SET lock_timeout = {}", timeout);
            client.execute(&query, &[]).await?;
        }

        // Set idle in transaction timeout
        if let Some(timeout) = profile.idle_timeout {
            let query = format!("SET idle_in_transaction_session_timeout = {}", timeout * 1000);
            client.execute(&query, &[]).await?;
        }

        // Set timezone to UTC for consistency
        client.execute("SET timezone = 'UTC'", &[]).await?;

        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Wrapper for a connection pool with its profile
struct ConnectionPool {
    pool: Pool,
    profile: ConnectionProfile,
}
