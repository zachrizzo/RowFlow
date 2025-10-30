import { format } from 'sql-formatter';

export interface FormatOptions {
  language?: 'postgresql' | 'mysql' | 'sql';
  tabWidth?: number;
  useTabs?: boolean;
  keywordCase?: 'upper' | 'lower' | 'preserve';
  indentStyle?: 'standard' | 'tabularLeft' | 'tabularRight';
  linesBetweenQueries?: number;
}

const defaultOptions: FormatOptions = {
  language: 'postgresql',
  tabWidth: 2,
  useTabs: false,
  keywordCase: 'upper',
  indentStyle: 'standard',
  linesBetweenQueries: 2,
};

/**
 * Format SQL query with PostgreSQL syntax
 * @param sql - The SQL query to format
 * @param options - Formatting options
 * @returns Formatted SQL string
 */
export function formatSql(sql: string, options?: FormatOptions): string {
  if (!sql || sql.trim().length === 0) {
    return sql;
  }

  try {
    const mergedOptions = { ...defaultOptions, ...options };

    return format(sql, {
      language: mergedOptions.language,
      tabWidth: mergedOptions.tabWidth,
      useTabs: mergedOptions.useTabs,
      keywordCase: mergedOptions.keywordCase,
      indentStyle: mergedOptions.indentStyle,
      linesBetweenQueries: mergedOptions.linesBetweenQueries,
    });
  } catch (error) {
    console.error('SQL formatting error:', error);
    // Return original SQL if formatting fails
    return sql;
  }
}

/**
 * Minify SQL by removing extra whitespace and comments
 * @param sql - The SQL query to minify
 * @returns Minified SQL string
 */
export function minifySql(sql: string): string {
  if (!sql || sql.trim().length === 0) {
    return sql;
  }

  try {
    // Remove comments
    let minified = sql
      .replace(/--[^\n]*/g, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    // Replace multiple whitespace with single space
    minified = minified.replace(/\s+/g, ' ').trim();

    return minified;
  } catch (error) {
    console.error('SQL minification error:', error);
    return sql;
  }
}

/**
 * Extract individual SQL statements from a multi-statement query
 * @param sql - The SQL query containing multiple statements
 * @returns Array of individual SQL statements
 */
export function splitSqlStatements(sql: string): string[] {
  if (!sql || sql.trim().length === 0) {
    return [];
  }

  // Split by semicolon, but be careful with strings and comments
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let inComment = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Handle string literals
    if ((char === "'" || char === '"') && !inComment) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Handle comments
    if (!inString) {
      if (char === '-' && nextChar === '-') {
        inComment = true;
      } else if (char === '\n' && inComment) {
        inComment = false;
      }
    }

    // Split on semicolon
    if (char === ';' && !inString && !inComment) {
      const statement = current.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last statement if it doesn't end with semicolon
  const lastStatement = current.trim();
  if (lastStatement.length > 0) {
    statements.push(lastStatement);
  }

  return statements;
}

/**
 * Check if SQL query is a SELECT statement
 * @param sql - The SQL query to check
 * @returns True if the query is a SELECT statement
 */
export function isSelectQuery(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  return trimmed.startsWith('select') || trimmed.startsWith('with');
}

/**
 * Check if SQL query is a modification statement (INSERT, UPDATE, DELETE)
 * @param sql - The SQL query to check
 * @returns True if the query modifies data
 */
export function isModificationQuery(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  return (
    trimmed.startsWith('insert') ||
    trimmed.startsWith('update') ||
    trimmed.startsWith('delete') ||
    trimmed.startsWith('truncate')
  );
}

/**
 * Check if SQL query is a DDL statement (CREATE, ALTER, DROP)
 * @param sql - The SQL query to check
 * @returns True if the query is a DDL statement
 */
export function isDDLQuery(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  return (
    trimmed.startsWith('create') ||
    trimmed.startsWith('alter') ||
    trimmed.startsWith('drop')
  );
}
