/**
 * pg.explain tool - Get query execution plan
 */

import { dbManager } from '../db.js';
import { ExplainInput, ExplainOutput } from '../types.js';
import { validateRequired } from '../utils.js';

export async function handleExplain(args: ExplainInput): Promise<ExplainOutput> {
  validateRequired(args, ['profile', 'sql']);

  const { profile, sql } = args;

  // Build EXPLAIN query
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;

  // Execute the EXPLAIN query
  const result = await dbManager.query(profile, explainSql);

  // Parse the JSON result
  const planData = result.rows[0]['QUERY PLAN'];
  const plan = Array.isArray(planData) ? planData[0] : planData;

  return {
    plan: plan.Plan,
    executionTime: plan['Execution Time'],
    planningTime: plan['Planning Time'],
  };
}
