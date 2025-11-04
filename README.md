# RowFlow

<div align="center">

**A modern, beautiful PostgreSQL database viewer with Model Context Protocol (MCP) support**

[![Tauri](https://img.shields.io/badge/Tauri-2.1-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.83-000000?logo=rust)](https://www.rust-lang.org/)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Building](#building)
- [Usage](#usage)
- [MCP Server](#mcp-server)
- [Project Structure](#project-structure)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

RowFlow is a cross-platform desktop application for viewing and managing PostgreSQL databases. Built with Tauri 2.1, React 18, TypeScript, and Rust, it provides a modern, keyboard-first interface for database exploration with AI integration via the Model Context Protocol (MCP).

### Key Highlights

- ⚡ **Lightweight**: Built with Tauri for native performance and small bundle size (~25 MB)
- 🎨 **Beautiful UI**: Dark theme with smooth animations and modern design
- ⌨️ **Keyboard-First**: Every action accessible via keyboard shortcuts
- 🔒 **Secure**: Read-only mode, TLS/SSL support, connection pooling
- 🤖 **AI-Ready**: Built-in MCP server for Claude Desktop integration
- 🚀 **Performant**: Virtualized grids handle 100k+ rows smoothly

---

## ✨ Features

### Connection Management
- ✅ Create, edit, and delete connection profiles
- ✅ Test connections before saving
- ✅ Secure credential storage via Tauri Store
- ✅ Connection status indicators
- ✅ Multiple active connections
- ✅ TLS/SSL configuration
- ✅ SSH tunnel support (types defined, implementation pending)
- ✅ Configurable timeouts (statement, lock, idle transaction)
- ✅ Read-only mode toggle

### Schema Browser
- ✅ Hierarchical tree view (Schemas → Tables/Views → Columns)
- ✅ Icon-coded nodes with color indicators
- ✅ Smooth expand/collapse animations
- ✅ Debounced search (300ms)
- ✅ Filter badges (All, Tables, Views)
- ✅ Context menu with copy actions
- ✅ Double-click to insert SELECT queries
- ✅ Detailed metadata dialogs
- ✅ Lazy loading for performance
- ✅ Statistics display (total schemas, tables, views)

### Query Editor
- ✅ Monaco Editor with PostgreSQL syntax highlighting
- ✅ Auto-completion (keywords, functions)
- ✅ Line numbers and minimap
- ✅ Multi-cursor support
- ✅ Find/replace built-in
- ✅ SQL formatting with `sql-formatter`
- ✅ Multiple query tabs with persistence
- ✅ Editable tab titles
- ✅ Query execution with progress indicators
- ✅ Query cancellation support
- ✅ Execution time tracking

### Results Grid
- ✅ Virtualized table (TanStack Table + Virtual)
- ✅ Handles 100k+ rows smoothly
- ✅ Sticky header with column types
- ✅ Column resizing
- ✅ Cell selection and copy
- ✅ JSON/Array expansion in dialog
- ✅ Smart cell rendering:
  - NULL: gray italic
  - Boolean: ✓/✗ icons
  - Numbers: right-aligned
  - Dates: orange colored
  - JSON/Arrays: expandable with preview
- ✅ Zebra striping
- ✅ Export to CSV/JSON
- ✅ Copy to clipboard (CSV/JSON/TSV)

### Command Palette
- ✅ Global keyboard access (⌘K / Ctrl+K)
- ✅ 25+ commands across 7 categories
- ✅ Fuzzy search
- ✅ Keyboard navigation (↑/↓, Enter, Esc)
- ✅ Recent commands (last 10)
- ✅ Contextual availability
- ✅ Visual feedback with icons and colors

### MCP Server
- ✅ 6 PostgreSQL tools for AI integration
- ✅ SELECT-only enforcement for security
- ✅ Connection pooling
- ✅ Query execution with limits
- ✅ Schema introspection
- ✅ Query plan analysis (EXPLAIN)
- ✅ Lock monitoring
- ✅ Query cancellation

---

## 🛠 Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Tauri** | 2.1.0 | Desktop framework |
| **React** | 18.3.1 | UI library |
| **TypeScript** | 5.6.3 | Type safety |
| **Vite** | 5.4.11 | Build tool |
| **Tailwind CSS** | 3.4.15 | Styling |
| **shadcn/ui** | Latest | UI components |
| **Monaco Editor** | 4.6.0 | SQL editor |
| **TanStack Table** | 8.20.5 | Data grid |
| **TanStack Virtual** | 3.10.8 | Virtualization |
| **cmdk** | 1.0.0 | Command palette |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Rust** | 1.83.0 | Backend language |
| **tokio-postgres** | 0.7.12 | PostgreSQL driver |
| **deadpool-postgres** | 0.14.0 | Connection pooling |
| **native-tls** | 0.2 | TLS/SSL support |
| **async-ssh2-tokio** | 0.8 | SSH tunnel support |
| **typeshare** | 1.0.3 | TypeScript type generation |

### MCP Server
| Technology | Version | Purpose |
|------------|---------|---------|
| **@modelcontextprotocol/sdk** | 1.0.4 | MCP protocol |
| **pg** (Node.js) | 8.13.1 | PostgreSQL client |
| **TypeScript** | 5.6.3 | Type safety |

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0 (recommended package manager)
- **Rust** >= 1.83.0 (for Tauri backend)
- **PostgreSQL** (for testing connections)

### Installing Prerequisites

#### Node.js & pnpm
```bash
# Install Node.js via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Install pnpm
npm install -g pnpm@9.15.0
```

#### Rust
```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

#### macOS Dependencies (for Tauri)
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install system dependencies
brew install libssl
```

#### Linux Dependencies (for Tauri)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel.x86_64 \
    openssl-devel \
    curl \
    wget \
    file \
    libX11-devel \
    libXdo-devel \
    libappindicator \
    librsvg2-devel
```

#### Windows Dependencies (for Tauri)
- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

---

## 🚀 Installation

### Clone the Repository

```bash
git clone https://github.com/zachrizzo/RowFlow.git
cd RowFlow
```

### Install Dependencies

```bash
# Install all dependencies (frontend + MCP server)
pnpm install
```

This will install dependencies for:
- Root workspace
- `apps/desktop` (Tauri app)
- `apps/mcp-server` (MCP server)
- `packages/rust-shared` (shared Rust code)

---

## 💻 Development

### Start Development Server

```bash
# Start Tauri dev server (builds MCP server automatically)
pnpm dev
```

This command will:
1. Build the MCP server
2. Start the Tauri development server
3. Launch the desktop application

The app will hot-reload on file changes.

### Run Individual Commands

```bash
# Build MCP server only
pnpm build:mcp

# Run desktop app dev server only
pnpm --filter @rowflow/desktop dev

# Run Tauri dev (includes MCP build)
pnpm --filter @rowflow/desktop tauri:dev
```

### Linting & Formatting

```bash
# Lint TypeScript and Rust
pnpm lint

# Format all code
pnpm format

# Check formatting without changes
pnpm format:check
```

### Testing

```bash
# Run all tests
pnpm test

# Run E2E tests (if configured)
pnpm test:e2e
```

---

## 🏗 Building

### Build for Production

```bash
# Build everything (MCP server + desktop app)
pnpm build
```

This will:
1. Build the MCP server (`apps/mcp-server/dist/`)
2. Build the Tauri desktop app
3. Create platform-specific bundles in `apps/desktop/src-tauri/target/release/bundle/`

### Build Individual Components

```bash
# Build MCP server only
pnpm build:mcp

# Build desktop app only
pnpm build:desktop

# Build Rust backend only
pnpm build:rust
```

### Build Artifacts

After building, you'll find installers in:

- **macOS**: `apps/desktop/src-tauri/target/release/bundle/dmg/RowFlow_*.dmg`
- **Windows**: `apps/desktop/src-tauri/target/release/bundle/msi/RowFlow_*.msi`
- **Linux**: `apps/desktop/src-tauri/target/release/bundle/appimage/RowFlow_*.AppImage`

---

## 📖 Usage

### Creating a Connection

1. Click the **"New Connection"** button or press `⌘N` (macOS) / `Ctrl+N` (Windows/Linux)
2. Fill in the connection details:
   - **Name**: A friendly name for the connection
   - **Host**: PostgreSQL server hostname or IP
   - **Port**: PostgreSQL port (default: 5432)
   - **Database**: Database name
   - **Username**: PostgreSQL username
   - **Password**: PostgreSQL password
   - **Read-only**: Enable to prevent write operations
   - **TLS/SSL**: Configure SSL settings if needed
3. Click **"Test Connection"** to verify credentials
4. Click **"Save"** to store the profile
5. Click **"Connect"** to establish the connection

### Browsing Schema

1. Once connected, the schema tree appears in the left panel
2. Expand schemas to see tables and views
3. Expand tables to see columns
4. Use the search box to filter by name
5. Right-click any node for context menu options:
   - Copy name
   - Copy full name (schema.table.column)
   - Copy SELECT statement
   - Sample table (inserts query)
   - View metadata

### Executing Queries

1. Open the query editor (center panel)
2. Type or paste your SQL query
3. Press `⌘Enter` (macOS) / `Ctrl+Enter` (Windows/Linux) to execute
4. View results in the grid below
5. Use multiple tabs for different queries
6. Format SQL with `⌥⌘F` (macOS) / `Alt+Ctrl+F` (Windows/Linux)

### Exporting Results

1. After executing a query, click the **"Export"** button
2. Choose format:
   - **CSV**: Download as CSV file
   - **JSON**: Download as JSON file
   - **Copy**: Copy to clipboard (CSV/JSON/TSV)
3. Files are downloaded to your default download folder

### Using Command Palette

1. Press `⌘K` (macOS) / `Ctrl+K` (Windows/Linux)
2. Type to search for commands
3. Use arrow keys to navigate
4. Press `Enter` to execute
5. Press `Esc` to close

---

## 🤖 MCP Server

RowFlow includes a Model Context Protocol (MCP) server that allows AI assistants (like Claude Desktop) to interact with your PostgreSQL databases.

### Setup for Claude Desktop

1. **Build the MCP server**:
   ```bash
   cd apps/mcp-server
   pnpm build
   ```

2. **Configure Claude Desktop**:

   Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

   ```json
   {
     "mcpServers": {
       "rowflow": {
         "command": "node",
         "args": [
           "/path/to/RowFlow/apps/mcp-server/dist/index.js"
         ],
         "env": {
           "ROWFLOW_CONNECTIONS_PATH": "/path/to/connections.json"
         }
       }
     }
   }
   ```

3. **Create connections file**:

   Create a JSON file with your connection profiles:

   ```json
   {
     "profiles": [
       {
         "name": "production",
         "host": "localhost",
         "port": 5432,
         "database": "mydb",
         "username": "user",
         "password": "pass"
       }
     ]
   }
   ```

4. **Restart Claude Desktop**

### Available MCP Tools

1. **`pg.describe`** - Get schema metadata for tables and columns
2. **`pg.query`** - Execute SELECT queries (read-only)
3. **`pg.explain`** - Analyze query execution plans
4. **`pg.sample`** - Sample rows from a table
5. **`pg.locks`** - Monitor database locks
6. **`pg.cancel`** - Cancel running queries

### Security

- All queries are **SELECT-only** (INSERT/UPDATE/DELETE/DROP blocked)
- Query results are limited (default: 1000 rows, max: 10,000)
- Uses parameterized queries to prevent SQL injection
- Connection pooling for efficient resource usage

For more details, see [`apps/mcp-server/README.md`](apps/mcp-server/README.md) and [`apps/mcp-server/QUICKSTART.md`](apps/mcp-server/QUICKSTART.md).

---

## 📁 Project Structure

```
RowFlow/
├── apps/
│   ├── desktop/                 # Tauri desktop application
│   │   ├── src/
│   │   │   ├── components/      # React components
│   │   │   ├── contexts/        # React contexts
│   │   │   ├── hooks/           # Custom hooks
│   │   │   ├── lib/             # Utilities
│   │   │   └── types/           # TypeScript types
│   │   └── src-tauri/           # Rust backend
│   │       ├── src/
│   │       │   ├── commands/   # Tauri commands
│   │       │   ├── error.rs    # Error handling
│   │       │   ├── state.rs    # State management
│   │       │   └── types.rs     # Type definitions
│   │       └── Cargo.toml       # Rust dependencies
│   └── mcp-server/              # MCP server
│       ├── src/
│       │   ├── tools/           # MCP tools
│       │   ├── connections.ts  # Connection management
│       │   └── db.ts            # Database utilities
│       └── dist/                # Compiled output
├── packages/
│   └── rust-shared/             # Shared Rust code
├── Cargo.toml                   # Rust workspace config
├── package.json                 # Root package.json
└── pnpm-workspace.yaml          # pnpm workspace config
```

---

## ⌨️ Keyboard Shortcuts

### Global
- `⌘K` / `Ctrl+K` - Open command palette
- `⌘1` / `Ctrl+1` - Focus connections panel
- `⌘2` / `Ctrl+2` - Focus schema panel
- `⌘3` / `Ctrl+3` - Focus query editor

### Query Editor
- `⌘Enter` / `Ctrl+Enter` - Execute query
- `⌥⌘F` / `Alt+Ctrl+F` - Format SQL
- `⌘K` / `Ctrl+K` - Open command palette
- `⌘T` / `Ctrl+T` - New query tab
- `⌘W` / `Ctrl+W` - Close current tab

### Schema Browser
- `⌘F` / `Ctrl+F` - Focus search
- `Enter` - Expand/collapse node
- `⌘C` / `Ctrl+C` - Copy node name
- `⇧⌘C` / `Shift+Ctrl+C` - Copy full name

### Results Grid
- `⌘C` / `Ctrl+C` - Copy selected cell
- `⌘E` / `Ctrl+E` - Export results
- Arrow keys - Navigate cells

For a complete list, see [`apps/desktop/KEYBOARD_SHORTCUTS.md`](apps/desktop/KEYBOARD_SHORTCUTS.md).

---

## 🔒 Security

### Read-Only Mode

When enabled, RowFlow sets the PostgreSQL session to read-only:

```sql
SET default_transaction_read_only = true;
```

This prevents all write operations at the database level.

### TLS/SSL Support

- CA certificate verification
- Client certificate authentication
- Self-signed certificate support (with verification disabled)
- Secure credential transmission

### Statement Timeouts

Configurable timeouts prevent resource exhaustion:
- **Statement timeout**: Max query execution time
- **Lock timeout**: Max lock wait time
- **Idle transaction timeout**: Auto-rollback idle transactions

### SQL Injection Prevention

- Uses PostgreSQL prepared statements
- Parameter binding (framework ready)
- Never concatenates user input into SQL

### Credential Management

- Passwords stored in memory only during connection
- Persistent storage via Tauri Store (encrypted)
- SSH key-based authentication supported

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Run linting and tests**:
   ```bash
   pnpm lint
   pnpm test
   ```
5. **Commit your changes**:
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to the branch**:
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Write TypeScript types for all new code
- Add Rust documentation comments
- Update relevant documentation
- Test your changes thoroughly

---

## 📄 License

This project is open source. License details TBD.

---

## 🙏 Acknowledgments

Built with amazing open-source tools:

- **[Tauri](https://tauri.app/)** - Lightweight native apps
- **[React](https://react.dev/)** - UI library
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful components
- **[TanStack](https://tanstack.com/)** - Table and virtualization
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - VS Code editor core
- **[Radix UI](https://www.radix-ui.com/)** - Unstyled primitives
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first styling
- **[Lucide](https://lucide.dev/)** - Icon library
- **[MCP](https://modelcontextprotocol.io/)** - Model Context Protocol

---

## 📚 Additional Documentation

- [`BACKEND_IMPLEMENTATION_SUMMARY.md`](BACKEND_IMPLEMENTATION_SUMMARY.md) - Rust backend details
- [`IMPLEMENTATION_COMPLETE.md`](IMPLEMENTATION_COMPLETE.md) - Phase A implementation summary
- [`apps/desktop/README.md`](apps/desktop/README.md) - Desktop app guide
- [`apps/mcp-server/README.md`](apps/mcp-server/README.md) - MCP server guide
- [`apps/mcp-server/QUICKSTART.md`](apps/mcp-server/QUICKSTART.md) - MCP quick start

---

<div align="center">

**Made with ❤️ for PostgreSQL developers**

[Report Bug](https://github.com/zachrizzo/RowFlow/issues) · [Request Feature](https://github.com/zachrizzo/RowFlow/issues) · [Documentation](https://github.com/zachrizzo/RowFlow#-additional-documentation)

</div>

