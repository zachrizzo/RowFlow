import { useState } from 'react';
import {
  Database,
  Cloud,
  MoreVertical,
  Trash2,
  Edit,
  Power,
  PowerOff,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDatabase } from '@/hooks/useDatabase';
import { useS3Profiles } from '@/hooks/useS3Profiles';
import type { ConnectionProfile, StoredProfile } from '@/types/connection';
import type { StoredS3Profile } from '@/types/s3';
import { cn } from '@/lib/utils';

interface ConnectionListProps {
  onEditProfile?: (profile: StoredProfile | StoredS3Profile) => void;
  onOpenS3Browser?: (profile: StoredS3Profile) => void;
}

export function ConnectionList({ onEditProfile, onOpenS3Browser }: ConnectionListProps) {
  const {
    profiles,
    connections,
    activeConnectionId,
    connectToProfile,
    disconnectFromProfile,
    deleteProfile,
    getConnectionStatus,
  } = useDatabase();

  const {
    profiles: s3Profiles,
    deleteProfile: deleteS3Profile,
  } = useS3Profiles();

  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [connectingProfileId, setConnectingProfileId] = useState<string | null>(null);
  const [viewingDetailsProfileId, setViewingDetailsProfileId] = useState<string | null>(null);

  const handleConnect = async (profile: StoredProfile) => {
    setConnectingProfileId(profile.id);
    const { createdAt, updatedAt, isMcpManaged, ...rest } = profile;
    const connectionProfile: ConnectionProfile = {
      ...rest,
      id: profile.id,
    };
    await connectToProfile(connectionProfile);
    setConnectingProfileId(null);
  };

  const handleDisconnect = async (profileId: string) => {
    const state = connections.get(profileId);
    if (state?.connectionId) {
      await disconnectFromProfile(state.connectionId);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deletingProfileId) {
      // Check if it's a PostgreSQL or S3 profile
      const isS3 = s3Profiles.some(p => p.id === deletingProfileId);
      if (isS3) {
        deleteS3Profile(deletingProfileId);
      } else {
        await deleteProfile(deletingProfileId);
      }
      setDeletingProfileId(null);
    }
  };

  const totalProfiles = profiles.length + s3Profiles.length;

  if (totalProfiles === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
        <Database className="h-12 w-12 mb-4 opacity-20" />
        <p className="text-sm">No connections yet</p>
        <p className="text-xs mt-2">Click + to add a connection</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {/* PostgreSQL Connections */}
        {profiles.map((profile) => {
          const status = getConnectionStatus(profile.id);
          const isActive = activeConnectionId === profile.id;
          const isConnecting = connectingProfileId === profile.id;

          return (
            <div
              key={profile.id}
              className={cn(
                'group relative rounded-lg border p-3 transition-colors hover:bg-accent',
                isActive && 'border-primary bg-accent',
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status Indicator */}
                <div className="pt-1">
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : status === 'connected' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : status === 'error' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : status === 'connecting' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Database className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Profile Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3
                        className={cn(
                          'font-medium text-sm truncate',
                          isActive && 'text-primary',
                        )}
                      >
                        {profile.name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {profile.username}@{profile.host}:{profile.port}/{profile.database}
                      </p>

                      {/* Connection Info */}
                      {status === 'connected' && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-green-500">Connected</span>
                          {profile.readOnly && (
                            <span className="text-xs px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded">
                              Read-only
                            </span>
                          )}
                        </div>
                      )}

                      {status === 'error' && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3 w-3 text-destructive" />
                          <span className="text-xs text-destructive">Connection failed</span>
                        </div>
                      )}

                      {/* Additional Info */}
                      <div className="flex items-center gap-2 mt-1">
                        {profile.isMcpManaged && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded font-medium">
                            MCP
                          </span>
                        )}
                        {profile.useSsh && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            SSH
                          </span>
                        )}
                        {profile.tlsConfig?.enabled && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            SSL
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setViewingDetailsProfileId(profile.id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!profile.isMcpManaged && (
                          <DropdownMenuItem
                            onClick={() => onEditProfile?.(profile)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setDeletingProfileId(profile.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Connect/Disconnect Button */}
              <div className="mt-2 pt-2 border-t">
                {status === 'connected' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleDisconnect(profile.id)}
                  >
                    <PowerOff className="mr-2 h-3 w-3" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleConnect(profile)}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Power className="mr-2 h-3 w-3" />
                        Connect
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* S3 Connections */}
        {s3Profiles.map((profile) => (
          <div
            key={profile.id}
            className="group relative rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="pt-1">
                <Cloud className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {profile.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {profile.bucket} ({profile.region})
                    </p>

                    {/* Additional Info */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded">
                        S3
                      </span>
                      {profile.endpoint && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                          Custom
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onEditProfile?.(profile)}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingProfileId(profile.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Browse Button */}
            <div className="mt-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onOpenS3Browser?.(profile)}
              >
                <Cloud className="mr-2 h-3 w-3" />
                Browse Bucket
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingProfileId}
        onOpenChange={(open) => !open && setDeletingProfileId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Connection Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this connection profile? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingProfileId(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connection Details Dialog */}
      <Dialog
        open={!!viewingDetailsProfileId}
        onOpenChange={(open) => !open && setViewingDetailsProfileId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Connection Details
            </DialogTitle>
            <DialogDescription>
              Complete information about this connection profile
            </DialogDescription>
          </DialogHeader>
          {viewingDetailsProfileId && (() => {
            const profile = profiles.find(p => p.id === viewingDetailsProfileId);
            if (!profile) return null;
            
            const connection = connections.get(profile.id);
            const status = getConnectionStatus(profile.id);

            return (
              <div className="space-y-4">
                {/* Basic Information */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>
                      <p className="font-medium">{profile.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <p className="font-medium capitalize">
                        {status === 'connected' ? (
                          <span className="text-green-500">Connected</span>
                        ) : status === 'error' ? (
                          <span className="text-destructive">Error</span>
                        ) : status === 'connecting' ? (
                          <span className="text-primary">Connecting...</span>
                        ) : (
                          <span>Disconnected</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Host:</span>
                      <p className="font-mono text-xs">{profile.host}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Port:</span>
                      <p className="font-mono text-xs">{profile.port}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Database:</span>
                      <p className="font-mono text-xs">{profile.database}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Username:</span>
                      <p className="font-mono text-xs">{profile.username}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Read-only:</span>
                      <p className="font-medium">{profile.readOnly ? 'Yes' : 'No'}</p>
                    </div>
                    {profile.isMcpManaged !== undefined && (
                      <div>
                        <span className="text-muted-foreground">MCP Managed:</span>
                        <p className="font-medium">{profile.isMcpManaged ? 'Yes' : 'No'}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Connection Info (if connected) */}
                {connection?.connectionInfo && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-semibold text-sm">Active Connection</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Server Version:</span>
                        <p className="font-mono text-xs">{connection.connectionInfo.serverVersion}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Session User:</span>
                        <p className="font-mono text-xs">{connection.connectionInfo.sessionUser}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current Schema:</span>
                        <p className="font-mono text-xs">{connection.connectionInfo.currentSchema}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Server Encoding:</span>
                        <p className="font-mono text-xs">{connection.connectionInfo.serverEncoding}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Client Encoding:</span>
                        <p className="font-mono text-xs">{connection.connectionInfo.clientEncoding}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Superuser:</span>
                        <p className="font-medium">{connection.connectionInfo.isSuperuser ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* SSH Configuration */}
                {profile.useSsh && profile.sshConfig && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-semibold text-sm">SSH Configuration</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">SSH Host:</span>
                        <p className="font-mono text-xs">{profile.sshConfig.host}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SSH Port:</span>
                        <p className="font-mono text-xs">{profile.sshConfig.port}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SSH Username:</span>
                        <p className="font-mono text-xs">{profile.sshConfig.username}</p>
                      </div>
                      {profile.sshConfig.privateKeyPath && (
                        <div>
                          <span className="text-muted-foreground">Private Key:</span>
                          <p className="font-mono text-xs truncate">{profile.sshConfig.privateKeyPath}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TLS Configuration */}
                {profile.tlsConfig?.enabled && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-semibold text-sm">TLS/SSL Configuration</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Verify CA:</span>
                        <p className="font-medium">{profile.tlsConfig.verifyCa ? 'Yes' : 'No'}</p>
                      </div>
                      {profile.tlsConfig.caCertPath && (
                        <div>
                          <span className="text-muted-foreground">CA Certificate:</span>
                          <p className="font-mono text-xs truncate">{profile.tlsConfig.caCertPath}</p>
                        </div>
                      )}
                      {profile.tlsConfig.clientCertPath && (
                        <div>
                          <span className="text-muted-foreground">Client Certificate:</span>
                          <p className="font-mono text-xs truncate">{profile.tlsConfig.clientCertPath}</p>
                        </div>
                      )}
                      {profile.tlsConfig.clientKeyPath && (
                        <div>
                          <span className="text-muted-foreground">Client Key:</span>
                          <p className="font-mono text-xs truncate">{profile.tlsConfig.clientKeyPath}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Timeout Settings */}
                {(profile.connectionTimeout || profile.statementTimeout || profile.lockTimeout || profile.idleTimeout) && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-semibold text-sm">Timeout Settings</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {profile.connectionTimeout !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Connection Timeout:</span>
                          <p className="font-mono text-xs">{profile.connectionTimeout}s</p>
                        </div>
                      )}
                      {profile.statementTimeout !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Statement Timeout:</span>
                          <p className="font-mono text-xs">{profile.statementTimeout}ms</p>
                        </div>
                      )}
                      {profile.lockTimeout !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Lock Timeout:</span>
                          <p className="font-mono text-xs">{profile.lockTimeout}ms</p>
                        </div>
                      )}
                      {profile.idleTimeout !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Idle Timeout:</span>
                          <p className="font-mono text-xs">{profile.idleTimeout}s</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="font-semibold text-sm">Metadata</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Profile ID:</span>
                      <p className="font-mono text-xs">{profile.id}</p>
                    </div>
                    {profile.createdAt && (
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <p className="font-mono text-xs">
                          {new Date(profile.createdAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {profile.updatedAt && (
                      <div>
                        <span className="text-muted-foreground">Last Updated:</span>
                        <p className="font-mono text-xs">
                          {new Date(profile.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingDetailsProfileId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
