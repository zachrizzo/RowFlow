import { useMemo, useState, useEffect, type ComponentType } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Database, RefreshCw, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSchemaGraph } from '@/hooks/useSchemaGraph';
import type { SchemaGraphNode } from '@/types/schema';
import type { Column } from '@/types/connection';

type TableNodeData = {
  table: SchemaGraphNode;
};

type TableNodeType = FlowNode<TableNodeData, 'table'>;
type TableNodeComponentProps = NodeProps<TableNodeType>;

function TableNode({ data }: TableNodeComponentProps) {
  const { table } = data;
  const columns = table.columns as Column[];

  return (
    <div
      className={cn(
        'rounded-md border bg-card text-xs shadow-lg overflow-hidden min-w-[280px] max-w-[350px]',
        table.isExternal && 'border-dashed opacity-80'
      )}
    >
      {/* Table Header */}
      <div className="flex items-center justify-between border-b bg-muted px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center gap-1 font-semibold text-[13px]">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="truncate max-w-[220px]">
            {table.schema}.{table.name}
          </span>
        </div>
        {table.isExternal && (
          <Badge variant="outline" className="text-[10px]">
            External
          </Badge>
        )}
      </div>

      {/* Columns List */}
      <ScrollArea className="max-h-[400px]">
        <div className="px-3 py-2 space-y-0.5">
          {columns.length === 0 && (
            <div className="text-muted-foreground text-[11px] py-2">
              Columns unavailable
            </div>
          )}

          {columns.map((column) => {
            const handleId = `${table.id}-${column.name}`;

            return (
              <div
                key={column.name}
                className="flex items-center justify-between gap-2 py-1 hover:bg-accent rounded-sm px-1 relative"
              >
                {/* Left handle for incoming connections */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={handleId}
                  className="!w-2 !h-2 !bg-blue-500 !border-2 !border-white"
                  style={{
                    left: -6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />

                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="font-mono truncate text-[11px]">{column.name}</span>
                  <span className="text-muted-foreground text-[10px] shrink-0">
                    {column.dataType}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {column.isPrimaryKey && (
                    <Badge variant="default" className="bg-yellow-500 text-[9px] px-1 py-0">
                      PK
                    </Badge>
                  )}
                  {column.isForeignKey && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      FK
                    </Badge>
                  )}
                  {!column.isNullable && (
                    <span className="text-red-500 text-[9px] font-bold" title="NOT NULL">
                      *
                    </span>
                  )}
                </div>

                {/* Right handle for outgoing connections */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  className="!w-2 !h-2 !bg-green-500 !border-2 !border-white"
                  style={{
                    right: -6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

const nodeTypes: Record<string, ComponentType<TableNodeComponentProps>> = {
  table: TableNode,
};

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 200;

function layoutGraph(
  nodes: TableNodeType[],
  edges: FlowEdge[]
): {
  nodes: TableNodeType[];
  edges: FlowEdge[];
} {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: 200,
    nodesep: 120,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.width ?? DEFAULT_WIDTH,
      height: node.height ?? DEFAULT_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const positionedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode?.x ?? 0,
        y: dagreNode?.y ?? 0,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });

  const flowEdges = edges.map((edge) => ({
    ...edge,
    type: 'smoothstep' as const,
  }));

  return {
    nodes: positionedNodes,
    edges: flowEdges,
  };
}

interface SchemaGraphProps {
  connectionId: string | null;
  schemas: string[];
  defaultSchema?: string | null;
}

export function SchemaGraph({
  connectionId,
  schemas,
  defaultSchema = null,
}: SchemaGraphProps) {
  const [selectedSchema, setSelectedSchema] = useState<string | 'all'>(
    defaultSchema ?? 'all'
  );

  useEffect(() => {
    if (defaultSchema) {
      setSelectedSchema(defaultSchema);
    } else {
      setSelectedSchema('all');
    }
  }, [defaultSchema]);

  const { nodes, edges, loading, error, progress, hasMore, loadMore, refresh } = useSchemaGraph({
    connectionId,
    schema: selectedSchema === 'all' ? null : selectedSchema,
    autoLoad: true,
    maxTables: 50,
    batchSize: 5,
  });

  const flowGraph = useMemo(() => {
    const flowNodes: TableNodeType[] = nodes.map((table) => {
      // Estimate height based on actual number of columns (capped at 400px max-height)
      const headerHeight = 40;
      const columnHeight = 28;
      const maxVisibleColumns = Math.floor((400 - headerHeight) / columnHeight);
      const visibleColumns = Math.min(table.columns.length, maxVisibleColumns);
      const estimatedHeight = headerHeight + (visibleColumns * columnHeight) + 20;

      return {
        id: table.id,
        type: 'table' as const,
        data: { table },
        position: { x: 0, y: 0 },
        width: 320,
        height: Math.max(120, Math.min(estimatedHeight, 450)),
      } as TableNodeType;
    });

    // Create edges with specific source/target handles for column-to-column connections
    const flowEdges: FlowEdge[] = edges.flatMap((edge) => {
      // Create an edge for each column pair in the foreign key
      return edge.columns.map((sourceCol, index) => {
        const targetCol = edge.foreignColumns[index];
        const sourceHandleId = `${edge.source}-${sourceCol}`;
        const targetHandleId = `${edge.target}-${targetCol}`;

        return {
          id: `${edge.id}-${index}`,
          source: edge.source,
          target: edge.target,
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
          label: index === 0 ? `${edge.name}` : undefined,
          labelBgPadding: [6, 2] as [number, number],
          labelStyle: { fontSize: 10, fontWeight: 500 },
          animated: false,
          style: {
            stroke: index === 0 ? '#3b82f6' : '#94a3b8',
            strokeWidth: index === 0 ? 2 : 1,
          },
        };
      });
    });

    return layoutGraph(flowNodes, flowEdges);
  }, [nodes, edges]);

  if (!connectionId) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Alert>
          <AlertDescription>
            Connect to a database to view the schema graph.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Schema Relationships</h3>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selectedSchema}
            onValueChange={(value) => setSelectedSchema(value as typeof selectedSchema)}
          >
            <SelectTrigger className="w-[200px] text-xs">
              <SelectValue placeholder="All schemas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schemas</SelectItem>
              {schemas.map((schemaName) => (
                <SelectItem key={schemaName} value={schemaName}>
                  {schemaName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="relative flex-1 min-h-[400px] rounded-md border overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-2">
              {progress ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    Loading relationships... ({progress.current}/{progress.total} tables)
                  </span>
                  <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Building relationship graph…
                </span>
              )}
            </div>
          </div>
        )}

        {!loading && nodes.length === 0 && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Database className="h-12 w-12 mb-4 opacity-20 mx-auto" />
              <p className="text-sm">No tables with relationships found</p>
              <p className="text-xs mt-2">Try selecting a different schema</p>
            </div>
          </div>
        )}

        <ReactFlow<TableNodeType, FlowEdge>
          nodes={flowGraph.nodes}
          edges={flowGraph.edges}
          fitView
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="#e2e8f0" className="opacity-60" />
          <MiniMap
            pannable
            zoomable
            className="!bg-background/80 backdrop-blur"
            nodeColor={(node) => {
              const data = node.data as TableNodeData | undefined;
              return data?.table.isExternal ? '#f97316' : '#22c55e';
            }}
          />
          <Controls
            showInteractive={false}
            position="bottom-right"
            className="rounded-md bg-background/90 backdrop-blur"
          />
        </ReactFlow>

        {/* Load More button */}
        {hasMore && !loading && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <Button
              variant="default"
              size="sm"
              onClick={loadMore}
              className="shadow-lg"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Load More Tables ({nodes.length} loaded)
            </Button>
          </div>
        )}
      </div>

      {/* Info message */}
      {nodes.length > 0 && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Showing {nodes.length} table{nodes.length !== 1 ? 's' : ''} with {edges.length} relationship{edges.length !== 1 ? 's' : ''}
          {hasMore && ` • ${hasMore ? 'More available' : 'All tables loaded'}`}
        </div>
      )}
    </div>
  );
}
