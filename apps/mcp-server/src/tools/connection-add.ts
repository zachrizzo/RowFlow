/**
 * pg.connection.add tool - Add a new connection profile
 */

import { ConnectionAddInput, ConnectionAddOutput } from '../types.js';
import { addConnection } from '../connections.js';
import { validateRequired } from '../utils.js';

export async function handleConnectionAdd(args: ConnectionAddInput): Promise<ConnectionAddOutput> {
  validateRequired(args, ['name', 'host', 'database', 'user', 'password']);

  // Set defaults
  const input = {
    ...args,
    port: args.port || 5432,
    ssl: args.ssl || false,
  };

  return await addConnection(input);
}
