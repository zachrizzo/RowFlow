const DEFAULT_SQL = '-- Write your SQL query here\nSELECT * FROM ';

const sanitizeSql = (sql?: string | null): string => {
  if (sql === undefined || sql === null) {
    return '';
  }

  // Ensure sql is actually a string
  if (typeof sql !== 'string') {
    console.warn('sanitizeSql received non-string value:', typeof sql, sql);
    return '';
  }

  let sanitized = sql;

  sanitized = sanitized.replace(
    /(SELECT\s+\*\s+FROM\s+)((?:undefined|\.|\s|;|,|\n)+)/gi,
    (_, prefix: string, remainder: string) => {
      const withoutUndefined = remainder.replace(/\boundefined\b/gi, '').trim();
      return withoutUndefined.length > 0 ? `${prefix}${withoutUndefined}` : prefix;
    }
  );

  return sanitized;
};

const isDefaultSql = (sql?: string | null): boolean => {
  if (sql === undefined || sql === null) {
    return true;
  }

  const sanitized = sanitizeSql(sql).trim();
  return sanitized.length === 0 || sanitized === DEFAULT_SQL.trim();
};

const quoteIdentifier = (identifier: string): string => {
  return `"${identifier.replace(/"/g, '""')}"`;
};

const generateSelectQuery = (
  schema: string,
  table: string,
  limit = 100,
  primaryKeys?: string[]
): string => {
  const orderByClause = primaryKeys && primaryKeys.length > 0
    ? ` ORDER BY ${primaryKeys.map(pk => quoteIdentifier(pk)).join(', ')}`
    : '';
  return `SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}${orderByClause} LIMIT ${limit};`;
};

export { DEFAULT_SQL, sanitizeSql, isDefaultSql, quoteIdentifier, generateSelectQuery };
