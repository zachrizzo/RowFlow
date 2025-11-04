/**
 * pg.explain tool - Get query execution plan
 */

import { dbManager } from '../db.js';
import { ExplainInput, ExplainOutput } from '../types.js';
import { validateRequired, validateSelectQuery } from '../utils.js';

export async function handleExplain(args: ExplainInput): Promise<ExplainOutput> {
  validateRequired(args, ['profile', 'sql']);

  const { profile, sql } = args;

  // Ensure the statement is read-only
  validateSelectQuery(sql);

  // Build EXPLAIN query
  const explainSql = `EXPLAIN (FORMAT JSON) ${sql}`;

  // Execute the EXPLAIN query
  const result = await dbManager.query(profile, explainSql);

  // Parse the JSON result
  if (result.rows.length === 0 || !result.rows[0]['QUERY PLAN']) {
    throw new Error('PostgreSQL did not return an execution plan');
  }

  const planData = result.rows[0]['QUERY PLAN'];
  const plan = Array.isArray(planData) ? planData[0] : planData;
  const innerPlan = plan.Plan ?? plan;

  return {
    plan: innerPlan,
    executionTime: plan['Execution Time'],
    planningTime: plan['Planning Time'],
  };
}
