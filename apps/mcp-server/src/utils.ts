/**
 * Utility functions for RowFlow MCP Server
 */

import { MCPError, Profiles } from './types.js';

/**
 * Validates that SQL is a SELECT statement only
 */
export function validateSelectQuery(sql: string): void {
  const trimmedSql = sql.trim().toLowerCase();

  // Remove comments
  const withoutComments = trimmedSql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // Check if it starts with SELECT or WITH (for CTEs)
  if (!withoutComments.startsWith('select') && !withoutComments.startsWith('with')) {
    throw new Error('Only SELECT queries are allowed. DML/DDL operations are not permitted.');
  }

  // Check for dangerous keywords that might be hidden
  const dangerousKeywords = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'truncate', 'grant', 'revoke', 'execute', 'exec'
  ];

  for (const keyword of dangerousKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(withoutComments)) {
      throw new Error(`Query contains prohibited keyword: ${keyword.toUpperCase()}`);
    }
  }
}

/**
 * Formats an error for MCP response
 */
export function formatMCPError(error: unknown): MCPError {
  if (error instanceof Error) {
    // Check for common PostgreSQL errors
    const pgError = error as any;
    if (pgError.code) {
      return {
        code: pgError.code,
        message: pgError.message,
        details: {
          severity: pgError.severity,
          detail: pgError.detail,
          hint: pgError.hint,
          position: pgError.position,
          where: pgError.where,
          schema: pgError.schema,
          table: pgError.table,
          column: pgError.column,
          constraint: pgError.constraint
        }
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      details: error.stack
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error)
  };
}

/**
 * Parses profile configurations from environment variables
 */
export function parseProfilesFromEnv(): Profiles {
  const profiles: Profiles = {};
  const profileNames = new Set<string>();

  // Find all unique profile names from environment variables
  for (const key in process.env) {
    if (key.startsWith('PG_PROFILE_')) {
      const match = key.match(/^PG_PROFILE_([^_]+)_/);
      if (match) {
        profileNames.add(match[1]);
      }
    }
  }

  // Build profile configs
  for (const name of profileNames) {
    const prefix = `PG_PROFILE_${name}_`;
    const host = process.env[`${prefix}HOST`];
    const port = process.env[`${prefix}PORT`];
    const database = process.env[`${prefix}DATABASE`];
    const user = process.env[`${prefix}USER`];
    const password = process.env[`${prefix}PASSWORD`];

    if (!host || !port || !database || !user || !password) {
      console.error(`[MCP] Incomplete profile configuration for: ${name}`);
      continue;
    }

    profiles[name.toLowerCase()] = {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
      ssl: process.env[`${prefix}SSL`] === 'true',
      max: process.env[`${prefix}MAX_CONNECTIONS`]
        ? parseInt(process.env[`${prefix}MAX_CONNECTIONS`] as string, 10)
        : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };
  }

  return profiles;
}

/**
 * Validates required tool input parameters
 */
export function validateRequired<T extends Record<string, any>>(
  input: T,
  requiredFields: (keyof T)[]
): void {
  for (const field of requiredFields) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new Error(`Missing required parameter: ${String(field)}`);
    }
  }
}

/**
 * Sanitizes identifier (schema, table, column names)
 */
export function sanitizeIdentifier(identifier: string): string {
  // Remove any characters that aren't alphanumeric, underscore, or dollar sign
  const sanitized = identifier.replace(/[^a-zA-Z0-9_$]/g, '');

  if (sanitized.length === 0) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }

  return sanitized;
}

/**
 * Logs to stderr (stdout is reserved for MCP protocol)
 */
export function log(level: 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  const prefix = `[MCP ${level.toUpperCase()}] ${timestamp}`;
  console.error(prefix, message, ...args);
}
