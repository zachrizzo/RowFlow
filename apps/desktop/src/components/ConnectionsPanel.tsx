import { Database, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectionsPanel() {
  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <h2 className="font-semibold">Connections</h2>
        </div>
        <Button size="icon" variant="ghost">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Database className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm">No connections yet</p>
          <p className="text-xs mt-2">Click + to add a connection</p>
        </div>
      </div>
    </div>
  );
}
