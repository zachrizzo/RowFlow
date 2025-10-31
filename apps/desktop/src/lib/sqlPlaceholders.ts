const DEFAULT_SQL = '-- Write your SQL query here\nSELECT * FROM ';

const sanitizeSql = (sql?: string | null): string => {
  if (sql === undefined || sql === null) {
    return '';
  }

  let sanitized = sql;

  sanitized = sanitized.replace(
    /(SELECT\s+\*\s+FROM\s+)((?:undefined|\.|\s|;|,|\n)+)/gi,
    (_, prefix: string, remainder: string) => {
      const withoutUndefined = remainder.replace(/\bundefined\b/gi, '').trim();
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

export { DEFAULT_SQL, sanitizeSql, isDefaultSql };

