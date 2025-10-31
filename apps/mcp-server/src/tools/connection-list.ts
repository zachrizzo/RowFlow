/**
 * pg.connection.list tool - List all available connection profiles
 */

import { ConnectionListInput, ConnectionListOutput } from '../types.js';
import { listConnections } from '../connections.js';

export async function handleConnectionList(_args: ConnectionListInput): Promise<ConnectionListOutput> {
  const connections = listConnections();

  return {
    connections,
    count: connections.length,
  };
}
