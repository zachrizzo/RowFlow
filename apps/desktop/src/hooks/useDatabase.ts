import { useContext } from 'react';
import { DatabaseContext } from '@/contexts/DatabaseContext';
import type { ConnectionProfile, ConnectionInfo, ConnectionState } from '@/types/connection';

/**
 * Hook to access database connection state and operations
 */
export function useDatabase() {
  const context = useContext(DatabaseContext);

  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }

  return context;
}

export type {
  ConnectionProfile,
  ConnectionInfo,
  ConnectionState,
};
