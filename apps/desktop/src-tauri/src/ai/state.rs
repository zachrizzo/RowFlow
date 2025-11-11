use super::{OllamaClient, OllamaBundler, OllamaSupervisor, SupervisorConfig, VectorStore};
use crate::error::Result;
use std::path::PathBuf;
use std::sync::Arc;

pub struct EmbeddingState {
    vector_store: VectorStore,
    ollama_client: OllamaClient,
    supervisor: Option<Arc<OllamaSupervisor>>,
    bundler: OllamaBundler,
}

impl EmbeddingState {
    pub fn new(app_data_dir: PathBuf, resources_dir: PathBuf) -> Result<Self> {
        let vector_path = app_data_dir.join("ai").join("embeddings.db");
        let vector_store = VectorStore::new(vector_path)?;

        let bundler = OllamaBundler::new(app_data_dir.clone(), resources_dir);
        bundler.ensure_directories()?;

        // Initialize Ollama client with default endpoint for now
        // This will be updated if we start our own supervised instance
        let ollama_client = OllamaClient::new(None);

        Ok(Self {
            vector_store,
            ollama_client,
            supervisor: None,
            bundler,
        })
    }

    /// Initialize and start supervised Ollama instance
    pub async fn start_supervised_ollama(&mut self) -> Result<()> {
        // Check if we should use system Ollama or start our own
        if let Some(system_path) = super::detect_system_ollama() {
            log::info!("Using system Ollama at: {}", system_path.display());
            // System Ollama typically runs on default port 11434
            self.ollama_client = OllamaClient::new(Some("http://127.0.0.1:11434".to_string()));
            return Ok(());
        }

        // Install bundled Ollama if not already installed
        let binary_path = if !self.bundler.is_installed() {
            if self.bundler.is_bundled() {
                self.bundler.install()?
            } else {
                return Err(crate::error::RowFlowError::OllamaError(
                    "Ollama is not installed and no bundled version found".to_string(),
                ));
            }
        } else {
            self.bundler.binary_path().ok_or_else(|| {
                crate::error::RowFlowError::OllamaError("Failed to locate Ollama binary".to_string())
            })?
        };

        // Create supervisor config
        let config = SupervisorConfig {
            port: 11435, // Use different port from system Ollama
            binary_path,
            models_dir: self.bundler.models_dir(),
            prefer_system: true,
            max_restart_attempts: 3,
            health_check_interval: std::time::Duration::from_secs(30),
        };

        let supervisor = OllamaSupervisor::new(config);
        supervisor.initialize().await?;
        supervisor.start().await?;

        // Update Ollama client to use supervised endpoint
        let endpoint = supervisor.endpoint();
        self.ollama_client = OllamaClient::new(Some(endpoint));
        self.supervisor = Some(Arc::new(supervisor));

        log::info!("Supervised Ollama instance started");
        Ok(())
    }

    pub fn vector_store(&self) -> &VectorStore {
        &self.vector_store
    }

    pub fn ollama(&self) -> &OllamaClient {
        &self.ollama_client
    }

    pub fn supervisor(&self) -> Option<Arc<OllamaSupervisor>> {
        self.supervisor.clone()
    }

    pub fn bundler(&self) -> &OllamaBundler {
        &self.bundler
    }
}
