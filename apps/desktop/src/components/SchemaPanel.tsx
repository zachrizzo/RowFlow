import { FolderTree } from 'lucide-react';

export function SchemaPanel() {
  return (
    <div className="flex h-full flex-col bg-card border-x">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-4">
        <FolderTree className="h-5 w-5" />
        <h2 className="font-semibold">Schema Browser</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <FolderTree className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm">Connect to a database</p>
          <p className="text-xs mt-2">to browse its schema</p>
        </div>
      </div>
    </div>
  );
}
