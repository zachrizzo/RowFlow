import { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Copy, FileJson, FileText, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ResultCell } from './ResultCell';
import { JsonSidebar } from './JsonSidebar';
import { exportToCsv, exportToJson, copyToClipboard, formatCellValue } from '@/lib/export';
import type { QueryResult } from '@/types/query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export interface ResultsGridProps {
  result: QueryResult | null;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  editable?: boolean;
  editedRows?: Map<number, Record<string, any>>;
  onCellEdit?: (
    rowIndex: number,
    columnId: string,
    newValue: any,
    originalValue: any
  ) => void;
  connectionId?: string | null;
  schema?: string | null;
  table?: string | null;
  primaryKeys?: string[];
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSortChange?: (columnId: string, direction: 'asc' | 'desc' | null) => void;
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function stringifyValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function coerceInputValue(input: string, columnType?: string): any {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    if (!columnType) return '';
    const lower = columnType.toLowerCase();
    if (
      lower.includes('int') ||
      lower.includes('numeric') ||
      lower.includes('decimal') ||
      lower.includes('float') ||
      lower.includes('double')
    ) {
      return null;
    }
    if (lower.includes('bool')) {
      return null;
    }
    return '';
  }

  if (trimmed.toUpperCase() === 'NULL') {
    return null;
  }

  if (!columnType) {
    return input;
  }

  const lower = columnType.toLowerCase();

  if (
    lower.includes('int') ||
    lower.includes('numeric') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double')
  ) {
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric;
    }
  }

  if (lower.includes('bool')) {
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed === 'true' || lowerTrimmed === '1') return true;
    if (lowerTrimmed === 'false' || lowerTrimmed === '0') return false;
  }

  if (lower.includes('json')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return input;
    }
  }

  return input;
}

interface EditableCellProps {
  rowIndex: number;
  columnId: string;
  value: any;
  originalValue: any;
  onCommit?: (
    rowIndex: number,
    columnId: string,
    newValue: any,
    originalValue: any
  ) => void;
  columnType?: string;
}

function EditableCell({
  rowIndex,
  columnId,
  value,
  originalValue,
  onCommit,
  columnType,
}: EditableCellProps) {
  const [draft, setDraft] = useState<string>(() => {
    if (value === null || value === undefined) return '';
    return stringifyValue(value);
  });
  const isBoolean = typeof originalValue === 'boolean';

  useEffect(() => {
    if (isBoolean) return;
    setDraft(stringifyValue(value));
  }, [value, isBoolean]);

  if (isBoolean) {
    return (
      <div className="px-3 py-2 h-full flex items-center">
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) =>
            onCommit?.(rowIndex, columnId, Boolean(checked), originalValue)
          }
        />
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 h-full flex items-center">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() =>
          onCommit?.(
            rowIndex,
            columnId,
            coerceInputValue(draft, columnType),
            originalValue
          )
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(stringifyValue(originalValue));
            event.currentTarget.blur();
          }
        }}
        className="h-7 text-xs"
        placeholder="NULL"
      />
    </div>
  );
}

export function ResultsGrid({
  result,
  onLoadMore,
  loadingMore = false,
  editable = false,
  editedRows,
  onCellEdit,
  connectionId = null,
  schema = null,
  table = null,
  primaryKeys = [],
  sortColumn = null,
  sortDirection = null,
  onSortChange,
}: ResultsGridProps) {
  const [jsonSidebarOpen, setJsonSidebarOpen] = useState(false);
  const [selectedJsonRowId, setSelectedJsonRowId] = useState<string | null>(null);
  const [selectedJsonRow, setSelectedJsonRow] = useState<Record<string, any> | null>(null);
  const { toast } = useToast();
  const rowCount = result?.rows.length ?? 0;

  const handleViewAsJson = (rowId: string, rowData: Record<string, any>) => {
    const isSameRow = selectedJsonRowId === rowId && jsonSidebarOpen;
    if (isSameRow) {
      setJsonSidebarOpen(false);
      setSelectedJsonRowId(null);
      setSelectedJsonRow(null);
    } else {
      setSelectedJsonRowId(rowId);
      setSelectedJsonRow({ ...rowData });
      setJsonSidebarOpen(true);
    }
  };

  const closeJsonSidebar = () => {
    setJsonSidebarOpen(false);
    setSelectedJsonRowId(null);
    setSelectedJsonRow(null);
  };

  useEffect(() => {
    if (rowCount === 0) {
      closeJsonSidebar();
    }
  }, [rowCount]);

  // Create columns from result fields
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (!result || result.fields.length === 0) return [];

    return result.fields.map((field) => ({
      accessorKey: field.name,
      id: field.name,
      header: () => {
        const isSorted = sortColumn === field.name;
        const currentDirection = isSorted ? sortDirection : null;

        const getSortIcon = () => {
          if (!onSortChange) return null;
          if (currentDirection === 'asc') return <ArrowUp className="h-3 w-3 text-muted-foreground" />;
          if (currentDirection === 'desc') return <ArrowDown className="h-3 w-3 text-muted-foreground" />;
          return <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-70" />;
        };

        const content = (
          <div className="w-full px-3 py-2 flex flex-col gap-0.5">
            <span className="flex items-center gap-1">
              <span className="font-semibold text-xs truncate">{field.name}</span>
              {getSortIcon()}
            </span>
            <span className="text-[10px] text-muted-foreground font-normal truncate">
              {field.typeName}
            </span>
          </div>
        );

        if (!onSortChange) return content;

        const handleHeaderClick = () => {
          const nextDirection: 'asc' | 'desc' | null =
            !currentDirection ? 'asc' : currentDirection === 'asc' ? 'desc' : null;
          onSortChange(field.name, nextDirection);
        };

        return (
          <button
            type="button"
            onClick={handleHeaderClick}
            className="w-full text-left hover:bg-muted/70 transition-colors"
          >
            {content}
          </button>
        );
      },
      cell: ({ row, column }) => {
        const columnId = column.id;
        const rowIndex = row.index;
        const originalRow = row.original ?? {};
        const updatedRow = editedRows?.get(rowIndex);
        const displayValue = updatedRow?.[columnId] ?? originalRow[columnId];
        const originalValue = originalRow[columnId];
        const isDirty = updatedRow && columnId in updatedRow
          ? !valuesEqual(displayValue, originalValue)
          : false;

        if (editable) {
          const hasPrimaryKeys = primaryKeys.length === 0 ||
            primaryKeys.every((pk) => originalRow[pk] != null);

          if (!hasPrimaryKeys) {
            return (
              <div
                className="px-3 py-2 h-full flex items-center text-xs truncate bg-muted/40 text-muted-foreground cursor-not-allowed"
                title="Row cannot be edited because primary key values are NULL."
              >
                {formatCellValue(displayValue)}
              </div>
            );
          }

          return (
            <div className={cn('h-full w-full', isDirty && 'bg-yellow-500/10 dark:bg-yellow-500/20')}>
              <EditableCell
                rowIndex={rowIndex}
                columnId={columnId}
                value={displayValue}
                originalValue={originalValue}
                columnType={field.typeName}
                onCommit={onCellEdit}
              />
            </div>
          );
        }

        return <ResultCell value={displayValue} />;
      },
      size: 200,
      minSize: 100,
      maxSize: 600,
    }));
  }, [
    result,
    editable,
    editedRows,
    onCellEdit,
    sortColumn,
    sortDirection,
    onSortChange,
    primaryKeys,
  ]);

  const reactTable = useReactTable({
    data: result?.rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  });

  const { rows } = reactTable.getRowModel();
  const parentRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 20,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualRows.length > 0
    ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0;

  // Export handlers
  const handleExportCsv = () => {
    if (!result) return;
    exportToCsv(result);
    toast({
      title: 'Exported',
      description: 'Results exported to CSV',
    });
  };

  const handleExportJson = () => {
    if (!result) return;
    exportToJson(result);
    toast({
      title: 'Exported',
      description: 'Results exported to JSON',
    });
  };

  const handleCopyAll = async () => {
    if (!result) return;
    try {
      await copyToClipboard(result, 'csv');
      toast({
        title: 'Copied',
        description: 'Results copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy results',
        variant: 'destructive',
      });
    }
  };

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mb-4 opacity-20 mx-auto" />
          <p className="text-sm">No results to display</p>
          <p className="text-xs mt-1">Execute a query to see results</p>
        </div>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with metadata */}
        <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              Query returned 0 rows in {result.executionTime.toFixed(2)}ms
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="h-12 w-12 mb-4 opacity-20 mx-auto" />
            <p className="text-sm">No rows returned</p>
            <p className="text-xs mt-1">The query executed successfully but returned no data</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with metadata and export buttons */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{result.rowCount}</span> rows
          </span>
          <span className="text-muted-foreground">
            in <span className="font-semibold text-foreground">{result.executionTime.toFixed(2)}</span>ms
          </span>
          {result.hasMore && (
            <span className="text-xs text-orange-400">
              More results available
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleCopyAll}>
            <Copy className="h-3 w-3 mr-1" />
            Copy All
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>
                <FileText className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJson}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Results table with virtualization */}
      <div
        ref={parentRef as any}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-muted">
            {reactTable.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'text-left font-semibold border-r last:border-r-0',
                      'relative group'
                    )}
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}

                    {/* Column resizer */}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={cn(
                        'absolute top-0 right-0 h-full w-1 cursor-col-resize',
                        'opacity-0 group-hover:opacity-100 hover:bg-primary',
                        'transition-opacity',
                        header.column.getIsResizing() && 'opacity-100 bg-primary'
                      )}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              const isSelected = jsonSidebarOpen && selectedJsonRowId === row.id;
              const isEdited = editable && editedRows?.has(row.index);
              const isEven = virtualRow.index % 2 === 0;

              const rowClassName = cn(
                'border-b transition-colors',
                isEdited
                  ? 'bg-yellow-500/5 hover:bg-yellow-500/10 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20'
                  : isEven
                    ? 'bg-background hover:bg-muted/30'
                    : 'bg-muted/10 hover:bg-muted/30',
                isSelected && 'ring-2 ring-primary'
              );

              return (
                <ContextMenu key={row.id}>
                  <ContextMenuTrigger asChild>
                    <tr className={rowClassName}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="border-r last:border-r-0 h-[35px]"
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => handleViewAsJson(row.id, row.original as Record<string, any>)}
                    >
                      <FileJson className="mr-2 h-4 w-4" />
                      View as JSON
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: `${paddingBottom}px` }} />
              </tr>
            )}
          </tbody>
        </table>

        {/* Load more button if there are more results */}
        {result.hasMore && onLoadMore && (
          <div className="flex justify-center py-4">
            <Button onClick={onLoadMore} variant="outline" size="sm" disabled={loadingMore}>
              {loadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More Results'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* JSON Sidebar */}
      <JsonSidebar
        open={jsonSidebarOpen}
        onOpenChange={setJsonSidebarOpen}
        rowData={selectedJsonRow}
        connectionId={connectionId}
        schema={schema}
        table={table}
      />
    </div>
  );
}
