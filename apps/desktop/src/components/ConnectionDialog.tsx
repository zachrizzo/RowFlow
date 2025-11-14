import { useState } from 'react';
import { Database, Cloud } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConnectionForm } from './ConnectionForm';
import { S3ConnectionForm } from './S3ConnectionForm';
import { cn } from '@/lib/utils';
import { useS3Profiles } from '@/hooks/useS3Profiles';
import type { StoredProfile } from '@/types/connection';
import type { StoredS3Profile } from '@/types/s3';

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editingProfile?: StoredProfile | StoredS3Profile;
}

type ConnectionType = 'postgres' | 's3';

// Type guard to check if profile is S3
function isS3Profile(profile: any): profile is StoredS3Profile {
  return profile && 'bucket' in profile;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  onSuccess,
  editingProfile,
}: ConnectionDialogProps) {
  const { saveProfile, updateProfile } = useS3Profiles();

  // Determine initial connection type based on editing profile
  const initialType: ConnectionType = editingProfile
    ? isS3Profile(editingProfile)
      ? 's3'
      : 'postgres'
    : 'postgres';

  const [connectionType, setConnectionType] = useState<ConnectionType>(initialType);

  const handleSuccess = () => {
    onSuccess?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingProfile ? 'Edit Connection' : 'New Connection'}
          </DialogTitle>
        </DialogHeader>

        {/* Connection Type Selector - Only show when creating new connection */}
        {!editingProfile && (
          <div className="flex gap-2 mb-4">
            <Button
              variant={connectionType === 'postgres' ? 'default' : 'outline'}
              className={cn(
                'flex-1 h-20 flex-col gap-2',
                connectionType === 'postgres' && 'ring-2 ring-primary'
              )}
              onClick={() => setConnectionType('postgres')}
            >
              <Database className="h-8 w-8" />
              <span className="font-semibold">PostgreSQL</span>
            </Button>

            <Button
              variant={connectionType === 's3' ? 'default' : 'outline'}
              className={cn(
                'flex-1 h-20 flex-col gap-2',
                connectionType === 's3' && 'ring-2 ring-primary'
              )}
              onClick={() => setConnectionType('s3')}
            >
              <Cloud className="h-8 w-8" />
              <span className="font-semibold">S3 Bucket</span>
            </Button>
          </div>
        )}

        {/* Connection Forms */}
        {connectionType === 'postgres' ? (
          <ConnectionForm
            profile={!isS3Profile(editingProfile) ? editingProfile : undefined}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        ) : (
          <S3ConnectionForm
            profile={isS3Profile(editingProfile) ? editingProfile : undefined}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            onSave={async (profileData) => {
              if (editingProfile && isS3Profile(editingProfile)) {
                // Update existing profile
                updateProfile(editingProfile.id, profileData);
              } else {
                // Create new profile
                saveProfile(profileData);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
