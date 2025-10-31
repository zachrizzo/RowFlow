/**
 * pg.connection.test tool - Test a connection profile
 */

import { ConnectionTestInput, ConnectionTestOutput } from '../types.js';
import { testConnection } from '../connections.js';
import { validateRequired } from '../utils.js';

export async function handleConnectionTest(args: ConnectionTestInput): Promise<ConnectionTestOutput> {
  validateRequired(args, ['profile']);

  return await testConnection(args.profile);
}
