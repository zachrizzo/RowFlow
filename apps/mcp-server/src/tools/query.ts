/**
 * pg.query tool - Execute SELECT queries
 */

import { dbManager } from '../db.js';
import { QueryInput, QueryOutput, QueryField } from '../types.js';
import { validateRequired, validateSelectQuery } from '../utils.js';

const DEFAULT_MAX_ROWS = 1000;

export async function handleQuery(args: QueryInput): Promise<QueryOutput> {
  validateRequired(args, ['profile', 'sql']);

  const { profile, sql, params = [], maxRows = DEFAULT_MAX_ROWS } = args;

  // Validate that it's a SELECT query
  validateSelectQuery(sql);

  // Validate maxRows
  if (maxRows < 1 || maxRows > 10000) {
    throw new Error('maxRows must be between 1 and 10000');
  }

  // Add LIMIT to the query if not already present
  const limitedSql = addLimitToQuery(sql, maxRows);

  // Execute the query
  const result = await dbManager.query(profile, limitedSql, params);

  // Map field information
  const fields: QueryField[] = result.fields.map((field) => ({
    name: field.name,
    dataTypeID: field.dataTypeID,
    dataType: getDataTypeName(field.dataTypeID),
  }));

  // Check if results were truncated
  const truncated = result.rows.length >= maxRows;

  return {
    fields,
    rows: result.rows,
    rowCount: result.rows.length,
    truncated,
  };
}

/**
 * Adds LIMIT clause to query if not present
 */
function addLimitToQuery(sql: string, maxRows: number): string {
  const trimmed = sql.trim();
  const hasSemicolon = trimmed.endsWith(';');
  const withoutSemicolon = hasSemicolon ? trimmed.slice(0, -1).trimEnd() : trimmed;

  const limitRegex = /\blimit\s+(\d+)(\s+offset\s+\d+)?$/i;
  const existing = withoutSemicolon.match(limitRegex);

  if (existing) {
    const existingLimit = parseInt(existing[1], 10);
    if (existingLimit <= maxRows) {
      return `${withoutSemicolon}${hasSemicolon ? ';' : ''}`;
    }
    const offsetPart = existing[2] ?? '';
    const replaced = withoutSemicolon.replace(
      limitRegex,
      `LIMIT ${maxRows}${offsetPart}`
    );
    return `${replaced}${hasSemicolon ? ';' : ''}`;
  }

  return `${withoutSemicolon} LIMIT ${maxRows}${hasSemicolon ? ';' : ''}`;
}

/**
 * Maps PostgreSQL OID to data type name
 */
function getDataTypeName(oid: number): string {
  const typeMap: Record<number, string> = {
    16: 'bool',
    17: 'bytea',
    18: 'char',
    19: 'name',
    20: 'int8',
    21: 'int2',
    23: 'int4',
    25: 'text',
    26: 'oid',
    114: 'json',
    142: 'xml',
    600: 'point',
    700: 'float4',
    701: 'float8',
    1043: 'varchar',
    1082: 'date',
    1083: 'time',
    1114: 'timestamp',
    1184: 'timestamptz',
    1186: 'interval',
    1266: 'timetz',
    1700: 'numeric',
    2950: 'uuid',
    3802: 'jsonb',
  };

  return typeMap[oid] || `unknown(${oid})`;
}
