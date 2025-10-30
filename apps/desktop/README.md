# RowFlow Desktop

Modern PostgreSQL viewer desktop application built with Tauri 2.1, React 18, and Vite 5.

## Tech Stack

- **Framework**: Tauri 2.1
- **Frontend**: React 18.3 with TypeScript 5.6
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS 3.4 with shadcn/ui components
- **UI Components**:
  - React Resizable Panels for layout
  - Monaco Editor for SQL editing
  - TanStack Table for data display
  - TanStack Virtual for performance
  - cmdk for command palette
- **Icons**: Lucide React

## Project Structure

```
apps/desktop/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── ConnectionsPanel.tsx
│   │   ├── SchemaPanel.tsx
│   │   └── QueryPanel.tsx
│   ├── lib/
│   │   └── utils.ts         # Utility functions (cn, etc.)
│   ├── App.tsx              # Main app with 3-pane layout
│   ├── main.tsx             # React entry point
│   ├── index.css            # Tailwind & global styles
│   └── vite-env.d.ts        # TypeScript definitions
├── src-tauri/               # Tauri backend (Rust)
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
├── components.json          # shadcn/ui configuration
└── package.json             # Dependencies and scripts
```

## Scripts

```bash
# Development
pnpm dev              # Start Vite dev server
pnpm tauri:dev        # Start Tauri app in dev mode

# Build
pnpm build            # Build frontend
pnpm tauri:build      # Build complete Tauri app

# Code Quality
pnpm lint             # Run ESLint
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting

# Testing
pnpm test             # Run Vitest tests
```

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start development server:
   ```bash
   pnpm dev
   ```

3. In a separate terminal, start Tauri:
   ```bash
   pnpm tauri:dev
   ```

## Features

### 3-Pane Layout
- **Left Panel**: Database connections management
- **Middle Panel**: Schema browser with tables, views, and functions
- **Right Panel**: SQL query editor with results display

All panels are resizable using react-resizable-panels.

### Dark Mode
The app is configured with dark mode by default, using Tailwind's dark mode with CSS variables for theming.

### Path Aliases
TypeScript path aliases are configured:
- `@/` → `./src/`

Use this in imports:
```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

## Dependencies

### Core Dependencies
- `@tauri-apps/api@^2.1.0` - Tauri JavaScript API
- `@tauri-apps/plugin-keyring@^2.1.0` - Secure credential storage
- `react@^18.3.1` & `react-dom@^18.3.1` - React framework
- `react-resizable-panels@^2.1.7` - Resizable panel layout

### UI Libraries
- `@monaco-editor/react@^4.6.0` - SQL code editor
- `@tanstack/react-table@^8.20.5` - Table component
- `@tanstack/react-virtual@^3.10.8` - Virtualization
- `cmdk@^1.0.0` - Command palette
- `lucide-react@^0.462.0` - Icons
- `sql-formatter@^15.4.2` - SQL formatting

### Styling
- `tailwindcss@^3.4.15` - CSS framework
- `@radix-ui/*` - Headless UI components
- `class-variance-authority@^0.7.1` - Component variants
- `tailwind-merge@^2.5.4` - Merge Tailwind classes

## Configuration Notes

### Vite Configuration
- Fixed port 1420 for Tauri compatibility
- Strict port mode enabled
- Relative base path for proper Tauri builds
- Path aliases configured
- Optimized for Chromium (Windows) and WebKit (macOS/Linux)

### TypeScript Configuration
- Strict mode enabled
- Unused locals and parameters flagged
- No unchecked indexed access
- Module bundler resolution
- JSX transform mode

### Tailwind Configuration
- Dark mode: class-based
- shadcn/ui CSS variables
- Custom animations included
- Responsive breakpoints

## Next Steps

1. **Tauri Backend Integration**: Connect frontend to Rust backend
2. **Database Connection Management**: Implement connection storage and management
3. **Schema Browser**: Add tree view for database objects
4. **Query Editor**: Integrate Monaco Editor with SQL support
5. **Results Display**: Implement TanStack Table for query results
6. **MCP Integration**: Add Model Context Protocol support
