import { useState } from 'react';
import {
  Database,
  MoreVertical,
  Trash2,
  Edit,
  Power,
  PowerOff,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
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
import type { StoredProfile } from '@/types/connection';
import { cn } from '@/lib/utils';

interface ConnectionListProps {
  onEditProfile?: (profile: StoredProfile) => void;
}

export function ConnectionList({ onEditProfile }: ConnectionListProps) {
  const {
    profiles,
    connections,
    activeConnectionId,
    connectToProfile,
    disconnectFromProfile,
    deleteProfile,
    getConnectionStatus,
  } = useDatabase();

  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [connectingProfileId, setConnectingProfileId] = useState<string | null>(null);

  const handleConnect = async (profile: StoredProfile) => {
    setConnectingProfileId(profile.id);
    await connectToProfile({
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      database: profile.database,
      username: profile.username,
      password: profile.password,
      readOnly: profile.readOnly,
      useSsh: profile.useSsh,
      sshConfig: profile.sshConfig,
      tlsConfig: profile.tlsConfig,
      connectionTimeout: profile.connectionTimeout,
      statementTimeout: profile.statementTimeout,
      lockTimeout: profile.lockTimeout,
      idleTimeout: profile.idleTimeout,
    });
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
      await deleteProfile(deletingProfileId);
      setDeletingProfileId(null);
    }
  };

  if (profiles.length === 0) {
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
                        {profile.sshTunnel && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            SSH
                          </span>
                        )}
                        {profile.ssl?.enabled && (
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
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {status === 'connected' ? (
                          <DropdownMenuItem
                            onClick={() => handleDisconnect(profile.id)}
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            Disconnect
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleConnect(profile)}
                            disabled={isConnecting}
                          >
                            <Power className="mr-2 h-4 w-4" />
                            Connect
                          </DropdownMenuItem>
                        )}
                        {!profile.isMcpManaged && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onEditProfile?.(profile)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingProfileId(profile.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                        {profile.isMcpManaged && (
                          <DropdownMenuItem disabled>
                            <Info className="mr-2 h-4 w-4" />
                            MCP-managed (read-only)
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Quick Connect Button */}
              {!isActive && status !== 'connected' && (
                <div className="mt-2 pt-2 border-t">
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
                </div>
              )}

              {status === 'connected' && (
                <div className="mt-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleDisconnect(profile.id)}
                  >
                    <PowerOff className="mr-2 h-3 w-3" />
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          );
        })}
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
    </>
  );
}
