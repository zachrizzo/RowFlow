import { useState, useEffect, useCallback } from 'react';
import { X, Copy, CheckCheck, Loader2, FileJson, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { invoke } from '@tauri-apps/api/core';
import type { ForeignKey } from '@/types/connection';
import type { QueryResult } from '@/types/query';
import { cn } from '@/lib/utils';

export interface JsonSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowData: Record<string, any> | null;
  connectionId: string | null;
  schema: string | null;
  table: string | null;
}

interface ForeignKeyData {
  [key: string]: any;
}

export function JsonSidebar({
  open,
  onOpenChange,
  rowData,
  connectionId,
  schema,
  table,
}: JsonSidebarProps) {
  const [copied, setCopied] = useState(false);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [foreignKeyData, setForeignKeyData] = useState<Record<string, ForeignKeyData>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch foreign keys when schema/table changes
  useEffect(() => {
    if (!connectionId || !schema || !table || !open) {
      setForeignKeys([]);
      setForeignKeyData({});
      return;
    }

    const fetchForeignKeys = async () => {
      try {
        const fks = await invoke<ForeignKey[]>('get_foreign_keys', {
          connectionId,
          schema,
          table,
        });
        setForeignKeys(fks);
      } catch (error) {
        console.error('Failed to fetch foreign keys:', error);
        setForeignKeys([]);
      }
    };

    fetchForeignKeys();
  }, [connectionId, schema, table, open]);

  // Fetch foreign key data when row data changes
  useEffect(() => {
    if (!connectionId || !schema || !table || !rowData || !open || foreignKeys.length === 0) {
      setForeignKeyData({});
      return;
    }

    const fetchForeignKeyData = async () => {
      const currentRowData = rowData;
      if (!currentRowData) return;
      setLoading(true);
      const newForeignKeyData: Record<string, ForeignKeyData> = {};

      try {
        await Promise.all(
          foreignKeys.map(async (fk) => {
            try {
              // Build the query with proper quoting
              const quotedSchema = `"${fk.foreignSchema.replace(/"/g, '""')}"`;
              const quotedTable = `"${fk.foreignTable.replace(/"/g, '""')}"`;
              
              // Build WHERE clause with proper quoting and escaping
              const conditions = fk.columns.map((col, idx) => {
                const value = currentRowData[col];
                const foreignColumn = fk.foreignColumns[idx];

                if (!foreignColumn) {
                  return 'TRUE';
                }

                const quotedCol = `"${foreignColumn.replace(/"/g, '""')}"`;
                
                if (value === null || value === undefined) {
                  return `${quotedCol} IS NULL`;
                }
                
                if (typeof value === 'string') {
                  const escapedValue = value.replace(/'/g, "''");
                  return `${quotedCol} = '${escapedValue}'`;
                }
                
                return `${quotedCol} = ${value}`;
              });

              const whereClause = conditions.join(' AND ');
              const query = `SELECT * FROM ${quotedSchema}.${quotedTable} WHERE ${whereClause} LIMIT 1`;

              const result = await invoke<QueryResult>('execute_query', {
                connectionId,
                sql: query,
                params: [],
              });

              const firstRow = result?.rows?.[0];
              if (firstRow) {
                newForeignKeyData[fk.name] = firstRow as ForeignKeyData;
              }
            } catch (error) {
              console.error(`Failed to fetch foreign key data for ${fk.name}:`, error);
            }
          })
        );

        setForeignKeyData(newForeignKeyData);
      } catch (error) {
        console.error('Failed to fetch foreign key data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchForeignKeyData();
  }, [connectionId, schema, table, rowData, foreignKeys, open]);

  const buildJsonData = useCallback(() => {
    if (!rowData) return null;

    const jsonData: Record<string, any> = { ...rowData };

    // Add foreign key data as nested objects
    // Group by foreign table name (in case multiple FKs point to same table)
    const fkDataByTable: Record<string, any> = {};
    
    foreignKeys.forEach((fk) => {
      if (foreignKeyData[fk.name]) {
        const tableKey = `${fk.foreignSchema}.${fk.foreignTable}`;
        // If multiple FKs point to same table, merge them
        if (fkDataByTable[tableKey]) {
          fkDataByTable[tableKey] = {
            ...fkDataByTable[tableKey],
            ...foreignKeyData[fk.name],
          };
        } else {
          fkDataByTable[tableKey] = foreignKeyData[fk.name];
        }
      }
    });

    // Add foreign key data with descriptive keys
    // Use the table name as key (schema.table format)
    Object.entries(fkDataByTable).forEach(([tableKey, data]) => {
      jsonData[tableKey] = data;
    });

    return jsonData;
  }, [rowData, foreignKeys, foreignKeyData]);

  const jsonData = buildJsonData();
  const formattedJson = jsonData ? JSON.stringify(jsonData, null, 2) : '';

  const handleCopy = async () => {
    if (!formattedJson) return;

    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied',
        description: 'JSON copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy JSON',
        variant: 'destructive',
      });
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 top-12"
        onClick={() => onOpenChange(false)}
      />

      {/* Sidebar */}
      <div
        className={cn(
          'fixed right-0 top-12 bottom-0 w-[500px] bg-card border-l shadow-lg z-50',
          'flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            <div>
              <h2 className="font-semibold text-sm">JSON Sidebar</h2>
              <p className="text-xs text-muted-foreground">
                View any database row as clean, structured JSON
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              disabled={!formattedJson}
              className="gap-2"
            >
              {copied ? (
                <>
                  <CheckCheck className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading foreign key data...</p>
              </div>
            </div>
          ) : jsonData ? (
            <div className="space-y-4">
              {/* Info banner */}
              {foreignKeys.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-blue-600 dark:text-blue-400 mb-1">
                        Foreign Keys Detected
                      </p>
                      <p className="text-muted-foreground mb-2">
                        Related data from foreign tables is shown as nested objects.
                      </p>
                      <button
                        className="text-blue-600 dark:text-blue-400 hover:underline text-[10px] font-medium"
                        onClick={() => {
                          // Could open a help dialog or scroll to explanation
                          toast({
                            title: 'Foreign Keys',
                            description: 'Foreign key relationships are automatically fetched and displayed as nested objects using the format "schema.table".',
                          });
                        }}
                      >
                        Learn more &gt;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* JSON Display */}
              <pre className="bg-muted/30 rounded-md p-4 text-xs font-mono overflow-x-auto">
                <code className="language-json">
                  <JsonHighlight json={jsonData} />
                </code>
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <FileJson className="h-12 w-12 mb-4 opacity-20 mx-auto" />
                <p className="text-sm">No row selected</p>
                <p className="text-xs mt-1">Click on a row to view its JSON</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// JSON syntax highlighter
function JsonHighlight({ json }: { json: any }) {
  const formatted = JSON.stringify(json, null, 2);

  // Enhanced regex-based syntax highlighting
  const highlighted = formatted
    .replace(
      /"([^"]+)":/g,
      '<span class="text-blue-400 dark:text-blue-300">"$1"</span>:'
    )
    .replace(
      /: "([^"]*)"/g,
      ': <span class="text-green-400 dark:text-green-300">"$1"</span>'
    )
    .replace(
      /: (\d+\.?\d*)/g,
      ': <span class="text-orange-400 dark:text-orange-300">$1</span>'
    )
    .replace(
      /: (true|false)/g,
      ': <span class="text-purple-400 dark:text-purple-300">$1</span>'
    )
    .replace(
      /: null/g,
      ': <span class="text-muted-foreground italic">null</span>'
    )
    .replace(
      /(\{|\})/g,
      '<span class="text-foreground font-bold">$1</span>'
    )
    .replace(
      /(\[|\])/g,
      '<span class="text-foreground font-bold">$1</span>'
    );

  return <div dangerouslySetInnerHTML={{ __html: highlighted }} />;
}
