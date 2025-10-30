import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  ColumnResizeMode,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Copy, FileJson, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResultCell } from './ResultCell';
import { JsonViewerDialog } from './JsonViewerDialog';
import { exportToCsv, exportToJson, copyToClipboard } from '@/lib/export';
import type { QueryResult } from '@/types/query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ResultsGridProps {
  result: QueryResult | null;
  onLoadMore?: () => void;
}

export function ResultsGrid({ result, onLoadMore }: ResultsGridProps) {
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [selectedJsonValue, setSelectedJsonValue] = useState<any>(null);
  const { toast } = useToast();

  // Create columns from result fields
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (!result || result.fields.length === 0) return [];

    return result.fields.map((field) => ({
      accessorKey: field.name,
      header: () => (
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <span className="font-semibold text-xs">{field.name}</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            {field.typeName}
          </span>
        </div>
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <ResultCell
            value={value}
            onExpand={(val) => {
              setSelectedJsonValue(val);
              setJsonDialogOpen(true);
            }}
          />
        );
      },
      size: 200,
      minSize: 100,
      maxSize: 600,
    }));
  }, [result]);

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const table = useReactTable({
    data: result?.rows || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode,
    enableColumnResizing: true,
  });

  // Virtualization
  const { rows } = table.getRowModel();
  const parentRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 20,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
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
            {table.getHeaderGroups().map((headerGroup) => (
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
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b hover:bg-muted/30 transition-colors',
                    virtualRow.index % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                  )}
                >
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
            <Button onClick={onLoadMore} variant="outline" size="sm">
              Load More Results
            </Button>
          </div>
        )}
      </div>

      {/* JSON viewer dialog */}
      <JsonViewerDialog
        open={jsonDialogOpen}
        onOpenChange={setJsonDialogOpen}
        value={selectedJsonValue}
      />
    </div>
  );
}
