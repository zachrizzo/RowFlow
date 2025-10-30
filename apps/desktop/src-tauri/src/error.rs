use serde::{Serialize, Serializer};
use thiserror::Error;

/// Custom error types for RowFlow
#[derive(Error, Debug)]
pub enum RowFlowError {
    #[error("Database connection error: {0}")]
    ConnectionError(String),

    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Query execution error: {0}")]
    QueryError(String),

    #[error("Query cancelled")]
    QueryCancelled,

    #[error("Schema introspection error: {0}")]
    SchemaError(String),

    #[error("SSH tunnel error: {0}")]
    SshTunnelError(String),

    #[error("TLS error: {0}")]
    TlsError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Invalid connection profile: {0}")]
    InvalidProfile(String),

    #[error("Pool error: {0}")]
    PoolError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

impl From<tokio_postgres::Error> for RowFlowError {
    fn from(err: tokio_postgres::Error) -> Self {
        RowFlowError::QueryError(err.to_string())
    }
}

impl From<deadpool_postgres::PoolError> for RowFlowError {
    fn from(err: deadpool_postgres::PoolError) -> Self {
        RowFlowError::PoolError(err.to_string())
    }
}

impl From<deadpool_postgres::BuildError> for RowFlowError {
    fn from(err: deadpool_postgres::BuildError) -> Self {
        RowFlowError::PoolError(err.to_string())
    }
}

impl From<native_tls::Error> for RowFlowError {
    fn from(err: native_tls::Error) -> Self {
        RowFlowError::TlsError(err.to_string())
    }
}

impl From<serde_json::Error> for RowFlowError {
    fn from(err: serde_json::Error) -> Self {
        RowFlowError::SerializationError(err.to_string())
    }
}

impl From<std::io::Error> for RowFlowError {
    fn from(err: std::io::Error) -> Self {
        RowFlowError::IoError(err.to_string())
    }
}

/// Implement Serialize for RowFlowError to work with Tauri commands
impl Serialize for RowFlowError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Convert RowFlowError to String for Tauri commands
impl From<RowFlowError> for String {
    fn from(err: RowFlowError) -> Self {
        err.to_string()
    }
}

/// Result type alias for RowFlow operations
pub type Result<T> = std::result::Result<T, RowFlowError>;
