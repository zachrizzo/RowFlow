/**
 * pg.sample tool - Get sample rows from a table
 */

import { dbManager } from '../db.js';
import { SampleInput, SampleOutput, QueryField } from '../types.js';
import { validateRequired, sanitizeIdentifier } from '../utils.js';

const DEFAULT_LIMIT = 100;

export async function handleSample(args: SampleInput): Promise<SampleOutput> {
  validateRequired(args, ['profile', 'schema', 'table']);

  const { profile, schema, table, limit = DEFAULT_LIMIT } = args;

  // Validate limit
  if (limit < 1 || limit > 1000) {
    throw new Error('limit must be between 1 and 1000');
  }

  // Sanitize identifiers
  const safeSchema = sanitizeIdentifier(schema);
  const safeTable = sanitizeIdentifier(table);

  // Check if table has a primary key for keyset pagination
  const pkQuery = `
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass
      AND i.indisprimary
    ORDER BY a.attnum
  `;

  const fullTableName = `"${safeSchema}"."${safeTable}"`;
  let pkResult;

  try {
    pkResult = await dbManager.query(profile, pkQuery, [fullTableName]);
  } catch (error) {
    throw new Error(`Table not found: ${schema}.${table}`);
  }

  let sampleQuery: string;

  if (pkResult.rows.length > 0) {
    // Use keyset pagination with primary key
    const pkColumn = pkResult.rows[0].attname;
    sampleQuery = `
      SELECT * FROM ${fullTableName}
      ORDER BY "${pkColumn}"
      LIMIT ${limit}
    `;
  } else {
    // No primary key, use simple LIMIT
    sampleQuery = `
      SELECT * FROM ${fullTableName}
      LIMIT ${limit}
    `;
  }

  // Execute sample query
  const result = await dbManager.query(profile, sampleQuery);

  // Get total row count
  const countQuery = `SELECT COUNT(*) as total FROM ${fullTableName}`;
  const countResult = await dbManager.query(profile, countQuery);
  const totalRows = parseInt(countResult.rows[0].total, 10);

  // Map field information
  const fields: QueryField[] = result.fields.map((field) => ({
    name: field.name,
    dataTypeID: field.dataTypeID,
  }));

  return {
    fields,
    rows: result.rows,
    rowCount: result.rows.length,
    totalRows,
  };
}
