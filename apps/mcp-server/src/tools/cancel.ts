/**
 * pg.cancel tool - Cancel a running query
 */

import { dbManager } from '../db.js';
import { CancelInput, CancelOutput } from '../types.js';
import { validateRequired } from '../utils.js';

export async function handleCancel(args: CancelInput): Promise<CancelOutput> {
  validateRequired(args, ['profile', 'pid']);

  const { profile, pid } = args;

  // Validate PID
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('pid must be a positive integer');
  }

  // First, check if the process exists and get info about it
  const checkQuery = `
    SELECT
      pid,
      query,
      state,
      usename,
      NOW() - query_start AS duration
    FROM pg_stat_activity
    WHERE pid = $1
  `;

  const checkResult = await dbManager.query(profile, checkQuery, [pid]);

  if (checkResult.rows.length === 0) {
    return {
      success: false,
      message: `No process found with PID ${pid}`,
    };
  }

  const processInfo = checkResult.rows[0];

  // Cancel the query using pg_cancel_backend
  const cancelQuery = `SELECT pg_cancel_backend($1) AS cancelled`;
  const cancelResult = await dbManager.query(profile, cancelQuery, [pid]);

  const cancelled = cancelResult.rows[0].cancelled;

  if (cancelled) {
    return {
      success: true,
      message: `Successfully cancelled query for PID ${pid}. User: ${processInfo.usename}, Query: ${processInfo.query.substring(0, 100)}...`,
    };
  } else {
    return {
      success: false,
      message: `Failed to cancel query for PID ${pid}. The process may have already completed or you may not have permission.`,
    };
  }
}
