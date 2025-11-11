import { createContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionProfile,
  ConnectionInfo,
  ConnectionState,
  ConnectionStatus,
  StoredProfile,
} from '@/types/connection';
import {
  getProfiles,
  saveProfile,
  deleteProfile as deleteStoredProfile,
  getActiveProfileId,
  setActiveProfileId,
} from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useAutoEmbed } from '@/hooks/useAutoEmbed';

interface DatabaseContextType {
  // Connection states
  connections: Map<string, ConnectionState>;
  activeConnectionId: string | null;

  // Stored profiles
  profiles: StoredProfile[];
  loadProfiles: () => Promise<void>;

  // Connection operations
  connectToProfile: (profile: ConnectionProfile) => Promise<string | null>;
  disconnectFromProfile: (connectionId: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  testConnection: (profile: ConnectionProfile) => Promise<ConnectionInfo | null>;
  getConnectionStatus: (profileId: string) => ConnectionStatus;
  getActiveConnection: () => ConnectionState | null;

  // Profile management
  createProfile: (profile: Omit<StoredProfile, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProfile: (profile: StoredProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string | null) => Promise<void>;
}

export const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

interface DatabaseProviderProps {
  children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [connections, setConnections] = useState<Map<string, ConnectionState>>(new Map());
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const { toast } = useToast();
  const { embedSchemaMetadata } = useAutoEmbed();

  // Load profiles on mount
  const loadProfiles = useCallback(async () => {
    try {
      // Load local profiles from Tauri Store
      const loadedProfiles = await getProfiles();

      // Load MCP profiles from .env file
      let mcpProfiles: StoredProfile[] = [];
      try {
        const mcpProfilesRaw = await invoke<ConnectionProfile[]>('list_mcp_profiles');
        console.log('Loaded MCP profiles:', mcpProfilesRaw);

        // Convert to StoredProfile format and mark as MCP-managed
        mcpProfiles = mcpProfilesRaw.map((profile) => ({
          id: `mcp-${profile.name}`,
          name: `${profile.name} (MCP)`,
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password: profile.password,
          readOnly: profile.readOnly,
          useSsh: profile.useSsh || Boolean(profile.sshConfig),
          sshConfig: profile.sshConfig,
          tlsConfig: profile.tlsConfig
            ? {
                enabled: profile.tlsConfig.enabled,
                verifyCa: profile.tlsConfig.verifyCa,
                caCertPath: profile.tlsConfig.caCertPath,
                clientCertPath: profile.tlsConfig.clientCertPath,
                clientKeyPath: profile.tlsConfig.clientKeyPath,
              }
            : undefined,
          connectionTimeout: profile.connectionTimeout,
          statementTimeout: profile.statementTimeout,
          lockTimeout: profile.lockTimeout,
          idleTimeout: profile.idleTimeout,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isMcpManaged: true,
        }));
      } catch (error) {
        console.log('No MCP profiles found or MCP server not configured:', error);
      }

      // Merge local and MCP profiles
      const allProfiles = [...loadedProfiles, ...mcpProfiles];
      setProfiles(allProfiles);

      // Load active profile ID
      const activeId = await getActiveProfileId();
      if (activeId) {
        setActiveConnectionId(activeId);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load connection profiles',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load on mount

  // Test connection without saving
  const testConnection = useCallback(async (profile: ConnectionProfile): Promise<ConnectionInfo | null> => {
    try {
      const info = await invoke<ConnectionInfo>('test_connection', { profile });
      toast({
        title: 'Success',
        description: `Connected to ${info.databaseName} (${info.serverVersion})`,
      });
      return info;
    } catch (error) {
      console.error('Connection test failed:', error);
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Connect to a profile
  const connectToProfile = useCallback(async (profile: ConnectionProfile): Promise<string | null> => {
    const profileId = profile.id || `temp-${Date.now()}`;

    // Set status to connecting
    setConnections((prev) => {
      const newMap = new Map(prev);
      newMap.set(profileId, {
        profile,
        status: 'connecting',
      });
      return newMap;
    });

    try {
      const connectionId = await invoke<string>('connect_database', { profile });

      // Get connection info
      const connectionInfo = await invoke<ConnectionInfo>('test_connection', { profile });

      // Update state to connected
      setConnections((prev) => {
        const newMap = new Map(prev);
        newMap.set(profileId, {
          profile,
          status: 'connected',
          connectionId,
          connectionInfo,
        });
        return newMap;
      });

      setActiveConnectionId(profileId);
      if (profile.id) {
        await setActiveProfileId(profile.id);
      }

      toast({
        title: 'Connected',
        description: `Connected to ${profile.name}`,
      });

      // Auto-embed schema metadata in the background
      embedSchemaMetadata(connectionId).catch((error) => {
        console.error('[DatabaseContext] Auto-embedding failed:', error);
        // Don't show error to user - auto-embedding is optional
      });

      return connectionId;
    } catch (error) {
      console.error('Connection failed:', error);

      // Update state to error
      setConnections((prev) => {
        const newMap = new Map(prev);
        newMap.set(profileId, {
          profile,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return newMap;
      });

      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });

      return null;
    }
  }, [toast]);

  // Disconnect from a profile
  const disconnectFromProfile = useCallback(async (connectionId: string) => {
    try {
      // Find the profile ID for this connection
      let profileId: string | null = null;
      connections.forEach((state, id) => {
        if (state.connectionId === connectionId) {
          profileId = id;
        }
      });

      await invoke('disconnect_database', { connectionId });

      if (profileId) {
        const foundProfileId = profileId; // Capture the non-null value
        setConnections((prev) => {
          const newMap = new Map(prev);
          const state = newMap.get(foundProfileId);
          if (state) {
            newMap.set(foundProfileId, {
              ...state,
              status: 'disconnected',
              connectionId: undefined,
              connectionInfo: undefined,
            });
          }
          return newMap;
        });

        if (activeConnectionId === foundProfileId) {
          setActiveConnectionId(null);
          await setActiveProfileId(null);
        }
      }

      toast({
        title: 'Disconnected',
        description: 'Database connection closed',
      });
    } catch (error) {
      console.error('Disconnect failed:', error);
      toast({
        title: 'Error',
        description: 'Failed to disconnect',
        variant: 'destructive',
      });
    }
  }, [connections, activeConnectionId, toast]);

  // Disconnect all connections
  const disconnectAll = useCallback(async () => {
    const disconnectPromises: Promise<void>[] = [];

    connections.forEach((state) => {
      if (state.connectionId) {
        disconnectPromises.push(disconnectFromProfile(state.connectionId));
      }
    });

    await Promise.all(disconnectPromises);
  }, [connections, disconnectFromProfile]);

  // Get connection status by profile ID
  const getConnectionStatus = useCallback((profileId: string): ConnectionStatus => {
    const state = connections.get(profileId);
    return state?.status || 'disconnected';
  }, [connections]);

  // Get active connection
  const getActiveConnection = useCallback((): ConnectionState | null => {
    if (!activeConnectionId) return null;
    return connections.get(activeConnectionId) || null;
  }, [activeConnectionId, connections]);

  // Create a new profile
  const createProfile = useCallback(async (
    profile: Omit<StoredProfile, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const newProfile: StoredProfile = {
      ...profile,
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProfile(newProfile);
    await loadProfiles();

    toast({
      title: 'Profile Created',
      description: `Connection profile "${newProfile.name}" has been saved`,
    });
  }, [loadProfiles, toast]);

  // Update an existing profile
  const updateProfile = useCallback(async (profile: StoredProfile) => {
    const updatedProfile: StoredProfile = {
      ...profile,
      updatedAt: Date.now(),
    };

    await saveProfile(updatedProfile);
    await loadProfiles();

    toast({
      title: 'Profile Updated',
      description: `Connection profile "${profile.name}" has been updated`,
    });
  }, [loadProfiles, toast]);

  // Delete a profile
  const deleteProfile = useCallback(async (id: string) => {
    // Disconnect if currently connected
    const state = connections.get(id);
    if (state?.connectionId) {
      await disconnectFromProfile(state.connectionId);
    }

    await deleteStoredProfile(id);
    await loadProfiles();

    toast({
      title: 'Profile Deleted',
      description: 'Connection profile has been deleted',
    });
  }, [connections, disconnectFromProfile, loadProfiles, toast]);

  // Set active profile
  const setActiveProfile = useCallback(async (id: string | null) => {
    await setActiveProfileId(id);
    setActiveConnectionId(id);
  }, []);

  const value: DatabaseContextType = {
    connections,
    activeConnectionId,
    profiles,
    loadProfiles,
    connectToProfile,
    disconnectFromProfile,
    disconnectAll,
    testConnection,
    getConnectionStatus,
    getActiveConnection,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}
