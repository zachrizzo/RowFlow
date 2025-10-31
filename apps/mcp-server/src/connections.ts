/**
 * Connection management for RowFlow MCP Server
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbManager } from './db.js';
import { log } from './utils.js';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the .env file
 */
function getEnvFilePath(): string {
  // Go up from src to the root of the mcp-server directory
  return path.resolve(__dirname, '..', '.env');
}

/**
 * List all available connection profiles
 */
export interface ConnectionInfo {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  maxConnections?: number;
}

export function listConnections(): ConnectionInfo[] {
  const profiles = dbManager.getAvailableProfiles();
  const connections: ConnectionInfo[] = [];

  for (const profileName of profiles) {
    const info = dbManager.getProfileInfo(profileName);
    if (info) {
      connections.push({
        name: profileName,
        host: info.host,
        port: info.port,
        database: info.database,
        user: info.user,
        ssl: info.ssl || false,
        maxConnections: info.max,
      });
    }
  }

  return connections;
}

/**
 * Get connection details for a specific profile (without password)
 */
export function getConnectionDetails(profileName: string): ConnectionInfo | null {
  const info = dbManager.getProfileInfo(profileName);
  if (!info) {
    return null;
  }

  return {
    name: profileName,
    host: info.host,
    port: info.port,
    database: info.database,
    user: info.user,
    ssl: info.ssl || false,
    maxConnections: info.max,
  };
}

/**
 * Test a connection profile
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  serverInfo?: {
    version: string;
    uptime?: string;
    currentDatabase: string;
    currentUser: string;
    serverEncoding: string;
  };
  error?: string;
}

export async function testConnection(profileName: string): Promise<ConnectionTestResult> {
  try {
    // Check if profile exists
    const info = dbManager.getProfileInfo(profileName);
    if (!info) {
      return {
        success: false,
        message: `Profile not found: ${profileName}`,
        error: `Available profiles: ${dbManager.getAvailableProfiles().join(', ')}`,
      };
    }

    // Test connection
    const pool = dbManager.getPool(profileName);
    const client = await pool.connect();

    try {
      // Get server version and info
      const versionResult = await client.query('SELECT version()');
      const infoResult = await client.query(`
        SELECT
          current_database() as current_database,
          current_user as current_user,
          pg_encoding_to_char(encoding) as server_encoding
        FROM pg_database
        WHERE datname = current_database()
      `);

      const version = versionResult.rows[0].version;
      const dbInfo = infoResult.rows[0];

      return {
        success: true,
        message: `Successfully connected to profile: ${profileName}`,
        serverVersion: version,
        serverInfo: {
          version,
          currentDatabase: dbInfo.current_database,
          currentUser: dbInfo.current_user,
          serverEncoding: dbInfo.server_encoding,
        },
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Connection test failed for profile ${profileName}:`, error);

    return {
      success: false,
      message: `Connection test failed for profile: ${profileName}`,
      error: errorMessage,
    };
  }
}

/**
 * Add a new connection profile to .env file
 */
export interface AddConnectionInput {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface AddConnectionResult {
  success: boolean;
  message: string;
  profileName?: string;
  instructions?: string[];
  error?: string;
}

export async function addConnection(input: AddConnectionInput): Promise<AddConnectionResult> {
  try {
    // Validate profile name
    const profileName = input.name.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (profileName.length === 0) {
      return {
        success: false,
        message: 'Invalid profile name',
        error: 'Profile name must contain only alphanumeric characters and underscores',
      };
    }

    // Check if profile already exists
    const existingProfiles = dbManager.getAvailableProfiles();
    if (existingProfiles.includes(profileName.toLowerCase())) {
      return {
        success: false,
        message: 'Profile already exists',
        error: `A profile named "${profileName.toLowerCase()}" already exists. Please choose a different name.`,
      };
    }

    // Validate port
    if (input.port < 1 || input.port > 65535) {
      return {
        success: false,
        message: 'Invalid port number',
        error: 'Port must be between 1 and 65535',
      };
    }

    // Test the connection before adding
    const testPool = new Pool({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      password: input.password,
      ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
    });

    let connectionSuccessful = false;
    let connectionError: string | null = null;

    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      connectionSuccessful = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      connectionError = errorMessage;
    } finally {
      await testPool.end();
    }

    // Check if connection failed
    if (!connectionSuccessful) {
      return {
        success: false,
        message: 'Connection test failed',
        error: `Unable to connect to database: ${connectionError}`,
      };
    }

    // Get .env file path
    const envFilePath = getEnvFilePath();

    // Read existing .env content (or create empty if not exists)
    let envContent = '';
    try {
      envContent = fs.readFileSync(envFilePath, 'utf-8');
    } catch (error) {
      // File doesn't exist, will create it
      log('info', '.env file does not exist, will create it');
    }

    // Check if profile already exists in .env (double check)
    const profilePrefix = `PG_PROFILE_${profileName}_`;
    if (envContent.includes(profilePrefix)) {
      return {
        success: false,
        message: 'Profile already exists in .env file',
        error: `Profile "${profileName}" is already configured in .env file`,
      };
    }

    // Build profile configuration
    const profileConfig = `
# ${profileName} Profile (Added: ${new Date().toISOString()})
PG_PROFILE_${profileName}_HOST=${input.host}
PG_PROFILE_${profileName}_PORT=${input.port}
PG_PROFILE_${profileName}_DATABASE=${input.database}
PG_PROFILE_${profileName}_USER=${input.user}
PG_PROFILE_${profileName}_PASSWORD=${input.password}
PG_PROFILE_${profileName}_SSL=${input.ssl ? 'true' : 'false'}${
      input.maxConnections ? `\nPG_PROFILE_${profileName}_MAX_CONNECTIONS=${input.maxConnections}` : ''
    }
`;

    // Append to .env file
    const newEnvContent = envContent.trim() + '\n' + profileConfig + '\n';
    fs.writeFileSync(envFilePath, newEnvContent, 'utf-8');

    log('info', `Added new profile: ${profileName} to .env file`);

    return {
      success: true,
      message: `Successfully added connection profile: ${profileName.toLowerCase()}`,
      profileName: profileName.toLowerCase(),
      instructions: [
        'Profile has been added to .env file',
        'IMPORTANT: Restart the MCP server for changes to take effect',
        'If using Claude Desktop, restart the Claude Desktop app',
        `You can now use profile="${profileName.toLowerCase()}" in other tools`,
        '',
        'Security Note:',
        '- Passwords are stored in plain text in the .env file',
        '- Ensure .env file is in .gitignore',
        '- Use environment-specific credentials',
        '- Consider using connection string encryption for production',
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'Failed to add connection:', error);

    return {
      success: false,
      message: 'Failed to add connection profile',
      error: errorMessage,
    };
  }
}
