import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, PlusCircle, Trash2, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { checkAndPromptForMissingModels, CHAT_MODEL } from '@/lib/modelCheck';
import type { Column, InsertRowRequest } from '@/types/connection';
import type { GenerateTestDataResponse, OllamaStatus } from '@/types/ai';

type RowEditor = {
  id: string;
  value: string;
  error?: string;
  source: 'ai' | 'manual';
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

const makeEditorId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

interface GenerateTestDataDialogProps {
  open: boolean;
  schema: string;
  table: string;
  connectionId: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}

const DEFAULT_ROW_COUNT = '5';

const createRowTemplate = (columns: Column[]): Record<string, unknown> => {
  const template: Record<string, unknown> = {};
  columns.forEach((column) => {
    template[column.name] = column.isNullable ? null : guessValueForColumn(column.dataType);
  });
  return template;
};

const guessValueForColumn = (dataType: string): unknown => {
  const normalized = dataType.toLowerCase();
  if (normalized.includes('array') || normalized.endsWith('[]')) {
    return [];
  }
  if (normalized.includes('int') || normalized.includes('numeric') || normalized.includes('decimal')) {
    return 0;
  }
  if (normalized.includes('bool')) {
    return false;
  }
  if (normalized.includes('timestamp')) {
    return new Date().toISOString();
  }
  if (normalized.includes('date')) {
    return new Date().toISOString().split('T')[0];
  }
  if (normalized.includes('time')) {
    return new Date().toISOString().split('T')[1]?.replace('Z', '') ?? '00:00:00';
  }
  if (normalized.includes('json')) {
    return {};
  }
  if (normalized.includes('char') || normalized.includes('text')) {
    return '';
  }
  return null;
};

export function GenerateTestDataDialog({
  open,
  schema,
  table,
  connectionId,
  onOpenChange,
  onOpenSettings,
}: GenerateTestDataDialogProps) {
  const { toast } = useToast();
  const [columns, setColumns] = useState<Column[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [rowCount, setRowCount] = useState(DEFAULT_ROW_COUNT);
  const [instructions, setInstructions] = useState('');
  const [templateJson, setTemplateJson] = useState('');
  const [rowEditors, setRowEditors] = useState<RowEditor[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !connectionId) {
      setColumns([]);
      return;
    }

    let cancelled = false;
    setLoadingColumns(true);
    invoke<Column[]>('get_table_columns', {
      connectionId,
      schema,
      table,
    })
      .then((result) => {
        if (!cancelled) {
          setColumns(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[GenerateTestDataDialog] Failed to load columns:', error);
          toast({
            title: 'Failed to load columns',
            description: error instanceof Error ? error.message : 'Unable to fetch columns',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingColumns(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, connectionId, schema, table, toast]);

  useEffect(() => {
    if (!open) {
      setRowCount(DEFAULT_ROW_COUNT);
      setInstructions('');
      setTemplateJson('');
      setRowEditors([]);
      setModelUsed(null);
    }
  }, [open]);

  const addManualRow = useCallback(() => {
    const template = createRowTemplate(columns);
    setRowEditors((prev) => {
      const nextRow: RowEditor = {
        id: makeEditorId(),
        value: JSON.stringify(template, null, 2),
        source: 'manual',
      };
      return [...prev, nextRow];
    });
  }, [columns]);

  const handleGenerate = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before generating data.',
        variant: 'destructive',
      });
      return;
    }

    const parsedRowCount = Number(rowCount);
    if (!Number.isFinite(parsedRowCount) || parsedRowCount < 1) {
      toast({
        title: 'Invalid row count',
        description: 'Enter a row count greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    const modelAvailable = await checkAndPromptForMissingModels(
      { type: 'chat', model: CHAT_MODEL },
      toast,
      onOpenSettings
    );
    if (!modelAvailable) {
      return;
    }

    let parsedTemplate: Record<string, unknown> | Record<string, unknown>[] | undefined;
    if (templateJson.trim().length > 0) {
      try {
        const parsed = JSON.parse(templateJson);
        if (typeof parsed !== 'object') {
          throw new Error('Template must be a JSON object or array of objects.');
        }
        parsedTemplate = parsed as Record<string, unknown> | Record<string, unknown>[];
      } catch (error) {
        toast({
          title: 'Invalid template JSON',
          description: extractErrorMessage(error) || 'Could not parse template JSON.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsGenerating(true);
    try {
      const response = await invoke<GenerateTestDataResponse>('generate_test_data', {
        request: {
          connectionId,
          schema,
          table,
          rowCount: parsedRowCount,
          instructions: instructions.trim() || undefined,
          userTemplate: parsedTemplate,
        },
      });

      const generatedEditors: RowEditor[] = response.rows.map((row) => ({
        id: makeEditorId(),
        value: JSON.stringify(row.values ?? {}, null, 2),
        source: 'ai',
        error: undefined,
      }));

      setRowEditors((prev) => {
        const manualRows = prev.filter((row) => row.source === 'manual');
        return [...manualRows, ...generatedEditors];
      });
      setModelUsed(response.model);
      const missingRows = Math.max(parsedRowCount - generatedEditors.length, 0);
      const generatedLabel = `row${generatedEditors.length === 1 ? '' : 's'}`;
      const description = missingRows > 0
        ? `Generated ${generatedEditors.length} of ${parsedRowCount} requested ${generatedLabel} using ${response.model}. Review and insert when ready.`
        : `Generated ${generatedEditors.length} ${generatedLabel} using ${response.model}. Review and insert when ready.`;

      toast({
        title: missingRows > 0 ? 'Partial generation' : 'Rows prepared',
        description,
      });
    } catch (error) {
      console.error('[GenerateTestDataDialog] Failed to generate rows:', error);
      const message = extractErrorMessage(error);
      const connectionIssue =
        message.includes('error sending request') ||
        message.toLowerCase().includes('connection refused') ||
        message.includes('ECONNREFUSED');

      if (connectionIssue) {
        try {
          const status = await invoke<OllamaStatus>('check_ollama_status');
          if (!status.available) {
            toast({
              title: 'Ollama not reachable',
              description: 'Start the local AI runtime in Settings → AI Models before generating data.',
              variant: 'destructive',
            });
            onOpenSettings?.();
          } else {
            toast({
              title: 'Generation failed',
              description: message || 'Unable to generate test data.',
              variant: 'destructive',
            });
          }
        } catch (statusError) {
          console.warn('[GenerateTestDataDialog] Failed to verify Ollama status:', statusError);
          toast({
            title: 'Generation failed',
            description: message || 'Unable to generate test data.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Generation failed',
          description: message || 'Unable to generate test data.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [connectionId, instructions, onOpenSettings, rowCount, schema, table, templateJson, toast]);

  const handleRowChange = useCallback((id: string, value: string) => {
    setRowEditors((prev) =>
      prev.map((row) => (row.id === id ? { ...row, value, error: undefined } : row))
    );
  }, []);

  const handleRemoveRow = useCallback((id: string) => {
    setRowEditors((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const handleInsertRows = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before inserting data.',
        variant: 'destructive',
      });
      return;
    }

    if (rowEditors.length === 0) {
      toast({
        title: 'No rows to insert',
        description: 'Generate or add rows before inserting.',
        variant: 'destructive',
      });
      return;
    }

    type ParsedRow = { id: string; values: Record<string, unknown> };
    const parsedRows: ParsedRow[] = [];
    const updatedEditors = [...rowEditors];
    for (let index = 0; index < rowEditors.length; index += 1) {
      const editor = rowEditors[index];
      if (!editor) continue;
      try {
        const parsed = JSON.parse(editor.value);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Each row must be a JSON object.');
        }
        parsedRows.push({ id: editor.id, values: parsed as Record<string, unknown> });
        updatedEditors[index] = { ...editor, error: undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON payload.';
        updatedEditors[index] = { ...editor, error: message };
        setRowEditors(updatedEditors);
        toast({
          title: 'Invalid row data',
          description: message,
          variant: 'destructive',
        });
        return;
      }
    }
    setRowEditors(updatedEditors);

    setIsInserting(true);
    let remainingEditors = updatedEditors;
    let insertedCount = 0;
    try {
      for (const parsed of parsedRows) {
        const request: InsertRowRequest = {
          schema,
          tableName: table,
          row: { values: parsed.values },
        };
        try {
          await invoke<number>('insert_table_row', {
            connectionId,
            request,
          });
        } catch (error) {
          const message = extractErrorMessage(error) || 'Unable to insert row.';
          setRowEditors((prev) =>
            prev.map((row) => (row.id === parsed.id ? { ...row, error: message } : row))
          );
          toast({
            title: 'Insert failed',
            description: `Row ${insertedCount + 1} could not be inserted: ${message}`,
            variant: 'destructive',
          });
          return;
        }

        insertedCount += 1;
        remainingEditors = remainingEditors.filter((row) => row.id !== parsed.id);
        setRowEditors(remainingEditors);
      }

      toast({
        title: 'Rows inserted',
        description: `${insertedCount} row${insertedCount === 1 ? '' : 's'} inserted into ${schema}.${table}.`,
      });
      setRowEditors([]);
      onOpenChange(false);
    } catch (error) {
      console.error('[GenerateTestDataDialog] Failed to insert rows:', error);
      const message = extractErrorMessage(error) || 'Unable to insert generated rows.';
      toast({
        title: 'Insert failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsInserting(false);
    }
  }, [connectionId, onOpenChange, rowEditors, schema, table, toast]);

  const columnSummary = useMemo(
    () =>
      columns.map((column) => (
        <div key={column.name} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
          <div className="flex flex-col">
            <span className="font-mono text-xs">{column.name}</span>
                  <span className="text-muted-foreground text-xs">{column.dataType}</span>
              </div>
              <div className="flex items-center gap-1">
            {!column.isNullable && <Badge variant="secondary">Required</Badge>}
            {column.isPrimaryKey && <Badge variant="default">PK</Badge>}
            {column.isUnique && !column.isPrimaryKey && <Badge variant="outline">Unique</Badge>}
              </div>
            </div>
      )),
    [columns]
  );

  const rowsAvailable = rowEditors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Generate Test Data</DialogTitle>
          <DialogDescription>
            Use the local AI model to draft realistic rows for <span className="font-mono">{schema}.{table}</span>.
            Review and edit each row before inserting it into your database.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          {!connectionId ? (
            <Alert>
              <AlertDescription>Connect to a database to use AI-powered test data generation.</AlertDescription>
            </Alert>
          ) : (
          <div className="space-y-6 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="row-count">Row count</Label>
                <Input
                  id="row-count"
                  type="number"
                  min={1}
                  max={25}
                  value={rowCount}
                  onChange={(event) => setRowCount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">You can generate up to 25 rows per request.</p>
              </div>
              <div className="space-y-2">
                <Label>Model status</Label>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{modelUsed ? `Last used: ${modelUsed}` : 'Uses your configured chat model (gemma3:4b).'}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="instructions">Optional guidance</Label>
                <Textarea
                  id="instructions"
                  placeholder="Describe the tone, value ranges, or business rules you want the AI to follow."
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-json">Optional row template (JSON)</Label>
                <Textarea
                  id="template-json"
                  placeholder='{"status": "shipped", "country": "USA"}'
                  value={templateJson}
                  onChange={(event) => setTemplateJson(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Provide a partial row or array of example rows. The model will respect these fields.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || loadingColumns || !connectionId}
              >
                {isGenerating ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate with AI
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={addManualRow} disabled={loadingColumns}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add manual row
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Columns ({columns.length})</span>
                </div>
                {loadingColumns && (
                  <span className="text-xs text-muted-foreground">Loading columns…</span>
                )}
              </div>
              <ScrollArea className="h-40 rounded-md border bg-muted/10 p-2">
                <div className="space-y-2">
                  {columns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No columns found for this table.</p>
                  ) : (
                    columnSummary
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Prepared rows</h3>
                  <p className="text-xs text-muted-foreground">
                    Edit any row before inserting. You can mix AI-generated and manual entries.
                  </p>
                </div>
                {rowsAvailable && (
                  <Badge variant="secondary">{rowEditors.length} ready</Badge>
                )}
              </div>

              {rowEditors.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No rows prepared yet. Generate data with AI or add a manual row to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {rowEditors.map((row, index) => (
                    <div key={row.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Row {index + 1}</span>
                          <Badge variant={row.source === 'ai' ? 'default' : 'outline'}>
                            {row.source === 'ai' ? 'AI' : 'Manual'}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRow(row.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={row.value}
                        onChange={(event) => handleRowChange(row.id, event.target.value)}
                      />
                      {row.error && (
                        <p className="text-xs text-destructive">{row.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Rows are inserted immediately when you click Insert Rows.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isInserting}>
              Cancel
            </Button>
            <Button
              onClick={handleInsertRows}
              disabled={!rowsAvailable || isInserting || !connectionId}
            >
              {isInserting ? 'Inserting…' : 'Insert rows'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
