import { useEffect, useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Square, Zap, Database, Loader2, X, Check, RotateCcw } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SqlEditor } from './SqlEditor';
import { ResultsGrid } from './ResultsGrid';
import { QueryTabs, useQueryTabs } from './QueryTabs';
import { useQueryExecution } from '@/hooks/useQueryExecution';
import { useDatabase } from '@/hooks/useDatabase';
import { DEFAULT_SQL, sanitizeSql, isDefaultSql, quoteIdentifier } from '@/lib/sqlPlaceholders';
import type { QueryResult, QueryTabContext } from '@/types/query';
import { useToast } from '@/hooks/use-toast';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
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

function rowsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!valuesEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function getTableSortKey(context: QueryTabContext | undefined): string | null {
  if (!context || context.type !== 'table') return null;
  return `${context.schema}.${context.table}`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlLiteral(value: any, typeName?: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 'NULL';
    }
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${escapeSqlString(value.toISOString())}'`;
  }

  if (typeof value === 'object') {
    try {
      return `'${escapeSqlString(JSON.stringify(value))}'::jsonb`;
    } catch {
      return `'${escapeSqlString(String(value))}'`;
    }
  }

  const stringValue = String(value);
  const lowerType = typeName?.toLowerCase() ?? '';

  if (lowerType.includes('bool')) {
    if (stringValue.toLowerCase() === 'true') return 'TRUE';
    if (stringValue.toLowerCase() === 'false') return 'FALSE';
  }

  if (
    lowerType.includes('int') ||
    lowerType.includes('numeric') ||
    lowerType.includes('decimal') ||
    lowerType.includes('float') ||
    lowerType.includes('double')
  ) {
    const numeric = Number(stringValue);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric.toString();
    }
  }

  if (lowerType.includes('json')) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return `'${escapeSqlString(JSON.stringify(parsed))}'::jsonb`;
    } catch {
      return `'${escapeSqlString(stringValue)}'::jsonb`;
    }
  }

  return `'${escapeSqlString(stringValue)}'`;
}

export interface InsertSqlOptions {
  execute?: boolean;
  replace?: boolean;
  tabName?: string;
  context?: QueryTabContext;
  stream?: boolean;
  chunkSize?: number;
}

export type InsertSqlHandler = (sql: string, options?: InsertSqlOptions) => Promise<void> | void;

export interface QueryPanelProps {
  onSqlInsert?: (callback: InsertSqlHandler) => void;
  onTableContextChange?: (context: QueryTabContext | undefined) => void;
  tablePreviewLimit?: number;
  editingEnabled?: boolean;
}

const DEFAULT_TABLE_PREVIEW_LIMIT = 100;

export function QueryPanel({
  onSqlInsert,
  onTableContextChange,
  tablePreviewLimit = DEFAULT_TABLE_PREVIEW_LIMIT,
  editingEnabled = false,
}: QueryPanelProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();
  const { toast } = useToast();
  const connectionId = activeConnection?.connectionId || null;
  const isReadOnlyConnection = Boolean(activeConnection?.profile?.readOnly);
  const [currentPrimaryKeys, setCurrentPrimaryKeys] = useState<string[]>([]);
  const [tableSortStates, setTableSortStates] = useState<Record<string, { column: string; direction: 'asc' | 'desc' }>>({});

  // Query tabs management
  const {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    addTab,
    addTableTab,
    closeTab,
    renameTab,
    updateTabSql,
    updateTabExecution,
    updateTabContext,
  } = useQueryTabs();

  const streamingStateRef = useRef<Map<string, { sql: string; chunkSize: number }>>(new Map());
  const primaryKeyCacheRef = useRef<Map<string, string[]>>(new Map());
  const [loadingMoreTabId, setLoadingMoreTabId] = useState<string | null>(null);
  const lastContextRef = useRef<QueryTabContext | undefined>(undefined);
  const [pendingEdits, setPendingEdits] = useState<Map<number, Record<string, any>>>(new Map());
  const [applyingChanges, setApplyingChanges] = useState(false);

  // Query execution
  const { executeQuery, executeQueryStream, cancelQuery, formatQuery, isRunning } = useQueryExecution({
    connectionId,
    onSuccess: (result) => {
      if (activeTabId) {
        updateTabExecution(activeTabId, {
          status: 'success',
          result,
          error: null,
        });
      }
    },
    onError: (error) => {
      if (activeTabId) {
        updateTabExecution(activeTabId, {
          status: 'error',
          error,
          result: null,
        });
      }
    },
  });

  useEffect(() => {
    setPendingEdits(new Map());
  }, [activeTabId]);

  useEffect(() => {
    if (!editingEnabled) {
      setPendingEdits(new Map());
    }
  }, [editingEnabled]);

  // Expose insertSql function via ref (for schema browser integration)
  const insertSql = useCallback<InsertSqlHandler>(
    async (sql, options) => {
      // If this is a table context, create a table tab instead of updating SQL
      if (options?.context?.type === 'table' && options?.execute) {
        const { schema, table } = options.context;
        const chunkSize = options?.chunkSize ?? tablePreviewLimit;

        try {
          // Fetch primary keys to maintain stable ordering for table previews
          let tablePrimaryKeys: string[] = [];
          let sqlToExecute = sql;
          const contextKey = `${schema}.${table}`;
          const existingSort = tableSortStates[contextKey];
          if (connectionId) {
            try {
              tablePrimaryKeys = await invoke<string[]>('get_primary_keys', {
                connectionId,
                schema,
                table,
              });
            } catch (error) {
              console.warn('[QueryPanel] Failed to fetch primary keys for initial table query:', error);
            }

            if (existingSort) {
              sqlToExecute = `SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(existingSort.column)} ${existingSort.direction.toUpperCase()} LIMIT ${chunkSize}`;
            } else if (tablePrimaryKeys.length > 0) {
              const orderByClause = ` ORDER BY ${tablePrimaryKeys.map(pk => quoteIdentifier(pk)).join(', ')}`;
              sqlToExecute = `SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}${orderByClause} LIMIT ${chunkSize}`;
            }
          }

          // Execute query stream to get table data
          const result = await executeQueryStream(sqlToExecute, chunkSize, 0);

          if (result) {
            // addTableTab will handle switching to existing tab or creating new one
            const tabId = addTableTab(schema, table, result, sqlToExecute);

            // Set up streaming state for load more functionality (keep stable order)
            if (tabId) {
              streamingStateRef.current.set(tabId, {
                sql: sqlToExecute,
                chunkSize,
              });
            }
            if (existingSort) {
              setTableSortStates((prev) => {
                if (prev[contextKey] && prev[contextKey].column === existingSort.column && prev[contextKey].direction === existingSort.direction) {
                  return prev;
                }
                return { ...prev, [contextKey]: existingSort };
              });
            } else {
              setTableSortStates((prev) => {
                if (!prev[contextKey]) return prev;
                const next = { ...prev };
                delete next[contextKey];
                return next;
              });
            }
            onTableContextChange?.(options.context);
            lastContextRef.current = options.context;
          }
        } catch (error) {
          console.error('[QueryPanel] Error loading table data:', error);
          // For now, just log the error - user can retry by selecting the table again
        }
        return;
      }

      // For SQL tabs, proceed with normal SQL insertion
      if (!activeTab || activeTab.viewType === 'table') {
        // Switch to or create a SQL tab
        const sqlTab = tabs.find(t => t.viewType === 'sql');
        if (sqlTab) {
          setActiveTabId(sqlTab.id);
        } else {
          addTab();
          // Wait for tab to be created, then update
          setTimeout(() => {
            const newSqlTab = tabs.find(t => t.viewType === 'sql');
            if (newSqlTab) {
              setActiveTabId(newSqlTab.id);
            }
          }, 0);
        }
        return;
      }

      const existingSql = sanitizeSql(activeTab.sql);
      const insertSqlText = sanitizeSql(sql).trim();

      if (!insertSqlText) {
        return;
      }

      const shouldReplace =
        options?.replace ?? (!existingSql || isDefaultSql(existingSql));
      const baseSql = shouldReplace ? '' : existingSql.trimEnd();

      const combinedSql = [baseSql, insertSqlText]
        .filter(Boolean)
        .join('\n')
        .trim();

      const finalSql = combinedSql.length > 0 ? combinedSql : DEFAULT_SQL;

      updateTabSql(activeTab.id, finalSql);

      if (options?.tabName) {
        renameTab(activeTab.id, options.tabName);
      }

      if (options?.context) {
        updateTabContext(activeTab.id, options.context);
        onTableContextChange?.(options.context);
        lastContextRef.current = options.context;
      }

      if (options?.execute && activeTabId) {
        streamingStateRef.current.delete(activeTabId);

        updateTabExecution(activeTabId, {
          status: 'running',
          result: null,
          error: null,
        });
        if (activeTab.context) {
          updateTabContext(activeTab.id, undefined);
        }
        onTableContextChange?.(undefined);
        lastContextRef.current = undefined;
        executeQuery(finalSql);
      }
    },
    [
      activeTab,
      activeTabId,
      tabs,
      setActiveTabId,
      addTab,
      addTableTab,
      executeQuery,
      executeQueryStream,
      onTableContextChange,
      renameTab,
      tablePreviewLimit,
      updateTabContext,
      updateTabExecution,
      updateTabSql,
    ]
  );

  useEffect(() => {
    if (!onTableContextChange) return;

    const currentContext = activeTab?.context;
    const previousContext = lastContextRef.current;

    const contextsEqual = (() => {
      if (previousContext === currentContext) return true;
      if (!previousContext || !currentContext) return previousContext === currentContext;
      if (previousContext.type !== currentContext.type) return false;
      if (previousContext.type === 'table') {
        return (
          previousContext.schema === currentContext.schema &&
          previousContext.table === currentContext.table
        );
      }
      return false;
    })();

    if (!contextsEqual) {
      lastContextRef.current = currentContext;
      onTableContextChange(currentContext);
    }
  }, [activeTab?.context, onTableContextChange]);

  useEffect(() => {
    setPendingEdits(new Map());
  }, [activeTab?.execution.result]);

  const handleLoadMore = useCallback(async () => {
    if (!activeTab || !activeTabId) return;

    if (pendingEdits.size > 0) {
      toast({
        title: 'Pending edits',
        description: 'Apply or discard your changes before loading more rows.',
      });
      return;
    }

    if (applyingChanges) {
      return;
    }

    const streamingInfo = streamingStateRef.current.get(activeTabId);
    if (!streamingInfo) return;

    const currentResult = activeTab.execution.result;
    const offset = currentResult?.rowCount ?? 0;

    setLoadingMoreTabId(activeTabId);

    updateTabExecution(activeTabId, {
      status: 'running',
      result: currentResult || null,
      error: null,
    });

    const aggregated: QueryResult | null = await executeQueryStream(
      streamingInfo.sql,
      streamingInfo.chunkSize,
      offset
    );

    setLoadingMoreTabId(null);

    if (!aggregated) {
      streamingStateRef.current.delete(activeTabId);
    } else if (!aggregated.hasMore) {
      streamingStateRef.current.delete(activeTabId);
    }
  }, [activeTab, activeTabId, pendingEdits, applyingChanges, executeQueryStream, updateTabExecution, toast]);

  const handleSortChange = useCallback(
    async (columnId: string, direction: 'asc' | 'desc' | null) => {
      if (!activeTab || !activeTabId) return;
      const context = lastContextRef.current ?? activeTab.context;
      if (!context || context.type !== 'table') return;

      if (!connectionId) {
        toast({
          title: 'No connection',
          description: 'Connect to a database before sorting.',
          variant: 'destructive',
        });
        return;
      }

      if (pendingEdits.size > 0) {
        toast({
          title: 'Apply or discard edits first',
          description: 'Sorting is disabled while there are pending edits.',
          variant: 'destructive',
        });
        return;
      }

      const sortKey = getTableSortKey(context);
      if (!sortKey) return;

      const streamingInfo = streamingStateRef.current.get(activeTabId);
      const chunkSize = streamingInfo?.chunkSize ?? tablePreviewLimit;

      let orderByClause = '';
      if (direction) {
        orderByClause = ` ORDER BY ${quoteIdentifier(columnId)} ${direction.toUpperCase()}`;
      } else if (currentPrimaryKeys.length > 0) {
        orderByClause = ` ORDER BY ${currentPrimaryKeys.map((pk) => quoteIdentifier(pk)).join(', ')}`;
      }

      const sql = `SELECT * FROM ${quoteIdentifier(context.schema)}.${quoteIdentifier(context.table)}${orderByClause} LIMIT ${chunkSize}`;

      updateTabExecution(activeTabId, { status: 'running' });

      try {
        const result = await executeQueryStream(sql, chunkSize, 0);
        if (!result) return;

        streamingStateRef.current.set(activeTabId, {
          sql,
          chunkSize,
        });

        setTableSortStates((prev) => {
          if (direction) {
            const next = { ...prev, [sortKey]: { column: columnId, direction } };
            return next;
          }
          if (!prev[sortKey]) {
            return prev;
          }
          const next = { ...prev };
          delete next[sortKey];
          return next;
        });

        updateTabExecution(activeTabId, {
          status: 'success',
          result,
          error: null,
          duration: result.executionTime,
        });
      } catch (error) {
        console.error('[QueryPanel] Failed to sort results:', error);
        toast({
          title: 'Sort failed',
          description: error instanceof Error ? error.message : 'Unable to sort results',
          variant: 'destructive',
        });
        updateTabExecution(activeTabId, {
          status: 'error',
          error,
        });
      }
    },
    [
      activeTab,
      activeTabId,
      connectionId,
      currentPrimaryKeys,
      executeQueryStream,
      pendingEdits,
      tablePreviewLimit,
      toast,
      updateTabExecution,
    ],
  );

  // Call onSqlInsert callback when provided
  // Use a ref to track the latest insertSql to prevent circular dependencies
  const insertSqlRef = useRef(insertSql);
  insertSqlRef.current = insertSql;

  // Create a stable wrapper using useCallback
  const stableInsertSql = useCallback<InsertSqlHandler>(
    (sql, options) => {
      return insertSqlRef.current(sql, options);
    },
    []
  );

  useEffect(() => {
    if (onSqlInsert) {
      // Pass the stable wrapper function
      onSqlInsert(stableInsertSql);
    }
  }, [onSqlInsert, stableInsertSql]);

  const ensurePrimaryKeys = useCallback(async (): Promise<string[]> => {
    const context = lastContextRef.current ?? activeTab?.context;
    if (!editingEnabled || !context || context.type !== 'table' || !connectionId) {
      setCurrentPrimaryKeys((prev) => (prev.length ? [] : prev));
      return [];
    }

    const cacheKey = `${context.schema}.${context.table}`;
    const cached = primaryKeyCacheRef.current.get(cacheKey);
    if (cached) {
      setCurrentPrimaryKeys((prev) => (arraysEqual(prev, cached) ? prev : [...cached]));
      return cached;
    }

    try {
      const keys = await invoke<string[]>('get_primary_keys', {
        connectionId,
        schema: context.schema,
        table: context.table,
      });
      primaryKeyCacheRef.current.set(cacheKey, keys);
      setCurrentPrimaryKeys((prev) => (arraysEqual(prev, keys) ? prev : [...keys]));
      return keys;
    } catch (error) {
      console.error('[QueryPanel] Failed to fetch primary keys:', error);
      toast({
        title: 'Failed to load primary keys',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to determine the primary key for this table.',
        variant: 'destructive',
      });
      setCurrentPrimaryKeys((prev) => (prev.length ? [] : prev));
      return [];
    }
  }, [activeTab?.context, connectionId, editingEnabled, toast]);

  useEffect(() => {
    if (!editingEnabled) return;
    const context = lastContextRef.current ?? activeTab?.context;
    if (context?.type === 'table') {
      void ensurePrimaryKeys();
    }
  }, [activeTab?.context, ensurePrimaryKeys, editingEnabled]);

  useEffect(() => {
    if (!editingEnabled) {
      setCurrentPrimaryKeys([]);
    }
  }, [editingEnabled]);

  const handleCellEdit = useCallback(
    (rowIndex: number, columnId: string, newValue: any, _originalValue?: any) => {
      if (!editingEnabled || isReadOnlyConnection) return;
      if (!activeTab?.execution.result) return;

      if (!currentPrimaryKeys.length) {
        toast({
          title: 'Cannot edit rows',
          description: 'Primary key information is unavailable for this table.',
        });
        return;
      }

      setPendingEdits((prev) => {
        const originalRow = activeTab.execution.result?.rows[rowIndex];
        if (!originalRow) {
          return prev;
        }

        const hasAllPrimaryKeys = currentPrimaryKeys.every((pk) => {
          const value = originalRow[pk];
          return value !== null && value !== undefined;
        });

        if (!hasAllPrimaryKeys) {
          toast({
            title: 'Row not editable',
            description: 'Rows with NULL primary key values cannot be edited.',
          });
          return prev;
        }

        const next = new Map(prev);
        const existing = next.get(rowIndex);
        const baseRow = existing ? { ...existing } : { ...originalRow };
        baseRow[columnId] = newValue;

        if (rowsEqual(baseRow, originalRow)) {
          next.delete(rowIndex);
        } else {
          next.set(rowIndex, baseRow);
        }

        return next;
      });
    },
    [activeTab, currentPrimaryKeys, editingEnabled, isReadOnlyConnection, toast]
  );

  const handleDiscardChanges = useCallback(() => {
    if (pendingEdits.size === 0) return;
    setPendingEdits(new Map());
    toast({
      title: 'Changes discarded',
      description: 'All pending edits were reverted.',
    });
  }, [pendingEdits.size, toast]);

  const handleApplyChanges = useCallback(async () => {
    const context = lastContextRef.current ?? activeTab?.context;
    if (!editingEnabled || isReadOnlyConnection) return;
    if (!context || context.type !== 'table') {
      toast({
        title: 'No table selected',
        description: 'Preview a table before applying edits.',
        variant: 'destructive',
      });
      return;
    }

    if (!activeTabId || !activeTab?.execution.result) {
      return;
    }

    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before applying changes.',
        variant: 'destructive',
      });
      return;
    }

    if (pendingEdits.size === 0) {
      toast({
        title: 'No pending changes',
        description: 'Modify a cell before applying changes.',
      });
      return;
    }

    const primaryKeys = await ensurePrimaryKeys();
    if (!primaryKeys || primaryKeys.length === 0) {
      toast({
        title: 'Missing primary key',
        description: 'This table does not have a primary key; automatic updates are disabled.',
        variant: 'destructive',
      });
      return;
    }

    const result = activeTab.execution.result;
    const fieldTypeMap = new Map(result.fields.map((field) => [field.name, field.typeName]));

    const updates: { sql: string; rowIndex: number; updatedRow: Record<string, any> }[] = [];

    let skippedMissingKey = 0;

    pendingEdits.forEach((updatedRow, rowIndex) => {
      const originalRow = result.rows[rowIndex];
      if (!originalRow) return;

      const hasAllPrimaryKeys = primaryKeys.every((columnId) => {
        const value = originalRow[columnId];
        return value !== undefined && value !== null;
      });

      if (!hasAllPrimaryKeys) {
        skippedMissingKey += 1;
        return;
      }

      const diffColumns = Object.keys(updatedRow).filter(
        (columnId) => !valuesEqual(updatedRow[columnId], originalRow[columnId])
      );

      if (diffColumns.length === 0) {
        return;
      }

      const setClauses = diffColumns.map((columnId) => {
        const literal = toSqlLiteral(updatedRow[columnId], fieldTypeMap.get(columnId));
        return `${quoteIdentifier(columnId)} = ${literal}`;
      });

      if (setClauses.length === 0) {
        return;
      }

      const whereClauses = primaryKeys.map((columnId) => {
        const originalValue = originalRow[columnId];
        if (originalValue === null || originalValue === undefined) {
          return `${quoteIdentifier(columnId)} IS NULL`;
        }
        const literal = toSqlLiteral(originalValue, fieldTypeMap.get(columnId));
        return `${quoteIdentifier(columnId)} = ${literal}`;
      });

      if (whereClauses.length === 0) {
        return;
      }

      const sql = `UPDATE ${quoteIdentifier(context.schema)}.${quoteIdentifier(context.table)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')};`;

      updates.push({
        sql,
        rowIndex,
        updatedRow: { ...originalRow, ...updatedRow },
      });
    });

    if (updates.length === 0) {
      const description = skippedMissingKey > 0
        ? 'Rows missing primary key values cannot be edited.'
        : 'All edited values match the original.';
      toast({
        title: 'No changes to apply',
        description,
      });
      setPendingEdits(new Map());
      return;
    }

    setApplyingChanges(true);

    try {
      let zeroAffected = 0;
      let executedUpdates = 0;
      for (const update of updates) {
        const affected = await invoke<number>('execute_update', {
          connectionId,
          sql: update.sql,
        });

        if (affected === 0) {
          zeroAffected += 1;
          console.warn('[QueryPanel] Update affected zero rows', {
            rowIndex: update.rowIndex,
            sql: update.sql,
          });
        } else {
          executedUpdates += 1;
        }
      }

      let refreshed: QueryResult | null = null;
      if (executedUpdates > 0) {
        const streamingInfo = streamingStateRef.current.get(activeTabId);
        const context = lastContextRef.current ?? activeTab?.context;

        // Build refresh SQL with ORDER BY to maintain consistent row order
        let refreshSql = streamingInfo?.sql ?? activeTab.sql;
        if (context && context.type === 'table') {
          const sortKey = getTableSortKey(context);
          const sortState = sortKey ? tableSortStates[sortKey] : undefined;
          let orderByClause = '';
          if (sortState) {
            orderByClause = ` ORDER BY ${quoteIdentifier(sortState.column)} ${sortState.direction.toUpperCase()}`;
          } else if (primaryKeys.length > 0) {
            orderByClause = ` ORDER BY ${primaryKeys.map(pk => quoteIdentifier(pk)).join(', ')}`;
          }
          refreshSql = `SELECT * FROM ${quoteIdentifier(context.schema)}.${quoteIdentifier(context.table)}${orderByClause} LIMIT ${tablePreviewLimit}`;
        }

        const refreshChunk = streamingInfo?.chunkSize ?? tablePreviewLimit;

        refreshed = refreshSql
          ? await executeQueryStream(refreshSql, refreshChunk, 0)
          : null;

        if (refreshed && refreshSql) {
          streamingStateRef.current.set(activeTabId, {
            sql: refreshSql,
            chunkSize: refreshChunk,
          });
        }
      }

      if (!refreshed) {
        const newRows = [...result.rows];
        updates.forEach(({ rowIndex, updatedRow }) => {
          newRows[rowIndex] = updatedRow;
        });

        updateTabExecution(activeTabId, {
          status: 'success',
          result: {
            ...result,
            rows: newRows,
          },
          error: null,
        });
      } else {
        // Update UI with refreshed data from database
        updateTabExecution(activeTabId, {
          status: 'success',
          result: refreshed,
          error: null,
          duration: refreshed.executionTime,
        });
      }

      setPendingEdits(new Map());

      const appliedCount = updates.length - zeroAffected;
      if (appliedCount === 0 && zeroAffected === 0 && skippedMissingKey > 0) {
        toast({
          title: 'No rows updated',
          description: `${skippedMissingKey} row${skippedMissingKey === 1 ? '' : 's'} skipped because required primary key values are NULL.`,
        });
      } else if (zeroAffected > 0 || skippedMissingKey > 0) {
        const messageParts: string[] = [];
        if (appliedCount > 0) {
          messageParts.push(`${appliedCount} row${appliedCount === 1 ? '' : 's'} updated.`);
        }
        if (zeroAffected > 0) {
          messageParts.push(`${zeroAffected} update${zeroAffected === 1 ? ' was' : 's were'} skipped (row unchanged or missing).`);
        }
        if (skippedMissingKey > 0) {
          messageParts.push(`${skippedMissingKey} row${skippedMissingKey === 1 ? '' : 's'} ignored due to NULL primary key values.`);
        }
        toast({
          title: 'Applied with warnings',
          description: messageParts.join(' '),
        });
      } else {
        toast({
          title: 'Changes applied',
          description: `${updates.length} row${updates.length === 1 ? '' : 's'} updated successfully.`,
        });
      }
    } catch (error) {
      console.error('[QueryPanel] Failed to apply changes:', error);
      toast({
        title: 'Apply failed',
        description: error instanceof Error ? error.message : 'Failed to apply changes',
        variant: 'destructive',
      });
    } finally {
      setApplyingChanges(false);
    }
  }, [
    activeTab,
    activeTabId,
    connectionId,
    editingEnabled,
    ensurePrimaryKeys,
    executeQueryStream,
    isReadOnlyConnection,
    pendingEdits,
    tableSortStates,
    tablePreviewLimit,
    toast,
    updateTabExecution,
  ]);

  // Handle query execution
  const handleExecute = useCallback(() => {
    if (!activeTab || !activeTab.sql.trim()) return;

    // Update tab state to running
    if (activeTabId) {
      streamingStateRef.current.delete(activeTabId);
      updateTabExecution(activeTabId, {
        status: 'running',
        result: null,
        error: null,
      });
    }

    executeQuery(activeTab.sql);
  }, [activeTab, activeTabId, executeQuery, updateTabExecution]);

  // Handle query cancellation
  const handleCancel = useCallback(() => {
    cancelQuery();
    if (activeTabId) {
      streamingStateRef.current.delete(activeTabId);
      updateTabExecution(activeTabId, {
        status: 'idle',
      });
      setLoadingMoreTabId((current) => (current === activeTabId ? null : current));
    }
  }, [activeTabId, cancelQuery, updateTabExecution]);

  // Handle SQL formatting
  const handleFormat = useCallback(() => {
    if (!activeTab) return;
    const formatted = formatQuery(activeTab.sql);
    updateTabSql(activeTab.id, formatted);
  }, [activeTab, formatQuery, updateTabSql]);

  // Handle clearing the query
  const handleClear = useCallback(() => {
    if (!activeTab) return;
    updateTabSql(activeTab.id, DEFAULT_SQL);
    if (activeTab.context) {
      updateTabContext(activeTab.id, undefined);
      onTableContextChange?.(undefined);
      lastContextRef.current = undefined;
    }
    streamingStateRef.current.delete(activeTab.id);
  }, [activeTab, onTableContextChange, updateTabContext, updateTabSql]);

  // Handle SQL editor changes
  const handleSqlChange = useCallback(
    (sql: string) => {
      if (activeTab) {
        updateTabSql(activeTab.id, sql);
        if (activeTab.context) {
          updateTabContext(activeTab.id, undefined);
          onTableContextChange?.(undefined);
          lastContextRef.current = undefined;
        }
        streamingStateRef.current.delete(activeTab.id);
      }
    },
    [activeTab, onTableContextChange, updateTabContext, updateTabSql]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + T: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      // Cmd/Ctrl + W: Close tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, addTab, closeTab]);

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>No query tabs open</p>
          <Button onClick={addTab} className="mt-4">
            Create New Tab
          </Button>
        </div>
      </div>
    );
  }

  const execution = activeTab.execution;
  const hasConnection = !!connectionId;
  const activeContext = activeTab.context;
  const isTableTab = activeTab.viewType === 'table';
  const isSqlTab = activeTab.viewType === 'sql' || !activeTab.viewType; // Default to SQL for backwards compatibility
  const editingActive =
    editingEnabled &&
    !isReadOnlyConnection &&
    activeContext?.type === 'table' &&
    Boolean(execution.result) &&
    currentPrimaryKeys.length > 0;
  const pendingEditCount = pendingEdits.size;
  const editingDisabledReason = (() => {
    if (!editingEnabled) return null;
    if (isReadOnlyConnection) return 'Editing disabled: connection is read-only.';
    if (!activeContext || activeContext.type !== 'table') return 'Editing is available when previewing a table result.';
    if (!execution.result) return 'Run a table preview to edit rows.';
    if (!currentPrimaryKeys.length) return 'Unable to determine primary key columns for this table.';
    return null;
  })();
  const sortKey = getTableSortKey(activeContext ?? lastContextRef.current);
  const activeSortState = sortKey ? tableSortStates[sortKey] : undefined;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tabs */}
      <QueryTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        onTabClose={closeTab}
        onTabAdd={addTab}
        onTabRename={renameTab}
      />

      {/* Toolbar - only show for SQL tabs */}
      {isSqlTab && (
        <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/20">
        <div className="flex items-center gap-2">
          {/* Execute/Cancel button */}
          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleCancel}>
              <Square className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={handleExecute}
              disabled={!hasConnection || !activeTab.sql.trim()}
            >
              <Play className="h-4 w-4 mr-1" />
              Run Query
            </Button>
          )}

          {/* Format button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleFormat}
            disabled={!activeTab.sql.trim()}
            title="Format SQL (⌥⌘F)"
          >
            <Zap className="h-4 w-4 mr-1" />
            Format
          </Button>

          {/* Clear button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={!activeTab.sql.trim() || isDefaultSql(activeTab.sql)}
            title="Clear Query"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>

          {/* Connection indicator */}
          {hasConnection ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-4">
              <Database className="h-3 w-3 text-green-500" />
              <span>
                {activeConnection?.connectionInfo?.databaseName || 'Connected'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-4">
              <Database className="h-3 w-3 text-red-500" />
              <span>No connection</span>
            </div>
          )}
        </div>

        {/* Execution info */}
        {execution.status === 'success' && execution.result && (
          <div className="text-xs text-muted-foreground">
            {execution.result.rowCount} rows in {execution.result.executionTime.toFixed(2)}ms
          </div>
        )}
        {execution.status === 'running' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Executing query...
          </div>
        )}
      </div>
      )}

      {/* Table tab: Show only ResultsGrid */}
      {isTableTab ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {execution.status === 'error' && execution.error ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertDescription className="text-sm font-mono whitespace-pre-wrap">
                  {execution.error}
                </AlertDescription>
              </Alert>
            </div>
          ) : execution.result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Table Preview</span>
                  {activeContext?.type === 'table' && (
                    <Badge variant="outline" className="text-[11px] font-mono px-2 py-0.5">
                      {activeContext.schema}.{activeContext.table}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>
                      <span className="font-semibold text-foreground">
                        {execution.result.rowCount.toLocaleString()}
                      </span>{' '}
                      rows loaded
                    </span>
                    <span>
                      in{' '}
                      <span className="font-semibold text-foreground">
                        {execution.result.executionTime.toFixed(2)}
                      </span>
                      ms
                    </span>
                    {execution.result.hasMore && (
                      <span className="flex items-center gap-1 text-orange-500">
                        {loadingMoreTabId === activeTabId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        More available
                      </span>
                    )}
                  </div>
                  {editingEnabled && (
                    editingActive ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-primary/40 text-primary bg-primary/10">
                          Editing
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {pendingEditCount > 0
                            ? `${pendingEditCount} row${pendingEditCount === 1 ? '' : 's'} modified`
                            : 'No pending changes'}
                        </span>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleApplyChanges}
                          disabled={pendingEditCount === 0 || applyingChanges}
                          className="gap-2"
                        >
                          {applyingChanges ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDiscardChanges}
                          disabled={pendingEditCount === 0 || applyingChanges}
                          className="gap-2"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Discard
                        </Button>
                      </div>
                    ) : (
                      editingDisabledReason && (
                        <span className="text-xs text-muted-foreground">
                          {editingDisabledReason}
                        </span>
                      )
                    )
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <ResultsGrid
                  result={execution.result}
                  onLoadMore={
                    execution.result.hasMore && pendingEditCount === 0 && !applyingChanges
                      ? handleLoadMore
                      : undefined
                  }
                  loadingMore={loadingMoreTabId === activeTabId}
                  editable={editingActive}
                  editedRows={pendingEdits}
                  onCellEdit={editingActive ? handleCellEdit : undefined}
                  connectionId={activeConnection?.connectionId || null}
                  schema={activeContext?.type === 'table' ? activeContext.schema : null}
                  table={activeContext?.type === 'table' ? activeContext.table : null}
                  primaryKeys={currentPrimaryKeys}
                  sortColumn={activeSortState?.column ?? null}
                  sortDirection={activeSortState?.direction ?? null}
                  onSortChange={handleSortChange}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Loader2 className="h-12 w-12 mb-4 animate-spin mx-auto text-primary" />
                <p className="text-sm">Loading table data...</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* SQL tab: Show split panel with Editor + Results */
        <PanelGroup direction="vertical" className="flex-1">
        {/* SQL Editor Panel */}
        <Panel defaultSize={50} minSize={20}>
          <div className="h-full">
            <SqlEditor
              value={activeTab.sql || ''}
              onChange={handleSqlChange}
              onExecute={handleExecute}
              onFormat={handleFormat}
              readOnly={isRunning}
            />
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

        {/* Results Panel */}
        <Panel defaultSize={50} minSize={20}>
          <div className="h-full flex flex-col">
            {/* Results header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 bg-muted/50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Results</span>
                {activeContext?.type === 'table' && (
                  <Badge variant="outline" className="text-[11px] font-mono px-2 py-0.5">
                    {activeContext.schema}.{activeContext.table}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
                {execution.result && (
                  <div className="flex items-center gap-3">
                    <span>
                      <span className="font-semibold text-foreground">
                        {execution.result.rowCount.toLocaleString()}
                      </span>{' '}
                      rows loaded
                    </span>
                    <span>
                      in{' '}
                      <span className="font-semibold text-foreground">
                        {execution.result.executionTime.toFixed(2)}
                      </span>
                      ms
                    </span>
                    {execution.result.hasMore && (
                      <span className="flex items-center gap-1 text-orange-500">
                        {loadingMoreTabId === activeTabId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        More available
                      </span>
                    )}
                  </div>
                )}

                {editingEnabled && (
                  editingActive ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-primary/40 text-primary bg-primary/10">
                        Editing
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {pendingEditCount > 0
                          ? `${pendingEditCount} row${pendingEditCount === 1 ? '' : 's'} modified`
                          : 'No pending changes'}
                      </span>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleApplyChanges}
                        disabled={pendingEditCount === 0 || applyingChanges}
                        className="gap-2"
                      >
                        {applyingChanges ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDiscardChanges}
                        disabled={pendingEditCount === 0 || applyingChanges}
                        className="gap-2"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Discard
                      </Button>
                    </div>
                  ) : (
                    editingDisabledReason && (
                      <span className="text-xs text-muted-foreground">{editingDisabledReason}</span>
                    )
                  )
                )}
              </div>
            </div>

            {/* Error display */}
            {execution.status === 'error' && execution.error && (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertDescription className="text-sm font-mono whitespace-pre-wrap">
                    {execution.error}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Results grid or empty state */}
            {execution.status === 'success' && execution.result ? (
              <div className="flex-1 overflow-hidden">
                <ResultsGrid
                  result={execution.result}
                  onLoadMore={
                    execution.result.hasMore && pendingEditCount === 0 && !applyingChanges
                      ? handleLoadMore
                      : undefined
                  }
                  loadingMore={loadingMoreTabId === activeTabId}
                  editable={editingActive}
                  editedRows={pendingEdits}
                  onCellEdit={editingActive ? handleCellEdit : undefined}
                  connectionId={activeConnection?.connectionId || null}
                  schema={activeContext?.type === 'table' ? activeContext.schema : null}
                  table={activeContext?.type === 'table' ? activeContext.table : null}
                  primaryKeys={currentPrimaryKeys}
                />
              </div>
            ) : execution.status === 'idle' && !execution.error ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Play className="h-12 w-12 mb-4 opacity-20 mx-auto" />
                  <p className="text-sm">Execute a query to see results</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">
                    Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to run
                  </p>
                </div>
              </div>
            ) : execution.status === 'running' ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mb-4 animate-spin mx-auto text-primary" />
                  <p className="text-sm">Executing query...</p>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </PanelGroup>
      )}
    </div>
  );
}
