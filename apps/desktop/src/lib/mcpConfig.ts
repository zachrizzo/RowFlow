// Helper to check if Tauri is available
const isTauriAvailable = () => typeof window !== 'undefined' && '__TAURI__' in window;

// Safe Tauri imports
const getTauriPath = async () => {
  if (isTauriAvailable()) {
    return await import('@tauri-apps/api/path');
  }
  return null;
};

const getTauriFs = async () => {
  if (isTauriAvailable()) {
    return await import('@tauri-apps/plugin-fs');
  }
  return null;
};

export interface McpTool {
  name: string;
  description: string;
  inputs: string;
  example: string;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'pg.describe',
    description: 'Get schema metadata (tables, columns, types)',
    inputs: 'profile, schema (optional)',
    example: 'List all tables in the public schema',
  },
  {
    name: 'pg.query',
    description: 'Execute SELECT queries (read-only)',
    inputs: 'profile, sql, params, maxRows',
    example: 'SELECT * FROM users LIMIT 10',
  },
  {
    name: 'pg.explain',
    description: 'Analyze query execution plans',
    inputs: 'profile, sql',
    example: 'Show query performance analysis',
  },
  {
    name: 'pg.sample',
    description: 'Sample rows from a table',
    inputs: 'profile, schema, table, limit',
    example: 'Get first 100 rows from users table',
  },
  {
    name: 'pg.locks',
    description: 'Monitor database locks',
    inputs: 'profile',
    example: 'Show blocking queries',
  },
  {
    name: 'pg.cancel',
    description: 'Cancel running queries',
    inputs: 'profile, pid',
    example: 'Stop a long-running query',
  },
  {
    name: 'pg.connection.list',
    description: 'List all connection profiles',
    inputs: 'none',
    example: 'Show all configured database connections',
  },
  {
    name: 'pg.connection.add',
    description: 'Add a new connection profile',
    inputs: 'name, host, port, database, user, password, ssl, maxConnections',
    example: 'Add connection to local PostgreSQL',
  },
  {
    name: 'pg.connection.test',
    description: 'Test a connection profile',
    inputs: 'profile',
    example: 'Verify connection to dev database',
  },
];

export interface McpServerConfig {
  command: string;
  args: string[];
  cwd: string;
}

export interface ClaudeDesktopConfig {
  mcpServers: {
    rowflow: McpServerConfig;
  };
}

/**
 * Get the absolute path to the MCP server directory
 * Assumes the desktop app is at /path/to/RowFlow/apps/desktop
 * and MCP server is at /path/to/RowFlow/apps/mcp-server
 */
export async function getMcpServerPath(): Promise<string> {
  try {
    const pathApi = await getTauriPath();

    if (!pathApi) {
      // Browser fallback - use hardcoded paths
      return import.meta.env.DEV
        ? '/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server'
        : '/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server';
    }

    const { homeDir, resolve } = pathApi;

    if (import.meta.env.DEV) {
      const currentFileUrl = new URL(import.meta.url);
      const currentPath = currentFileUrl.pathname;
      const basePath = currentPath.replace(/\/src\/lib\/mcpConfig\.ts$/, '');
      const mcpServerPath = await resolve(basePath, '..', 'mcp-server');
      return mcpServerPath;
    } else {
      const appPath = await resolve(await homeDir(), '..', '..');
      return await resolve(appPath, 'apps', 'mcp-server');
    }
  } catch (error) {
    console.error('Error resolving MCP server path:', error);
    return '/Users/zachrizzo/Desktop/programming/RowFlow/apps/mcp-server';
  }
}

/**
 * Get the path to the MCP server executable
 */
export async function getMcpServerExecutablePath(): Promise<string> {
  const serverPath = await getMcpServerPath();
  const pathApi = await getTauriPath();

  if (!pathApi) {
    // Browser fallback
    return `${serverPath}/dist/index.js`;
  }

  return await pathApi.resolve(serverPath, 'dist', 'index.js');
}

/**
 * Check if the MCP server is built (dist/index.js exists)
 */
export async function isMcpServerBuilt(): Promise<boolean> {
  try {
    const fsApi = await getTauriFs();

    if (!fsApi) {
      // Browser fallback - assume it's built if we successfully ran pnpm build
      console.log('MCP server build status: ASSUMED BUILT (browser mode)');
      return true;
    }

    const execPath = await getMcpServerExecutablePath();
    console.log('Checking MCP server build status at:', execPath);
    const fileExists = await fsApi.exists(execPath);
    console.log('MCP server build status:', fileExists ? 'BUILT' : 'NOT BUILT');
    return fileExists;
  } catch (error) {
    console.error('Error checking MCP server build status:', error);
    // Assume built on error
    return true;
  }
}

/**
 * Generate the Claude Desktop config JSON for RowFlow MCP server
 */
export async function generateClaudeDesktopConfig(): Promise<ClaudeDesktopConfig> {
  const serverPath = await getMcpServerPath();
  const execPath = await getMcpServerExecutablePath();

  return {
    mcpServers: {
      rowflow: {
        command: 'node',
        args: [execPath],
        cwd: serverPath,
      },
    },
  };
}

/**
 * Get the formatted config JSON string for copying
 */
export async function getConfigJsonString(): Promise<string> {
  const config = await generateClaudeDesktopConfig();
  return JSON.stringify(config, null, 2);
}

/**
 * Get the Claude Desktop config file path for the current OS
 */
export async function getClaudeDesktopConfigPath(): Promise<string> {
  const pathApi = await getTauriPath();
  let home = '~';

  if (pathApi) {
    try {
      home = await pathApi.homeDir();
    } catch (error) {
      console.error('Error getting home dir:', error);
    }
  }

  // macOS path
  if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
    return `${home}/Library/Application Support/Claude/claude_desktop_config.json`;
  }

  // Windows path
  if (navigator.platform.toUpperCase().indexOf('WIN') >= 0) {
    return `${home}/AppData/Roaming/Claude/claude_desktop_config.json`;
  }

  // Linux path
  return `${home}/.config/Claude/claude_desktop_config.json`;
}

/**
 * Installation steps for the MCP server
 */
export const INSTALLATION_STEPS = [
  {
    title: 'Build MCP Server',
    command: 'pnpm build:mcp',
    description: 'Server auto-builds with pnpm dev or pnpm build',
  },
  {
    title: 'Configure Claude Desktop',
    command: 'See configuration below',
    description: 'Add JSON config to claude_desktop_config.json',
  },
  {
    title: 'Restart Claude Desktop',
    command: 'Quit and restart completely',
    description: 'Required for MCP servers to load',
  },
];

/**
 * Get MCP server version from package.json
 */
export const MCP_SERVER_VERSION = '1.0.0';

/**
 * Documentation links
 */
export const DOCUMENTATION_LINKS = {
  mcpServer: 'https://github.com/yourusername/RowFlow/tree/main/apps/mcp-server',
  mcpProtocol: 'https://modelcontextprotocol.io',
  quickstart: '../../apps/mcp-server/QUICKSTART.md',
  readme: '../../apps/mcp-server/README.md',
};

/**
 * Get Claude Code CLI command for adding RowFlow MCP server
 */
export async function getClaudeCodeCommand(): Promise<string> {
  const mcpServerPath = await getMcpServerPath();
  const execPath = await getMcpServerExecutablePath();

  return `claude mcp add rowflow --command node --args "${execPath}" --cwd "${mcpServerPath}"`;
}

/**
 * Check if Claude Code CLI is installed
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  if (!isTauriAvailable()) {
    // Browser mode - can't check, assume false
    return false;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const command = Command.create('which', ['claude']);
    const output = await command.execute();
    return output.code === 0;
  } catch (error) {
    console.error('Error checking Claude Code installation:', error);
    return false;
  }
}

/**
 * Execute Claude Code CLI command to add MCP server
 */
export async function addToClaudeCode(): Promise<{ success: boolean; message: string }> {
  if (!isTauriAvailable()) {
    return {
      success: false,
      message: 'Shell commands are only available in the Tauri app, not the browser. Please copy the command and run it manually in your terminal.',
    };
  }

  try {
    const command = await getClaudeCodeCommand();

    const { Command } = await import('@tauri-apps/plugin-shell');

    // Split command into parts
    const parts = command.split(' ');
    const cmd = parts[0] || 'claude'; // 'claude'
    const args = parts.slice(1); // ['mcp', 'add', 'rowflow', ...]

    const shellCommand = Command.create(cmd, args);
    const output = await shellCommand.execute();

    if (output.code === 0) {
      return {
        success: true,
        message: 'Successfully added RowFlow to Claude Code. Please restart Claude Code for changes to take effect.',
      };
    } else {
      return {
        success: false,
        message: `Failed to add to Claude Code: ${output.stderr || 'Unknown error'}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error: ${String(error)}`,
    };
  }
}
