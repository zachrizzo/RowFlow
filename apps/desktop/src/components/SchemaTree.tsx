import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table as TableIcon,
  Eye,
  Columns,
  Key,
  Link as LinkIcon,
  Loader2,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SchemaNodeContextMenu } from '@/components/SchemaNodeContextMenu';
import type { SchemaNode } from '@/types/schema';

interface SchemaTreeProps {
  nodes: SchemaNode[];
  expandedNodes: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onTableDoubleClick?: (schema: string, table: string) => void;
  loading?: boolean;
}

interface NodeIconProps {
  node: SchemaNode;
  size?: 'sm' | 'md';
}

function NodeIcon({ node, size = 'md' }: NodeIconProps) {
  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  switch (node.type) {
    case 'schema':
      return <Database className={`${sizeClass} text-blue-500`} />;
    case 'table':
      return <TableIcon className={`${sizeClass} text-green-500`} />;
    case 'view':
      return <Eye className={`${sizeClass} text-purple-500`} />;
    case 'column':
      if (node.metadata?.isPrimaryKey) {
        return <Key className={`${sizeClass} text-yellow-500`} />;
      }
      if (node.metadata?.isForeignKey) {
        return <LinkIcon className={`${sizeClass} text-orange-500`} />;
      }
      return <Columns className={`${sizeClass} text-gray-500`} />;
    default:
      return null;
  }
}

interface TreeNodeProps {
  node: SchemaNode;
  level: number;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  onTableDoubleClick?: (schema: string, table: string) => void;
  onViewInfo: (node: SchemaNode) => void;
}

function TreeNode({
  node,
  level,
  isExpanded,
  onToggle,
  onTableDoubleClick,
  onViewInfo,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const canExpand = node.type === 'schema' || node.type === 'table' || node.type === 'view';

  const handleClick = () => {
    if (canExpand) {
      onToggle(node.id);
    }
  };

  const handleDoubleClick = () => {
    if ((node.type === 'table' || node.type === 'view') && node.schema && node.table && onTableDoubleClick) {
      onTableDoubleClick(node.schema, node.table);
    }
  };

  const handleSampleTable = (schema: string, table: string) => {
    if (onTableDoubleClick) {
      onTableDoubleClick(schema, table);
    }
  };

  return (
    <div>
      <SchemaNodeContextMenu
        node={node}
        onSampleTable={handleSampleTable}
        onViewInfo={onViewInfo}
      >
        <div
          className={`
            flex items-center gap-2 px-2 py-1.5 cursor-pointer
            hover:bg-accent rounded-sm transition-colors
            group
          `}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          {/* Expand/collapse icon */}
          {canExpand && (
            <button
              className="flex-shrink-0 hover:bg-accent-foreground/10 rounded-sm p-0.5 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.id);
              }}
            >
              {node.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}

          {/* Icon */}
          {!canExpand && <div className="w-4" />}
          <NodeIcon node={node} />

          {/* Name */}
          <span className="flex-1 text-sm truncate font-medium">
            {node.name}
          </span>

          {/* Metadata badges */}
          {node.type === 'schema' && node.metadata?.isSystem && (
            <Badge variant="outline" className="h-5 text-[10px] ml-auto">
              System
            </Badge>
          )}

          {(node.type === 'table' || node.type === 'view') && node.metadata?.rowCount !== undefined && (
            <Badge variant="secondary" className="h-5 text-[10px] ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              {node.metadata.rowCount.toLocaleString()} rows
            </Badge>
          )}

          {node.type === 'column' && node.metadata && (
            <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <Badge variant="outline" className="h-5 text-[10px]">
                {node.metadata.dataType}
              </Badge>
              {node.metadata.isPrimaryKey && (
                <Badge variant="default" className="h-5 text-[10px] bg-yellow-500">
                  PK
                </Badge>
              )}
              {node.metadata.isForeignKey && (
                <Badge variant="default" className="h-5 text-[10px] bg-orange-500">
                  FK
                </Badge>
              )}
              {!node.metadata.isNullable && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  NOT NULL
                </Badge>
              )}
            </div>
          )}
        </div>
      </SchemaNodeContextMenu>

      {/* Children */}
      {canExpand && isExpanded && hasChildren && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              isExpanded={false}
              onToggle={onToggle}
              onTableDoubleClick={onTableDoubleClick}
              onViewInfo={onViewInfo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SchemaTree({
  nodes,
  expandedNodes,
  onToggleNode,
  onTableDoubleClick,
  loading = false,
}: SchemaTreeProps) {
  const [infoNode, setInfoNode] = useState<SchemaNode | null>(null);

  const handleViewInfo = useCallback((node: SchemaNode) => {
    setInfoNode(node);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setInfoNode(null);
  }, []);

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading schemas...</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <Database className="h-12 w-12 mb-4 opacity-20 mx-auto" />
          <p className="text-sm">No schemas found</p>
          <p className="text-xs mt-2">Try connecting to a different database</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-2 space-y-0.5">
          {nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              level={0}
              isExpanded={expandedNodes.has(node.id)}
              onToggle={onToggleNode}
              onTableDoubleClick={onTableDoubleClick}
              onViewInfo={handleViewInfo}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Info Dialog */}
      <Dialog open={!!infoNode} onOpenChange={(open) => !open && handleCloseInfo()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NodeIcon node={infoNode || ({} as SchemaNode)} />
              {infoNode?.name}
            </DialogTitle>
            <DialogDescription>
              {infoNode?.type === 'schema' && 'Schema Information'}
              {infoNode?.type === 'table' && 'Table Information'}
              {infoNode?.type === 'view' && 'View Information'}
              {infoNode?.type === 'column' && 'Column Information'}
            </DialogDescription>
          </DialogHeader>

          {infoNode && (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="col-span-2 font-medium capitalize">{infoNode.type}</span>
                </div>

                {infoNode.schema && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-muted-foreground">Schema:</span>
                    <span className="col-span-2 font-mono">{infoNode.schema}</span>
                  </div>
                )}

                {infoNode.table && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="col-span-2 font-mono">{infoNode.table}</span>
                  </div>
                )}
              </div>

              {/* Metadata */}
              {infoNode.metadata && (
                <div className="space-y-2 pt-2 border-t">
                  {infoNode.metadata.owner && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">Owner:</span>
                      <span className="col-span-2">{infoNode.metadata.owner}</span>
                    </div>
                  )}

                  {infoNode.metadata.rowCount !== undefined && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">Row Count:</span>
                      <span className="col-span-2">{infoNode.metadata.rowCount.toLocaleString()}</span>
                    </div>
                  )}

                  {infoNode.metadata.size && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">Size:</span>
                      <span className="col-span-2">{infoNode.metadata.size}</span>
                    </div>
                  )}

                  {infoNode.metadata.dataType && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">Data Type:</span>
                      <span className="col-span-2 font-mono">{infoNode.metadata.dataType}</span>
                    </div>
                  )}

                  {infoNode.metadata.columnDefault && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">Default:</span>
                      <span className="col-span-2 font-mono text-xs">{infoNode.metadata.columnDefault}</span>
                    </div>
                  )}

                  {infoNode.type === 'column' && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {infoNode.metadata.isPrimaryKey && (
                        <Badge variant="default" className="bg-yellow-500">Primary Key</Badge>
                      )}
                      {infoNode.metadata.isUnique && (
                        <Badge variant="secondary">Unique</Badge>
                      )}
                      {infoNode.metadata.isForeignKey && (
                        <Badge variant="default" className="bg-orange-500">Foreign Key</Badge>
                      )}
                      {!infoNode.metadata.isNullable && (
                        <Badge variant="outline">NOT NULL</Badge>
                      )}
                      {infoNode.metadata.isNullable && (
                        <Badge variant="outline">Nullable</Badge>
                      )}
                    </div>
                  )}

                  {infoNode.metadata.foreignKeyTable && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">References:</span>
                      <span className="col-span-2 font-mono text-xs">
                        {infoNode.metadata.foreignKeyTable}.{infoNode.metadata.foreignKeyColumn}
                      </span>
                    </div>
                  )}

                  {infoNode.metadata.description && (
                    <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Description:</span>
                      <span className="col-span-2 text-xs">{infoNode.metadata.description}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
