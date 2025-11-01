import { useMemo, useState } from 'react';
import { FolderTree, AlertCircle, Layers, ChevronRight, List, Minimize2, Maximize2, Maximize } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDatabase } from '@/hooks/useDatabase';
import { useSchema } from '@/hooks/useSchema';
import { SchemaSearch } from '@/components/SchemaSearch';
import { SchemaTree } from '@/components/SchemaTree';
import { SchemaGraph } from '@/components/SchemaGraph';

export type PanelSize = 'minimized' | 'normal' | 'expanded';

interface SchemaPanelProps {
  onTableSelect?: (schema: string, table: string) => void;
  selectedTable?: { schema: string; table: string } | null;
  panelSize?: PanelSize;
  onPanelSizeChange?: (size: PanelSize) => void;
}

export function SchemaPanel({ onTableSelect, selectedTable, panelSize = 'normal', onPanelSizeChange }: SchemaPanelProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();
  const [activeTab, setActiveTab] = useState<'tree' | 'graph'>('tree');

  const handleMinimize = () => onPanelSizeChange?.('minimized');
  const handleNormal = () => onPanelSizeChange?.('normal');
  const handleExpand = () => onPanelSizeChange?.('expanded');

  const {
    nodes,
    filteredNodes,
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

  const schemaNames = useMemo(() => {
    const unique = new Set<string>();
    nodes.forEach((node) => {
      if (node.type === 'schema' && node.schema) {
        unique.add(node.schema);
      }
    });
    return Array.from(unique).sort();
  }, [nodes]);

  // Minimized state - show vertical bar
  if (panelSize === 'minimized') {
    return (
      <div className="flex h-full flex-col bg-card border-x w-12">
        <div className="flex flex-col items-center gap-2 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNormal}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Restore Schema Browser</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <FolderTree className="h-5 w-5 text-muted-foreground mt-2" />
        </div>
      </div>
    );
  }

  // Not connected state
  if (!activeConnection || activeConnection.status !== 'connected') {
    return (
      <div className="flex h-full flex-col bg-card border-x">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <h2 className="font-semibold">Schema Browser</h2>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMinimize}
                    className="h-8 w-8"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimize Panel</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5" />
          <h2 className="font-semibold">Schema Browser</h2>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            {/* Minimize Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMinimize}
                  className="h-8 w-8"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Minimize Panel</p>
              </TooltipContent>
            </Tooltip>

            {/* Expand/Normal Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={panelSize === 'expanded' ? handleNormal : handleExpand}
                  className="h-8 w-8"
                >
                  {panelSize === 'expanded' ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{panelSize === 'expanded' ? 'Restore Size' : 'Expand Panel'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tree' | 'graph')} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mx-4 mt-2">
          <TabsTrigger value="tree" className="gap-2">
            <List className="h-4 w-4" />
            Tree View
          </TabsTrigger>
          <TabsTrigger value="graph" className="gap-2">
            <Layers className="h-4 w-4" />
            Graph View
          </TabsTrigger>
        </TabsList>

        {/* Tree View Tab */}
        <TabsContent value="tree" className="flex-1 flex flex-col mt-0 data-[state=inactive]:hidden">
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
              onTableSelect={onTableSelect}
              selectedTable={selectedTable}
              loading={loading}
            />
          </div>
        </TabsContent>

        {/* Graph View Tab */}
        <TabsContent value="graph" className="flex-1 mt-0 data-[state=inactive]:hidden">
          <div className="h-full p-4">
            <SchemaGraph
              connectionId={activeConnection?.connectionId || null}
              schemas={schemaNames}
              defaultSchema={selectedTable?.schema ?? schemaNames[0] ?? null}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
