import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Database, RefreshCw, Layers, Loader2, ArrowUpRight, Search, Move } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useSchemaGraph } from '@/hooks/useSchemaGraph';
import { useToast } from '@/hooks/use-toast';
import type { SchemaGraphNode } from '@/types/schema';
import type { Column } from '@/types/connection';

type ForeignKeyNavigationPayload = {
  sourceSchema: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn?: string;
};

type TableNodeData = {
  table: SchemaGraphNode;
  onOpenTable?: (schema: string, table: string) => void;
  onNavigateForeignKey?: (params: ForeignKeyNavigationPayload) => void;
  isHighlighted?: boolean;
  highlightedColumns?: string[];
  isManualLayout?: boolean;
};

type TableNodeType = FlowNode<TableNodeData, 'table'>;
type TableNodeComponentProps = NodeProps<TableNodeType>;
type SchemaFlowEdge = FlowEdge<{ schemaEdgeId: string }>;

function TableNode({ data }: TableNodeComponentProps) {
  const {
    table,
    onOpenTable,
    onNavigateForeignKey,
    isHighlighted,
    highlightedColumns,
    isManualLayout,
  } = data;
  const columns = table.columns as Column[];
  const highlightedColumnSet = new Set(highlightedColumns ?? []);

  const navigateToForeignKey = useCallback(
    (column: Column) => {
      if (!column.isForeignKey || !column.foreignKeyTable) {
        return;
      }

      const targetSchema = column.foreignKeySchema || table.schema;
      onNavigateForeignKey?.({
        sourceSchema: table.schema,
        sourceTable: table.name,
        sourceColumn: column.name,
        targetSchema,
        targetTable: column.foreignKeyTable,
        targetColumn: column.foreignKeyColumn ?? undefined,
      });
    },
    [onNavigateForeignKey, table.schema, table.name]
  );

  return (
    <div
      className={cn(
        'rounded-md border bg-card text-xs shadow-lg overflow-hidden min-w-[280px] max-w-[350px] transition-shadow cursor-default',
        table.isExternal && 'border-dashed opacity-80',
        isHighlighted && 'ring-2 ring-primary shadow-primary/30'
      )}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Table Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b bg-muted px-3 py-2 sticky top-0 z-10 select-none schema-table-drag-handle',
          isManualLayout ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        )}
      >
        <div className="flex items-center gap-1 font-semibold text-[13px]">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="truncate max-w-[200px]">
            {table.schema}.{table.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {table.isExternal && (
            <Badge variant="outline" className="text-[10px]">
              External
            </Badge>
          )}

          {onOpenTable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer relative z-20"
              style={{ pointerEvents: 'auto' }}
              title="Open table in data tab"
              aria-label={`Open ${table.schema}.${table.name}`}
              onMouseDown={(event: ReactMouseEvent) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              onPointerDown={(event: ReactPointerEvent) => {
                event.stopPropagation();
                event.preventDefault();
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onOpenTable(table.schema, table.name);
              }}
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
        </div>
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
            const canNavigate = Boolean(column.isForeignKey && column.foreignKeyTable);
            const foreignSchema = column.foreignKeySchema || table.schema;

            const handlePointerDown = (event: ReactPointerEvent | ReactMouseEvent) => {
              if (!canNavigate) {
                return;
              }
              event.stopPropagation();
            };

            const onKeyDown = (event: KeyboardEvent) => {
              if (!canNavigate) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                navigateToForeignKey(column);
              }
            };

            return (
              <div
                key={column.name}
                className={cn(
                  'flex items-center justify-between gap-2 py-1 rounded-sm px-1 relative border border-transparent hover:bg-accent',
                  canNavigate
                    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1'
                    : 'cursor-default',
                  highlightedColumnSet.has(column.name) && 'bg-primary/10 border-primary'
                )}
                tabIndex={canNavigate ? 0 : undefined}
                role={canNavigate ? 'button' : undefined}
                title={
                  canNavigate
                    ? `Jump to ${foreignSchema}.${column.foreignKeyTable}`
                    : undefined
                }
                onClick={(event) => {
                  if (!canNavigate) {
                    return;
                  }
                  event.stopPropagation();
                  navigateToForeignKey(column);
                }}
                onPointerDown={handlePointerDown}
                onKeyDown={onKeyDown}
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

type LayoutResult = {
  nodes: TableNodeType[];
  edges: SchemaFlowEdge[];
};

function layoutGraph(nodes: TableNodeType[], edges: SchemaFlowEdge[]): LayoutResult {
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

type RelationFocus = {
  summary: string;
  sourceId: string;
  targetId: string;
  sourceColumn: string;
  targetColumn?: string;
  connectedDetails: Array<{ id: string; label: string; isPrimary: boolean }>;
  connectedNodeSet: Set<string>;
  connectedEdgeIdSet: Set<string>;
};

interface SchemaGraphProps {
  connectionId: string | null;
  schemas: string[];
  defaultSchema?: string | null;
  onOpenTable?: (schema: string, table: string) => void;
}

export function SchemaGraph({
  connectionId,
  schemas,
  defaultSchema = null,
  onOpenTable,
}: SchemaGraphProps) {
  const [selectedSchema, setSelectedSchema] = useState<string | 'all'>(
    defaultSchema ?? 'all'
  );
  const { toast } = useToast();
  const reactFlowInstanceRef = useRef<ReactFlowInstance<TableNodeType, SchemaFlowEdge> | null>(null);
  const [isManualLayout, setIsManualLayout] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [highlightedColumnsByNode, setHighlightedColumnsByNode] = useState<Record<string, string[]>>({});
  const [relationFocus, setRelationFocus] = useState<RelationFocus | null>(null);
  const [isolationEnabled, setIsolationEnabled] = useState(false);

  useEffect(() => {
    if (defaultSchema) {
      setSelectedSchema(defaultSchema);
    } else {
      setSelectedSchema('all');
    }
  }, [defaultSchema]);

  useEffect(() => {
    setHighlightedNodeId(null);
    setHighlightedColumnsByNode({});
    setSearchQuery('');
    setRelationFocus(null);
    setIsolationEnabled(false);
  }, [selectedSchema, connectionId]);

  const { nodes, edges, loading, error, progress, hasMore, loadMore, refresh } = useSchemaGraph({
    connectionId,
    schema: selectedSchema === 'all' ? null : selectedSchema,
    autoLoad: true,
    maxTables: 50,
    batchSize: 5,
  });

  const schemaNodeMap = useMemo(() => {
    const map = new Map<string, SchemaGraphNode>();
    nodes.forEach((table) => {
      map.set(table.id, table);
    });
    return map;
  }, [nodes]);

  const flowGraph = useMemo(() => {
    const flowNodes: TableNodeType[] = nodes.map((table) => {
      const headerHeight = 40;
      const columnHeight = 28;
      const maxVisibleColumns = Math.floor((400 - headerHeight) / columnHeight);
      const visibleColumns = Math.min(table.columns.length, maxVisibleColumns);
      const estimatedHeight = headerHeight + visibleColumns * columnHeight + 20;

      return {
        id: table.id,
        type: 'table' as const,
        data: { table },
        position: { x: 0, y: 0 },
        width: 320,
        height: Math.max(120, Math.min(estimatedHeight, 450)),
      } as TableNodeType;
    });

    const flowEdges: SchemaFlowEdge[] = edges.flatMap((edge) => {
      const columnPairs = edge.columns
        .map((sourceCol, index) => {
          const targetCol = edge.foreignColumns[index];
          return { sourceCol, targetCol };
        })
        .filter(
          (pair): pair is { sourceCol: string; targetCol: string } =>
            Boolean(pair.sourceCol && pair.targetCol)
        );

      return columnPairs.map((pair, pairIndex) => ({
        id: `${edge.id}-${pairIndex}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: `${edge.source}-${pair.sourceCol}`,
        targetHandle: `${edge.target}-${pair.targetCol}`,
        label: pairIndex === 0 ? `${edge.name}` : undefined,
        labelBgPadding: [6, 2] as [number, number],
        labelStyle: { fontSize: 10, fontWeight: 500 },
        animated: false,
        data: {
          schemaEdgeId: edge.id,
        },
        style: {
          stroke: pairIndex === 0 ? '#3b82f6' : '#94a3b8',
          strokeWidth: pairIndex === 0 ? 2 : 1,
        },
      }));
    });

    return layoutGraph(flowNodes, flowEdges);
  }, [nodes, edges]);

  useEffect(() => {
    if (!isManualLayout) {
      setNodePositions({});
      return;
    }

    setNodePositions((prev) => {
      const next = { ...prev };
      flowGraph.nodes.forEach((node) => {
        if (!next[node.id]) {
          next[node.id] = node.position;
        }
      });
      return next;
    });
  }, [isManualLayout, flowGraph.nodes]);

  const focusNode = useCallback(
    (nodeId: string, highlightColumns?: string[]) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) {
        toast({
          title: 'Graph is still initializing',
          description: 'Please wait for the graph to finish loading.',
        });
        return false;
      }

      const node = instance.getNode(nodeId);
      if (!node) {
        toast({
          title: 'Table not loaded yet',
          description: 'Load more tables to include this relationship.',
          variant: 'destructive',
        });
        return false;
      }

      instance.fitView({ nodes: [node], padding: 0.4, duration: 600 });
      setHighlightedNodeId(nodeId);
      setHighlightedColumnsByNode(
        highlightColumns && highlightColumns.length
          ? { [nodeId]: highlightColumns }
          : { [nodeId]: [] }
      );
      return true;
    },
    [toast]
  );

  const buildRelationFocus = useCallback(
    (params: ForeignKeyNavigationPayload): RelationFocus => {
      const sourceId = `${params.sourceSchema}.${params.sourceTable}`;
      const targetId = `${params.targetSchema}.${params.targetTable}`;
      const relatedNodeSet = new Set<string>([sourceId, targetId]);

      edges.forEach((edge) => {
        if (
          edge.source === sourceId ||
          edge.target === sourceId ||
          edge.source === targetId ||
          edge.target === targetId
        ) {
          relatedNodeSet.add(edge.source);
          relatedNodeSet.add(edge.target);
        }
      });

      const relatedEdgeIds = edges
        .filter(
          (edge) =>
            relatedNodeSet.has(edge.source) && relatedNodeSet.has(edge.target)
        )
        .map((edge) => edge.id);

      const priorityValue = (id: string) => {
        if (id === sourceId) return 0;
        if (id === targetId) return 1;
        return 2;
      };

      const connectedDetails = Array.from(relatedNodeSet)
        .sort((a, b) => {
          const diff = priorityValue(a) - priorityValue(b);
          if (diff !== 0) return diff;
          return a.localeCompare(b);
        })
        .map((id) => {
          const table = schemaNodeMap.get(id);
          return {
            id,
            label: table ? `${table.schema}.${table.name}` : id,
            isPrimary: id === sourceId || id === targetId,
          };
        });

      return {
        summary: `${sourceId}.${params.sourceColumn} → ${targetId}${
          params.targetColumn ? `.${params.targetColumn}` : ''
        }`,
        sourceId,
        targetId,
        sourceColumn: params.sourceColumn,
        targetColumn: params.targetColumn,
        connectedDetails,
        connectedNodeSet: relatedNodeSet,
        connectedEdgeIdSet: new Set(relatedEdgeIds),
      };
    },
    [edges, schemaNodeMap]
  );

  const clearRelationFocus = useCallback(() => {
    setRelationFocus(null);
    setIsolationEnabled(false);
  }, []);

  const handleForeignKeyNavigation = useCallback(
    (params: ForeignKeyNavigationPayload) => {
      const targetId = `${params.targetSchema}.${params.targetTable}`;
      focusNode(targetId, params.targetColumn ? [params.targetColumn] : undefined);
      setRelationFocus(buildRelationFocus(params));
      setIsolationEnabled(false);
    },
    [focusNode, buildRelationFocus]
  );

  const handleOpenTableFromNode = useCallback(
    (schema: string, table: string) => {
      const targetId = `${schema}.${table}`;
      focusNode(targetId);
      onOpenTable?.(schema, table);
    },
    [focusNode, onOpenTable]
  );

  const relationNodeSet =
    relationFocus && isolationEnabled ? relationFocus.connectedNodeSet : null;

  const displayedNodes = useMemo(() => {
    return flowGraph.nodes
      .filter((node) => {
        if (!relationNodeSet) {
          return true;
        }
        return relationNodeSet.has(node.id);
      })
      .map((node) => {
        const customPosition =
          isManualLayout && nodePositions[node.id]
            ? nodePositions[node.id]
            : node.position;

        return {
          ...node,
          draggable: isManualLayout,
          selectable: isManualLayout,
          position: customPosition ?? { x: 0, y: 0 },
          data: {
            ...node.data,
            onOpenTable: handleOpenTableFromNode,
            onNavigateForeignKey: handleForeignKeyNavigation,
            isHighlighted: highlightedNodeId === node.id,
            highlightedColumns: highlightedColumnsByNode[node.id] ?? [],
            isManualLayout,
          },
        };
      });
  }, [
    flowGraph.nodes,
    isManualLayout,
    nodePositions,
    handleOpenTableFromNode,
    handleForeignKeyNavigation,
    highlightedNodeId,
    highlightedColumnsByNode,
    relationNodeSet,
  ]);

  const displayedEdges = useMemo(() => {
    if (!relationFocus || !isolationEnabled) {
      return flowGraph.edges;
    }

    return flowGraph.edges.filter((edge) => {
      const schemaEdgeId = edge.data?.schemaEdgeId ?? '';
      return (
        relationFocus.connectedEdgeIdSet.has(schemaEdgeId) &&
        relationFocus.connectedNodeSet.has(String(edge.source)) &&
        relationFocus.connectedNodeSet.has(String(edge.target))
      );
    });
  }, [flowGraph.edges, isolationEnabled, relationFocus]);

  const searchableNodes = useMemo(
    () =>
      nodes.map((table) => ({
        id: table.id,
        label: `${table.schema}.${table.name}`,
      })),
    [nodes]
  );

  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return searchableNodes
      .filter((entry) => entry.label.toLowerCase().includes(term))
      .slice(0, 8);
  }, [searchQuery, searchableNodes]);

  const handleSearchResultClick = useCallback(
    (nodeId: string) => {
      if (focusNode(nodeId)) {
        setSearchQuery('');
      }
    },
    [focusNode]
  );

  const handleSearchSubmit = useCallback(() => {
    if (searchResults.length === 0) {
      return;
    }

    const firstResult = searchResults[0];
    if (firstResult) {
      handleSearchResultClick(firstResult.id);
    }
  }, [handleSearchResultClick, searchResults]);

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: FlowNode<TableNodeData>) => {
      if (!isManualLayout) {
        return;
      }

      setNodePositions((prev) => ({
        ...prev,
        [node.id]: node.position,
      }));
    },
    [isManualLayout]
  );

  const handleReactFlowInit = useCallback((instance: ReactFlowInstance<TableNodeType, SchemaFlowEdge>) => {
    reactFlowInstanceRef.current = instance;
  }, []);

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
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Schema Relationships</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <div className="relative w-64">
            <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tables"
              className="pl-8 pr-2 text-xs"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
            />
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-md border bg-popover shadow-lg z-20">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">No tables found</div>
                ) : (
                  <ul className="max-h-52 overflow-y-auto text-xs">
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSearchResultClick(result.id)}
                        >
                          {result.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
            <Move className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">Move nodes</span>
            <Switch
              id="schema-graph-move-toggle"
              checked={isManualLayout}
              onCheckedChange={(checked) => setIsManualLayout(checked === true)}
            />
          </div>

          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {relationFocus && (
        <div className="rounded-md border bg-card/70 px-3 py-2 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Focused foreign key</p>
              <p className="font-mono text-sm">{relationFocus.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isolationEnabled ? 'default' : 'outline'}
                onClick={() => setIsolationEnabled((prev) => !prev)}
              >
                {isolationEnabled ? 'Show full graph' : 'Isolate relation'}
              </Button>
              <Button size="sm" variant="ghost" onClick={clearRelationFocus}>
                Clear
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {relationFocus.connectedDetails.map((detail) => (
              <Button
                key={detail.id}
                size="sm"
                variant={detail.isPrimary ? 'secondary' : 'ghost'}
                className="font-mono"
                onClick={() => focusNode(detail.id)}
              >
                {detail.label}
              </Button>
            ))}
          </div>
        </div>
      )}

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
                <span className="text-xs text-muted-foreground">Building relationship graph…</span>
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

        <ReactFlow<TableNodeType, SchemaFlowEdge>
          nodes={displayedNodes}
          edges={displayedEdges}
          fitView
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={isManualLayout}
          elementsSelectable={isManualLayout}
          nodesConnectable={false}
          onNodeDragStop={handleNodeDragStop}
          onInit={handleReactFlowInit}
          onNodeClick={(event) => {
            // Prevent node clicks from interfering with button clicks
            const target = event.target as HTMLElement;
            if (target.closest('button') || target.closest('[role="button"]')) {
              return;
            }
          }}
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

        {hasMore && !loading && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <Button variant="default" size="sm" onClick={loadMore} className="shadow-lg">
              <RefreshCw className="h-4 w-4 mr-2" />
              Load More Tables ({nodes.length} loaded)
            </Button>
          </div>
        )}
      </div>

      {nodes.length > 0 && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Showing {nodes.length} table{nodes.length !== 1 ? 's' : ''} with {edges.length} relationship
          {edges.length !== 1 ? 's' : ''}
          {hasMore && ` • ${hasMore ? 'More available' : 'All tables loaded'}`}
        </div>
      )}
    </div>
  );
}
