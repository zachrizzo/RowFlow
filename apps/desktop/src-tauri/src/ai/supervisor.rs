use crate::error::{Result, RowFlowError};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tokio::time::sleep;

/// Manages the lifecycle of an Ollama subprocess for RowFlow
pub struct OllamaSupervisor {
    config: SupervisorConfig,
    state: Arc<Mutex<SupervisorState>>,
}

#[derive(Debug, Clone)]
pub struct SupervisorConfig {
    /// Port for the Ollama HTTP API (default: 11435 for RowFlow-managed instance)
    pub port: u16,
    /// Path to Ollama binary (bundled or system)
    pub binary_path: PathBuf,
    /// Directory for Ollama models
    pub models_dir: PathBuf,
    /// Whether to use a system Ollama installation if available
    pub prefer_system: bool,
    /// Maximum restart attempts before giving up
    pub max_restart_attempts: u32,
    /// Health check interval
    pub health_check_interval: Duration,
}

impl Default for SupervisorConfig {
    fn default() -> Self {
        Self {
            port: 11435,
            binary_path: PathBuf::new(),
            models_dir: PathBuf::new(),
            prefer_system: true,
            max_restart_attempts: 3,
            health_check_interval: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SupervisorState {
    pub status: OllamaProcessStatus,
    pub process_handle: Option<u32>, // PID
    pub restart_count: u32,
    pub last_health_check: Option<SystemTime>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OllamaProcessStatus {
    Stopped,
    Starting,
    Running,
    Unhealthy,
    Failed,
}

impl OllamaSupervisor {
    pub fn new(config: SupervisorConfig) -> Self {
        Self {
            config,
            state: Arc::new(Mutex::new(SupervisorState {
                status: OllamaProcessStatus::Stopped,
                process_handle: None,
                restart_count: 0,
                last_health_check: None,
                error_message: None,
            })),
        }
    }

    /// Initialize the supervisor and detect/prepare Ollama
    pub async fn initialize(&self) -> Result<()> {
        // Check if system Ollama is available and preferred
        if self.config.prefer_system {
            if let Some(system_path) = self.detect_system_ollama().await? {
                log::info!("Found system Ollama at: {}", system_path.display());
                // TODO: Check if system Ollama is running on default port
                return Ok(());
            }
        }

        // Ensure bundled binary exists
        if !self.config.binary_path.exists() {
            return Err(RowFlowError::OllamaError(
                "Ollama binary not found. Please install Ollama or bundle it with the app.".to_string(),
            ));
        }

        // Create models directory
        std::fs::create_dir_all(&self.config.models_dir)?;

        Ok(())
    }

    /// Start the Ollama process
    pub async fn start(&self) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if state.status == OllamaProcessStatus::Running {
            return Ok(());
        }

        state.status = OllamaProcessStatus::Starting;
        drop(state);

        // Spawn Ollama process
        let mut cmd = Command::new(&self.config.binary_path);
        cmd.env("OLLAMA_HOST", format!("127.0.0.1:{}", self.config.port))
            .env("OLLAMA_MODELS", &self.config.models_dir)
            .arg("serve")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        match cmd.spawn() {
            Ok(child) => {
                let pid = child.id();
                log::info!("Started Ollama process with PID: {}", pid);

                let mut state = self.state.lock().unwrap();
                state.process_handle = Some(pid);
                state.status = OllamaProcessStatus::Running;
                state.error_message = None;

                Ok(())
            }
            Err(err) => {
                let mut state = self.state.lock().unwrap();
                state.status = OllamaProcessStatus::Failed;
                state.error_message = Some(err.to_string());

                Err(RowFlowError::OllamaError(format!("Failed to start Ollama: {}", err)))
            }
        }
    }

    /// Stop the Ollama process gracefully
    pub async fn stop(&self) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if state.status == OllamaProcessStatus::Stopped {
            return Ok(());
        }

        if let Some(pid) = state.process_handle {
            log::info!("Stopping Ollama process with PID: {}", pid);

            // Send SIGTERM on Unix, use taskkill on Windows
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;

                if let Err(err) = kill(Pid::from_raw(pid as i32), Signal::SIGTERM) {
                    log::error!("Failed to send SIGTERM to Ollama: {}", err);
                }
            }

            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(&["/PID", &pid.to_string(), "/F"])
                    .output();
            }
        }

        state.status = OllamaProcessStatus::Stopped;
        state.process_handle = None;
        state.restart_count = 0;

        Ok(())
    }

    /// Check if Ollama process is healthy
    pub async fn health_check(&self) -> Result<bool> {
        let endpoint = format!("http://127.0.0.1:{}", self.config.port);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;

        match client.get(&format!("{}/api/version", endpoint)).send().await {
            Ok(response) => {
                let is_healthy = response.status().is_success();

                let mut state = self.state.lock().unwrap();
                state.last_health_check = Some(SystemTime::now());

                if is_healthy {
                    if state.status != OllamaProcessStatus::Running {
                        state.status = OllamaProcessStatus::Running;
                        state.restart_count = 0;
                    }
                } else {
                    state.status = OllamaProcessStatus::Unhealthy;
                }

                Ok(is_healthy)
            }
            Err(err) => {
                let mut state = self.state.lock().unwrap();
                state.status = OllamaProcessStatus::Unhealthy;
                state.last_health_check = Some(SystemTime::now());
                state.error_message = Some(err.to_string());

                Ok(false)
            }
        }
    }

    /// Attempt to restart the Ollama process
    pub async fn restart(&self) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if state.restart_count >= self.config.max_restart_attempts {
            state.status = OllamaProcessStatus::Failed;
            return Err(RowFlowError::OllamaError(
                "Max restart attempts exceeded".to_string(),
            ));
        }

        state.restart_count += 1;
        drop(state);

        log::info!("Attempting to restart Ollama (attempt {})", {
            let state = self.state.lock().unwrap();
            state.restart_count
        });

        self.stop().await?;
        sleep(Duration::from_secs(2)).await;
        self.start().await
    }

    /// Run the supervisor loop that monitors health and restarts if needed
    pub async fn supervise(&self) -> Result<()> {
        loop {
            sleep(self.config.health_check_interval).await;

            let is_healthy = self.health_check().await?;

            // TODO: Emit status event to frontend via Tauri events
            // This will be added once we verify the supervisor lifecycle works

            if !is_healthy {
                let state = self.state.lock().unwrap();
                if state.restart_count < self.config.max_restart_attempts {
                    drop(state);
                    log::warn!("Ollama unhealthy, attempting restart");
                    if let Err(err) = self.restart().await {
                        log::error!("Failed to restart Ollama: {}", err);
                    }
                } else {
                    log::error!("Ollama failed after max restart attempts");
                    break;
                }
            }
        }

        Ok(())
    }

    /// Detect system Ollama installation
    async fn detect_system_ollama(&self) -> Result<Option<PathBuf>> {
        // Check common locations
        let candidates = vec![
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            "/usr/bin/ollama",
        ];

        for path in candidates {
            let path = PathBuf::from(path);
            if path.exists() {
                return Ok(Some(path));
            }
        }

        // Try `which ollama` on Unix
        #[cfg(unix)]
        {
            if let Ok(output) = Command::new("which").arg("ollama").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Ok(Some(PathBuf::from(path)));
                    }
                }
            }
        }

        // Try `where ollama` on Windows
        #[cfg(windows)]
        {
            if let Ok(output) = Command::new("where").arg("ollama").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !path.is_empty() {
                        return Ok(Some(PathBuf::from(path)));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Get current supervisor status
    pub fn status(&self) -> SupervisorState {
        self.state.lock().unwrap().clone()
    }

    /// Get the endpoint URL for the managed Ollama instance
    pub fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.config.port)
    }
}
