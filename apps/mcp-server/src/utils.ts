/**
 * Utility functions for RowFlow MCP Server
 */

import { MCPError, Profiles } from './types.js';

/**
 * Removes SQL string literals and quoted identifiers to make keyword detection safer.
 */
function stripQuotedSections(sql: string): string {
  let result = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === '\'' && sql[i + 1] === '\'') {
        i += 2;
        continue;
      }
      if (ch === '\'') {
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && sql[i + 1] === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      result += ' ';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      result += ' ';
      i += 1;
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}

/**
 * Validates that SQL is a SELECT statement only
 */
export function validateSelectQuery(sql: string): void {
  const trimmedSql = sql.trim();

  // Remove comments
  const withoutComments = trimmedSql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  const lowered = withoutComments.toLowerCase();

  // Check if it starts with SELECT or WITH (for CTEs)
  if (!lowered.startsWith('select') && !lowered.startsWith('with')) {
    throw new Error('Only SELECT queries are allowed. DML/DDL operations are not permitted.');
  }

  // Strip quoted strings/identifiers before scanning for dangerous keywords
  const searchable = stripQuotedSections(lowered);

  const dangerousKeywords = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'truncate', 'grant', 'revoke', 'execute', 'exec'
  ];

  for (const keyword of dangerousKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(searchable)) {
      throw new Error(`Query contains prohibited keyword: ${keyword.toUpperCase()}`);
    }
  }
}

/**
 * Normalize raw environment variable value by trimming quotes and simple escapes.
 */
function normalizeEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    trimmed = trimmed.slice(1, -1);
  }
  return trimmed
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, '\'')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
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
  // Profile name is everything between PG_PROFILE_ and the last _FIELD
  const knownFields = ['HOST', 'PORT', 'DATABASE', 'USER', 'PASSWORD', 'SSL', 'MAX_CONNECTIONS'];

  for (const key in process.env) {
    if (key.startsWith('PG_PROFILE_')) {
      // Remove PG_PROFILE_ prefix
      const remainder = key.substring('PG_PROFILE_'.length);

      // Check if it ends with a known field
      for (const field of knownFields) {
        if (remainder.endsWith(`_${field}`)) {
          // Extract profile name (everything before _FIELD)
          const profileName = remainder.substring(0, remainder.length - field.length - 1);
          if (profileName) {
            profileNames.add(profileName);
          }
          break;
        }
      }
    }
  }

  // Build profile configs
  for (const name of profileNames) {
    const prefix = `PG_PROFILE_${name}_`;
    const host = normalizeEnvValue(process.env[`${prefix}HOST`]);
    const port = normalizeEnvValue(process.env[`${prefix}PORT`]);
    const database = normalizeEnvValue(process.env[`${prefix}DATABASE`]);
    const user = normalizeEnvValue(process.env[`${prefix}USER`]);
    const password = normalizeEnvValue(process.env[`${prefix}PASSWORD`]);

    if (!host || !port || !database || !user || !password) {
      console.error(`[MCP] Incomplete profile configuration for: ${name}`);
      continue;
    }

    const ssl = normalizeEnvValue(process.env[`${prefix}SSL`]) === 'true';
    const maxConnections = normalizeEnvValue(process.env[`${prefix}MAX_CONNECTIONS`]);

    profiles[name.toLowerCase()] = {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
      ssl,
      max: maxConnections ? parseInt(maxConnections, 10) : 10,
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
