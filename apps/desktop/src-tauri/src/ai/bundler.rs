use crate::error::{Result, RowFlowError};
use std::fs;
use std::path::{Path, PathBuf};

/// Platform-specific Ollama binary information
#[derive(Debug, Clone)]
pub struct OllamaBundleInfo {
    pub platform: Platform,
    pub binary_name: String,
    pub bundled_path: PathBuf,
    pub install_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Platform {
    MacOS,
    Linux,
    Windows,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Platform::MacOS
        } else if cfg!(target_os = "linux") {
            Platform::Linux
        } else if cfg!(target_os = "windows") {
            Platform::Windows
        } else {
            panic!("Unsupported platform")
        }
    }

    pub fn binary_name(&self) -> &str {
        match self {
            Platform::MacOS | Platform::Linux => "ollama",
            Platform::Windows => "ollama.exe",
        }
    }

    pub fn bundled_subdir(&self) -> &str {
        match self {
            Platform::MacOS => "macos",
            Platform::Linux => "linux",
            Platform::Windows => "windows",
        }
    }
}

/// Manages bundled Ollama binaries
pub struct OllamaBundler {
    app_data_dir: PathBuf,
    resources_dir: PathBuf,
}

impl OllamaBundler {
    pub fn new(app_data_dir: PathBuf, resources_dir: PathBuf) -> Self {
        Self { app_data_dir, resources_dir }
    }

    /// Get information about the bundled Ollama binary for current platform
    pub fn bundle_info(&self) -> OllamaBundleInfo {
        let platform = Platform::current();
        let binary_name = platform.binary_name().to_string();

        let bundled_path =
            self.resources_dir.join("ollama").join(platform.bundled_subdir()).join(&binary_name);

        let install_path = self.app_data_dir.join("bin").join(&binary_name);

        OllamaBundleInfo { platform, binary_name, bundled_path, install_path }
    }

    /// Check if Ollama is installed in the app data directory
    pub fn is_installed(&self) -> bool {
        let info = self.bundle_info();
        info.install_path.exists()
    }

    /// Check if bundled Ollama binary exists in resources
    pub fn is_bundled(&self) -> bool {
        let info = self.bundle_info();
        info.bundled_path.exists()
    }

    /// Install the bundled Ollama binary to app data directory
    pub fn install(&self) -> Result<PathBuf> {
        let info = self.bundle_info();

        if !info.bundled_path.exists() {
            return Err(RowFlowError::OllamaError(format!(
                "Bundled Ollama binary not found at: {}",
                info.bundled_path.display()
            )));
        }

        // Create bin directory
        if let Some(parent) = info.install_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Copy binary
        log::info!(
            "Installing Ollama from {} to {}",
            info.bundled_path.display(),
            info.install_path.display()
        );

        fs::copy(&info.bundled_path, &info.install_path)?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&info.install_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&info.install_path, perms)?;
        }

        log::info!("Ollama installed successfully");
        Ok(info.install_path)
    }

    /// Get the path to the Ollama binary (installed or bundled)
    pub fn binary_path(&self) -> Option<PathBuf> {
        let info = self.bundle_info();

        if info.install_path.exists() {
            Some(info.install_path)
        } else if info.bundled_path.exists() {
            Some(info.bundled_path)
        } else {
            None
        }
    }

    /// Setup models directory in app data
    pub fn models_dir(&self) -> PathBuf {
        self.app_data_dir.join("models")
    }

    /// Ensure all necessary directories exist
    pub fn ensure_directories(&self) -> Result<()> {
        let models_dir = self.models_dir();
        fs::create_dir_all(&models_dir)?;

        let bin_dir = self.app_data_dir.join("bin");
        fs::create_dir_all(&bin_dir)?;

        log::info!("Ollama directories initialized");
        Ok(())
    }

    /// Get the size of the models directory
    pub fn models_size(&self) -> Result<u64> {
        let models_dir = self.models_dir();
        if !models_dir.exists() {
            return Ok(0);
        }

        let mut total_size = 0u64;
        for entry in fs::read_dir(&models_dir)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            if metadata.is_file() {
                total_size += metadata.len();
            } else if metadata.is_dir() {
                total_size += self.dir_size(&entry.path())?;
            }
        }

        Ok(total_size)
    }

    fn dir_size(&self, path: &Path) -> Result<u64> {
        let mut total = 0u64;
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            if metadata.is_file() {
                total += metadata.len();
            } else if metadata.is_dir() {
                total += self.dir_size(&entry.path())?;
            }
        }
        Ok(total)
    }

    /// Clear the models directory
    pub fn clear_models(&self) -> Result<()> {
        let models_dir = self.models_dir();
        if models_dir.exists() {
            fs::remove_dir_all(&models_dir)?;
            fs::create_dir_all(&models_dir)?;
            log::info!("Models directory cleared");
        }
        Ok(())
    }
}

/// Detect if system Ollama is available
pub fn detect_system_ollama() -> Option<PathBuf> {
    // Check common installation paths
    let candidates = if cfg!(target_os = "macos") {
        vec![
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            "/Applications/Ollama.app/Contents/MacOS/ollama",
        ]
    } else if cfg!(target_os = "linux") {
        vec!["/usr/local/bin/ollama", "/usr/bin/ollama", "/snap/bin/ollama"]
    } else if cfg!(target_os = "windows") {
        vec![r"C:\Program Files\Ollama\ollama.exe", r"C:\Program Files (x86)\Ollama\ollama.exe"]
    } else {
        vec![]
    };

    for path_str in candidates {
        let path = PathBuf::from(path_str);
        if path.exists() {
            return Some(path);
        }
    }

    // Try PATH lookup
    which::which("ollama").ok()
}

/// Format bytes to human-readable string
pub fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;

    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }

    format!("{:.2} {}", size, UNITS[unit_idx])
}
