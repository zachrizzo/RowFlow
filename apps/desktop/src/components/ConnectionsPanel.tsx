import { useState } from 'react';
import { Database, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { ConnectionList } from '@/components/ConnectionList';
import { ConnectionDialog } from '@/components/ConnectionDialog';
import { S3Browser } from '@/components/S3Browser';
import { useDatabase } from '@/hooks/useDatabase';
import { useS3Profiles } from '@/hooks/useS3Profiles';
import type { StoredProfile } from '@/types/connection';
import type { StoredS3Profile } from '@/types/s3';

export function ConnectionsPanel() {
  const { getActiveConnection, loadProfiles } = useDatabase();
  const { refreshProfiles } = useS3Profiles();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StoredProfile | StoredS3Profile | undefined>();
  const [s3BrowserProfile, setS3BrowserProfile] = useState<StoredS3Profile | null>(null);

  const activeConnection = getActiveConnection();

  const handleNewConnection = () => {
    setEditingProfile(undefined);
    setIsFormOpen(true);
  };

  const handleEditProfile = (profile: StoredProfile | StoredS3Profile) => {
    setEditingProfile(profile);
    setIsFormOpen(true);
  };

  const handleFormSuccess = async () => {
    setIsFormOpen(false);
    setEditingProfile(undefined);
    // Refresh both PostgreSQL and S3 profiles to ensure the list updates
    await loadProfiles();
    refreshProfiles();
  };

  const handleOpenS3Browser = (profile: StoredS3Profile) => {
    setS3BrowserProfile(profile);
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
          <ConnectionList
            onEditProfile={handleEditProfile}
            onOpenS3Browser={handleOpenS3Browser}
          />
        </div>
      </div>

      {/* Connection Dialog - Unified for both PostgreSQL and S3 */}
      <ConnectionDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={handleFormSuccess}
        editingProfile={editingProfile}
      />

      {/* S3 Browser Dialog */}
      {s3BrowserProfile && (
        <Dialog open={!!s3BrowserProfile} onOpenChange={(open) => !open && setS3BrowserProfile(null)}>
          <DialogContent className="max-w-6xl h-[80vh] p-0 flex flex-col">
            <S3Browser 
              profile={s3BrowserProfile} 
              onClose={() => setS3BrowserProfile(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
