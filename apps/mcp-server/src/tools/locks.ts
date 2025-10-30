/**
 * pg.locks tool - Get current lock information
 */

import { dbManager } from '../db.js';
import { LocksInput, LocksOutput, LockInfo } from '../types.js';
import { validateRequired } from '../utils.js';

export async function handleLocks(args: LocksInput): Promise<LocksOutput> {
  validateRequired(args, ['profile']);

  const { profile } = args;

  // Query to find blocking and blocked queries
  const locksQuery = `
    SELECT
      blocked_locks.pid AS blocked_pid,
      blocked_activity.query AS blocked_query,
      blocked_activity.state AS blocked_state,
      NOW() - blocked_activity.query_start AS blocked_duration,
      blocking_locks.pid AS blocking_pid,
      blocking_activity.query AS blocking_query,
      blocking_activity.state AS blocking_state,
      NOW() - blocking_activity.query_start AS blocking_duration,
      blocked_locks.locktype AS lock_type,
      blocked_locks.relation::regclass::text AS relation
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity
      ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
      AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
      AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
      AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
      AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
      AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
      AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
      AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
      AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
      AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity
      ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted
    ORDER BY blocked_activity.query_start;
  `;

  const result = await dbManager.query(profile, locksQuery);

  const locks: LockInfo[] = result.rows.map((row) => ({
    blockedPid: row.blocked_pid,
    blockedQuery: row.blocked_query,
    blockedDuration: formatInterval(row.blocked_duration),
    blockingPid: row.blocking_pid,
    blockingQuery: row.blocking_query,
    blockingDuration: formatInterval(row.blocking_duration),
    lockType: row.lock_type,
    relation: row.relation,
  }));

  // Count unique blocking PIDs
  const uniqueBlockers = new Set(locks.map((lock) => lock.blockingPid));

  return {
    locks,
    blockerCount: uniqueBlockers.size,
  };
}

/**
 * Format PostgreSQL interval for display
 */
function formatInterval(interval: any): string {
  if (!interval) return '0s';

  // PostgreSQL returns intervals as strings like "00:00:05.123456"
  const str = String(interval);

  // Try to parse as ISO duration or time format
  const parts = str.match(/(\d+):(\d+):(\d+\.?\d*)/);
  if (parts) {
    const hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const seconds = parseFloat(parts[3]);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${Math.floor(seconds)}s`;
    } else {
      return `${seconds.toFixed(1)}s`;
    }
  }

  return str;
}
