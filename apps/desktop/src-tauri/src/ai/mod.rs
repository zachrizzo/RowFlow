pub mod agent;
pub mod bundler;
pub mod ollama;
pub mod state;
pub mod supervisor;
pub mod vector_store;

pub use crate::types::{
    EmbeddingSearchMatch, EmbeddingTableMetadata, OllamaModelInfo, OllamaStatus,
};
pub use agent::Agent;
pub use bundler::{detect_system_ollama, format_bytes, OllamaBundler};
pub use ollama::OllamaClient;
pub use state::EmbeddingState;
pub use supervisor::{OllamaSupervisor, SupervisorConfig};
pub use vector_store::{EmbeddingRecord, VectorStore};
