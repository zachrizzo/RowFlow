import { useState } from 'react';
import { Database, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConnectionList } from '@/components/ConnectionList';
import { ConnectionForm } from '@/components/ConnectionForm';
import { useDatabase } from '@/hooks/useDatabase';
import type { StoredProfile } from '@/types/connection';

export function ConnectionsPanel() {
  const { getActiveConnection } = useDatabase();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StoredProfile | undefined>();

  const activeConnection = getActiveConnection();

  const handleNewConnection = () => {
    setEditingProfile(undefined);
    setIsFormOpen(true);
  };

  const handleEditProfile = (profile: StoredProfile) => {
    setEditingProfile(profile);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingProfile(undefined);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setEditingProfile(undefined);
  };

  return (
    <>
      <div className="flex h-full flex-col bg-card">
        {/* Header */}
        <div className="flex flex-col border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <h2 className="font-semibold">Connections</h2>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNewConnection}
              className="h-8 w-8"
              title="Add Connection"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Active Connection Info */}
          {activeConnection && activeConnection.status === 'connected' && (
            <div className="px-4 pb-3 border-t bg-accent/50">
              <div className="text-xs text-muted-foreground mt-2">Active Database</div>
              <div className="font-medium text-sm truncate">
                {activeConnection.connectionInfo?.databaseName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {activeConnection.connectionInfo?.username} @ {activeConnection.profile.host}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <ConnectionList onEditProfile={handleEditProfile} />
        </div>
      </div>

      {/* Connection Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Edit Connection' : 'New Connection'}
            </DialogTitle>
          </DialogHeader>
          <ConnectionForm
            profile={editingProfile}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
