/**
 * pg.describe tool - Get schema metadata
 */

import { dbManager } from '../db.js';
import { DescribeInput, DescribeOutput, SchemaInfo, TableInfo, ColumnInfo } from '../types.js';
import { validateRequired } from '../utils.js';

export async function handleDescribe(args: DescribeInput): Promise<DescribeOutput> {
  validateRequired(args, ['profile']);

  const { profile, schema } = args;

  // Query to get all schemas (or specific schema if provided)
  const schemasQuery = schema
    ? `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1 ORDER BY schema_name`
    : `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`;

  const schemasResult = await dbManager.query(
    profile,
    schemasQuery,
    schema ? [schema] : []
  );

  const schemas: SchemaInfo[] = [];

  for (const schemaRow of schemasResult.rows) {
    const schemaName = schemaRow.schema_name;

    // Get tables for this schema
    const tablesQuery = `
      SELECT
        t.table_name,
        t.table_type,
        obj_description((quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass) as table_comment
      FROM information_schema.tables t
      WHERE t.table_schema = $1
      ORDER BY t.table_name
    `;

    const tablesResult = await dbManager.query(profile, tablesQuery, [schemaName]);

    const tables: TableInfo[] = [];

    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;

      // Get columns for this table
      const columnsQuery = `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.ordinal_position) as column_comment,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name, ku.table_schema, ku.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name
            AND c.table_schema = pk.table_schema
            AND c.table_name = pk.table_name
        LEFT JOIN (
          SELECT ku.column_name, ku.table_schema, ku.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
        ) fk ON c.column_name = fk.column_name
            AND c.table_schema = fk.table_schema
            AND c.table_name = fk.table_name
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `;

      const columnsResult = await dbManager.query(profile, columnsQuery, [
        schemaName,
        tableName,
      ]);

      const columns: ColumnInfo[] = columnsResult.rows.map((col) => ({
        columnName: col.column_name,
        dataType: col.data_type,
        isNullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        comment: col.column_comment,
        isPrimaryKey: col.is_primary_key,
        isForeignKey: col.is_foreign_key,
      }));

      tables.push({
        tableName,
        tableType: tableRow.table_type,
        comment: tableRow.table_comment,
        columns,
      });
    }

    schemas.push({
      schemaName,
      tables,
    });
  }

  return { schemas };
}
