import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
  Copy,
  FileCode,
  Info,
  Eye,
  Clipboard,
  PlusSquare,
  PlusCircle,
  Columns3,
  Trash2,
  MinusCircle,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import type { SchemaNode } from '@/types/schema';
import { useToast } from '@/hooks/use-toast';

interface SchemaNodeContextMenuProps {
  node: SchemaNode;
  children: ReactNode;
  onSampleTable?: (schema: string, table: string) => void;
  onViewInfo?: (node: SchemaNode) => void;
  onCreateTable?: (schema: string) => void;
  onDropTable?: (schema: string, table: string) => void;
  onAddColumn?: (schema: string, table: string) => void;
  onDropColumn?: (schema: string, table: string, column: string) => void;
  onInsertRow?: (schema: string, table: string) => void;
  onDeleteRows?: (schema: string, table: string) => void;
  onDropSchema?: (schema: string) => void;
  onRenameSchema?: (schema: string) => void;
  onEmbedTable?: (schema: string, table: string) => void;
  onGenerateTestData?: (schema: string, table: string) => void;
}

export function SchemaNodeContextMenu({
  node,
  children,
  onSampleTable,
  onViewInfo,
  onCreateTable,
  onDropTable,
  onAddColumn,
  onDropColumn,
  onInsertRow,
  onDeleteRows,
  onDropSchema,
  onRenameSchema,
  onEmbedTable,
  onGenerateTestData,
}: SchemaNodeContextMenuProps) {
  const { toast } = useToast();

  const copyToClipboard = async (text: string, description: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied to clipboard',
        description,
      });
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleCopyName = () => {
    copyToClipboard(node.name, `Copied "${node.name}"`);
  };

  const handleCopyFullName = () => {
    let fullName = '';
    if (node.schema && node.table && node.type === 'column') {
      fullName = `${node.schema}.${node.table}.${node.name}`;
    } else if (node.schema && node.table) {
      fullName = `${node.schema}.${node.table}`;
    } else if (node.schema) {
      fullName = node.schema;
    } else {
      fullName = node.name;
    }
    copyToClipboard(fullName, `Copied "${fullName}"`);
  };

  const handleCopySelect = () => {
    if (!node.schema || !node.table) return;
    const selectStatement = `SELECT * FROM ${node.schema}.${node.table} LIMIT 100;`;
    copyToClipboard(selectStatement, 'Copied SELECT statement');
  };

  const handleSampleTable = () => {
    if (node.schema && node.table && onSampleTable) {
      onSampleTable(node.schema, node.table);
    }
  };

  const handleViewInfo = () => {
    if (onViewInfo) {
      onViewInfo(node);
    }
  };

  const handleCreateTable = () => {
    if (node.schema && onCreateTable) {
      onCreateTable(node.schema);
    }
  };

  const handleDropTable = () => {
    if (node.schema && node.table && onDropTable) {
      onDropTable(node.schema, node.table);
    }
  };

  const handleAddColumn = () => {
    if (node.schema && node.table && onAddColumn) {
      onAddColumn(node.schema, node.table);
    }
  };

  const handleDropColumn = () => {
    if (node.schema && node.table && onDropColumn) {
      onDropColumn(node.schema, node.table, node.name);
    }
  };

  const handleInsertRow = () => {
    if (node.schema && node.table && onInsertRow) {
      onInsertRow(node.schema, node.table);
    }
  };

  const handleDeleteRows = () => {
    if (node.schema && node.table && onDeleteRows) {
      onDeleteRows(node.schema, node.table);
    }
  };

  const handleDropSchema = () => {
    if (node.schema && onDropSchema) {
      onDropSchema(node.schema);
    }
  };

  const handleRenameSchema = () => {
    if (node.schema && onRenameSchema) {
      onRenameSchema(node.schema);
    }
  };

  const handleEmbedTable = () => {
    if (node.schema && node.table && onEmbedTable) {
      onEmbedTable(node.schema, node.table);
    }
  };

  const handleGenerateTestData = () => {
    if (node.schema && node.table && onGenerateTestData) {
      onGenerateTestData(node.schema, node.table);
    }
  };

  // Determine which menu items to show based on node type
  const showTableActions = node.type === 'table' || node.type === 'view';
  const showColumnActions = node.type === 'column';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Always show copy name */}
        <ContextMenuItem onClick={handleCopyName}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Name
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>

        {/* Show copy full name if applicable */}
        {(node.schema || node.table) && (
          <ContextMenuItem onClick={handleCopyFullName}>
            <Clipboard className="mr-2 h-4 w-4" />
            Copy Full Name
          </ContextMenuItem>
        )}

        {/* Table/View specific actions */}
        {showTableActions && (
          <>
            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleSampleTable}>
              <Eye className="mr-2 h-4 w-4" />
              Sample Table
              <ContextMenuShortcut>⏎</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem onClick={handleCopySelect}>
              <FileCode className="mr-2 h-4 w-4" />
              Copy SELECT Statement
              <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleInsertRow}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Insert Row
            </ContextMenuItem>

            <ContextMenuItem onClick={handleDeleteRows}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Rows
            </ContextMenuItem>

            <ContextMenuItem onClick={handleAddColumn}>
              <Columns3 className="mr-2 h-4 w-4" />
              Add Column
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleViewInfo}>
              <Info className="mr-2 h-4 w-4" />
              View Table Info
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleEmbedTable}>
              <Sparkles className="mr-2 h-4 w-4" />
              Embed Table for AI
            </ContextMenuItem>

            <ContextMenuItem onClick={handleGenerateTestData}>
              <FlaskConical className="mr-2 h-4 w-4" />
              Generate Test Data
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleDropTable}>
              <Trash2 className="mr-2 h-4 w-4" />
              Drop Table
            </ContextMenuItem>
          </>
        )}

        {/* Column specific actions */}
        {showColumnActions && node.metadata && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled className="text-xs text-muted-foreground">
              Type: {node.metadata.dataType}
            </ContextMenuItem>
            {node.metadata.isPrimaryKey && (
              <ContextMenuItem disabled className="text-xs text-muted-foreground">
                Primary Key
              </ContextMenuItem>
            )}
            {node.metadata.isForeignKey && node.metadata.foreignKeyTable && (
              <ContextMenuItem disabled className="text-xs text-muted-foreground">
                FK → {node.metadata.foreignKeyTable}
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={handleDropColumn}>
              <MinusCircle className="mr-2 h-4 w-4" />
              Drop Column
            </ContextMenuItem>
          </>
        )}

        {/* Schema specific actions */}
        {node.type === 'schema' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleViewInfo}>
              <Info className="mr-2 h-4 w-4" />
              Schema Info
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCreateTable}>
              <PlusSquare className="mr-2 h-4 w-4" />
              Create Table
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleRenameSchema}>
              <FileCode className="mr-2 h-4 w-4" />
              Rename Schema
            </ContextMenuItem>
            <ContextMenuItem onClick={handleDropSchema}>
              <Trash2 className="mr-2 h-4 w-4" />
              Drop Schema
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
