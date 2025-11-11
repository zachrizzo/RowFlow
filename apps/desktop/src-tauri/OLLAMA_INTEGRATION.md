# Ollama Integration Guide

## Overview

RowFlow integrates Ollama to provide AI-powered features like semantic search over database tables using embeddings. This document describes the architecture, bundling process, and usage.

## Architecture

### Components

1. **OllamaSupervisor** (`src/ai/supervisor.rs`)
   - Manages the lifecycle of an Ollama subprocess
   - Handles process start, stop, restart, and health checks
   - Monitors process health and automatically restarts on failure
   - Supports both system-installed and bundled Ollama

2. **OllamaBundler** (`src/ai/bundler.rs`)
   - Detects system Ollama installations
   - Manages bundled Ollama binaries per platform
   - Handles installation from bundled binaries to app data directory
   - Tracks model directory size and provides cleanup utilities

3. **OllamaClient** (`src/ai/ollama.rs`)
   - HTTP client for Ollama API
   - Handles `/api/version`, `/api/tags`, `/api/pull`, and `/api/embed` endpoints
   - Supports custom endpoint configuration

4. **VectorStore** (`src/ai/vector_store.rs`)
   - SQLite-based vector storage
   - Stores embeddings with metadata (connection, schema, table, row reference)
   - Implements cosine similarity search
   - Handles deduplication via chunk hashing

5. **EmbeddingState** (`src/ai/state.rs`)
   - Central state management for AI features
   - Coordinates supervisor, bundler, client, and vector store
   - Provides unified API for embedding operations

### Flow

1. **Initialization** (on app startup):
   ```
   App Start → EmbeddingState::new() → Detect System Ollama
                                     → If not found, prepare bundled binary
                                     → Initialize vector store DB
   ```

2. **First Launch** (user initiates):
   ```
   User Action → check_ollama_status → get_ollama_install_info
              → install_ollama (if needed) → start_ollama
              → OllamaSupervisor starts process
              → Health check loop begins
   ```

3. **Embedding Workflow**:
   ```
   embed_table → Fetch rows from Postgres
              → Serialize to text format
              → Call Ollama /api/embed
              → Store in VectorStore with metadata
   ```

4. **Search Workflow**:
   ```
   search_embeddings → Embed query text
                    → Cosine similarity search in VectorStore
                    → Return top-k matches with metadata
   ```

## Bundling Ollama Binaries

### Directory Structure

```
src-tauri/
└── resources/
    └── ollama/
        ├── macos/
        │   └── ollama          # macOS ARM64 binary
        ├── linux/
        │   └── ollama          # Linux x86_64 binary
        └── windows/
            └── ollama.exe      # Windows x86_64 binary
```

### Downloading Ollama Binaries

1. **macOS (ARM64)**:
   ```bash
   # Download from Ollama releases or extract from .dmg
   # https://ollama.com/download/mac

   # Or if you have Ollama installed:
   cp /usr/local/bin/ollama resources/ollama/macos/
   ```

2. **Linux (x86_64)**:
   ```bash
   # Download standalone binary
   curl -L https://ollama.com/download/ollama-linux-amd64 -o resources/ollama/linux/ollama
   chmod +x resources/ollama/linux/ollama
   ```

3. **Windows (x86_64)**:
   ```powershell
   # Download from Ollama releases
   # https://ollama.com/download/windows
   # Extract ollama.exe to resources/ollama/windows/
   ```

### Configuring Tauri to Bundle Resources

Update `tauri.conf.json`:

```json
{
  "bundle": {
    "resources": [
      "resources/ollama/*"
    ]
  }
}
```

### Runtime Installation

When RowFlow starts:
1. Checks for system Ollama (`/usr/local/bin/ollama`, etc.)
2. If not found, checks for bundled binary in `resources/ollama/<platform>/`
3. On first use, copies bundled binary to app data directory:
   - macOS: `~/Library/Application Support/com.rowflow.app/bin/`
   - Linux: `~/.local/share/rowflow/bin/`
   - Windows: `%APPDATA%\com.rowflow.app\bin\`
4. Sets up models directory in app data:
   - macOS: `~/Library/Application Support/com.rowflow.app/models/`
   - Linux: `~/.local/share/rowflow/models/`
   - Windows: `%APPDATA%\com.rowflow.app\models\`

## Usage

### Tauri Commands

#### Installation & Lifecycle

- `get_ollama_install_info()` - Get installation status and system info
- `install_ollama()` - Install bundled Ollama to app data directory
- `start_ollama()` - Start supervised Ollama instance
- `stop_ollama()` - Stop supervised Ollama instance
- `check_ollama_status()` - Check if Ollama is running and list models

#### Model Management

- `pull_ollama_model(model: string)` - Download a model from Ollama registry

#### Embeddings

- `embed_table(request: EmbeddingJobRequest)` - Generate embeddings for table rows
  ```typescript
  interface EmbeddingJobRequest {
    connectionId: string;
    schema: string;
    table: string;
    columns: string[];      // Columns to embed
    model: string;          // e.g., "nomic-embed-text"
    limit?: number;         // Optional row limit
  }
  ```

- `search_embeddings(request: EmbeddingSearchRequest)` - Semantic search
  ```typescript
  interface EmbeddingSearchRequest {
    connectionId: string;
    schema?: string;        // Optional filter
    table?: string;         // Optional filter
    query: string;          // Natural language query
    model: string;          // Must match embedding model
    topK: number;           // Number of results
  }
  ```

### Recommended Models

- **nomic-embed-text** (v1.5, 768 dimensions) - Best general-purpose embedding model
- **mxbai-embed-large** (1024 dimensions) - Higher quality, larger size
- **all-minilm** (384 dimensions) - Faster, smaller, good for prototyping

To download a model via UI:
```typescript
await invoke('pull_ollama_model', { model: 'nomic-embed-text' });
```

## Configuration

### Supervisor Settings

Default configuration (in `SupervisorConfig`):
- Port: `11435` (different from default Ollama `11434` to avoid conflicts)
- Max restart attempts: `3`
- Health check interval: `30 seconds`

### Vector Store

- Database: SQLite with WAL mode
- Location: `{APP_DATA}/ai/embeddings.db`
- Indexes: Composite unique index on `(connection_id, schema, table, row_reference, chunk_hash)`

## Troubleshooting

### Ollama Won't Start

1. Check logs for error messages
2. Verify binary has execute permissions (Unix)
3. Ensure port 11435 is not in use
4. Check disk space in models directory

### Models Not Downloading

1. Verify internet connectivity
2. Check Ollama service is running (`check_ollama_status`)
3. Ensure sufficient disk space

### Search Returns No Results

1. Verify embeddings were generated for the table
2. Ensure same model is used for embedding and search
3. Check connection/schema/table filters in search request

## Development

### Testing Locally

1. Install Ollama system-wide: `brew install ollama` (macOS)
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull nomic-embed-text`
4. Run RowFlow in dev mode: The supervisor will detect system Ollama

### Adding New Embedding Models

1. Add model name to recommended list in UI
2. Update documentation
3. No code changes needed - Ollama API is model-agnostic

## Security Considerations

- Ollama runs as a local subprocess, not exposed to network
- Models are stored locally, no data sent to external services
- Vector store is local SQLite, user data stays on device
- Consider adding data anonymization options for sensitive columns

## Performance

- Embedding generation: ~100-500 rows/minute (depends on model and hardware)
- Search latency: <100ms for databases with <10k embeddings (brute-force cosine)
- Storage: ~3KB per embedding (768-dim float32 + metadata)

### Future Optimizations

- HNSW index for sub-millisecond search on large datasets
- Batch embedding API for better throughput
- Incremental updates based on table change detection
- GPU acceleration via Ollama's CUDA/Metal support
