import { FolderTree, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDatabase } from '@/hooks/useDatabase';
import { useSchema } from '@/hooks/useSchema';
import { SchemaSearch } from '@/components/SchemaSearch';
import { SchemaTree } from '@/components/SchemaTree';
import { SchemaStats } from '@/components/SchemaStats';

interface SchemaPanelProps {
  onTableSelect?: (schema: string, table: string) => void;
}

export function SchemaPanel({ onTableSelect }: SchemaPanelProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();

  const {
    filteredNodes,
    stats,
    loading,
    error,
    searchQuery,
    filterType,
    expandedNodes,
    setSearchQuery,
    setFilterType,
    toggleNode,
    refreshSchema,
  } = useSchema({
    connectionId: activeConnection?.connectionId || null,
    autoLoad: true,
  });

  // Not connected state
  if (!activeConnection || activeConnection.status !== 'connected') {
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

  return (
    <div className="flex h-full flex-col bg-card border-x">
      {/* Header */}
      <div className="flex items-center gap-2 border-b p-4">
        <FolderTree className="h-5 w-5" />
        <h2 className="font-semibold">Schema Browser</h2>
      </div>

      {/* Search and filters */}
      <SchemaSearch
        value={searchQuery}
        onChange={setSearchQuery}
        filterType={filterType}
        onFilterChange={setFilterType}
        disabled={loading}
      />

      {/* Error state */}
      {error && (
        <div className="p-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshSchema}
                className="ml-2"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-hidden">
        <SchemaTree
          nodes={filteredNodes}
          expandedNodes={expandedNodes}
          onToggleNode={toggleNode}
          onTableDoubleClick={onTableSelect}
          loading={loading}
        />
      </div>

      {/* Stats */}
      <SchemaStats
        stats={stats}
        loading={loading}
        onRefresh={refreshSchema}
      />
    </div>
  );
}
