import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Table, Column, ForeignKey } from '@/types/connection';
import type { SchemaGraphEdge, SchemaGraphNode } from '@/types/schema';

interface UseSchemaGraphOptions {
  connectionId: string | null;
  schema?: string | null;
  autoLoad?: boolean;
  maxTables?: number; // Max tables to load initially
  batchSize?: number; // Number of tables to process at once
}

interface UseSchemaGraphResult {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
  loading: boolean;
  error: string | null;
  progress: { current: number; total: number } | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

function makeTableId(schema: string, table: string) {
  return `${schema}.${table}`;
}

// Helper to add timeout to promises
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// Process tables in batches to avoid overwhelming the connection pool
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  onProgress?: (current: number, total: number) => void,
  itemTimeout: number = 10000 // 10 second timeout per item
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`[processBatch] Processing batch ${Math.floor(i / batchSize) + 1}, items ${i} to ${Math.min(i + batchSize, items.length)}`);

    const batchResults = await Promise.allSettled(
      batch.map((item, idx) =>
        withTimeout(
          processor(item),
          itemTimeout,
          `Timeout processing item ${i + idx} after ${itemTimeout}ms`
        )
      )
    );

    // Extract successful results and log failures
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`[processBatch] Failed to process item ${i + idx}:`, result.reason);
      }
    });

    onProgress?.(Math.min(i + batchSize, items.length), items.length);

    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  console.log(`[processBatch] Completed. Successfully processed ${results.length}/${items.length} items`);
  return results;
}

export function useSchemaGraph({
  connectionId,
  schema = null,
  autoLoad = true,
  maxTables = 50,
  batchSize = 5,
}: UseSchemaGraphOptions): UseSchemaGraphResult {
  const [nodes, setNodes] = useState<SchemaGraphNode[]>([]);
  const [edges, setEdges] = useState<SchemaGraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [allTables, setAllTables] = useState<Table[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadTables = useCallback(async (tablesToLoad: Table[], isAppending: boolean = false) => {
    if (!connectionId || tablesToLoad.length === 0) {
      console.log('[useSchemaGraph] loadTables called with no connection or empty tables list');
      return;
    }

    console.log('[useSchemaGraph] Starting to load', tablesToLoad.length, 'tables');
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: tablesToLoad.length });

    try {
      // Create a new abort controller for this load operation
      abortControllerRef.current = new AbortController();

      // Process tables in batches
      console.log('[useSchemaGraph] Processing in batches of', batchSize);
      const detailedTables = await processBatch(
        tablesToLoad,
        batchSize,
        async (table) => {
          console.log('[useSchemaGraph] Processing table:', table.schema, table.name);

          // Check if aborted
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Operation cancelled');
          }

          const startTime = Date.now();
          const [columnsResult, foreignKeysResult] = await Promise.allSettled([
            withTimeout(
              invoke<Column[]>('get_table_columns', {
                connectionId,
                schema: table.schema,
                table: table.name,
              }),
              8000,
              `Timeout getting columns for ${table.schema}.${table.name}`
            ),
            withTimeout(
              invoke<ForeignKey[]>('get_foreign_keys', {
                connectionId,
                schema: table.schema,
                table: table.name,
              }),
              8000,
              `Timeout getting foreign keys for ${table.schema}.${table.name}`
            ),
          ]);
          const elapsed = Date.now() - startTime;
          console.log(`[useSchemaGraph] Processed ${table.name} in ${elapsed}ms`);

          if (columnsResult.status === 'rejected') {
            console.error('[useSchemaGraph] Failed to get columns for', table.name, columnsResult.reason);
          }
          if (foreignKeysResult.status === 'rejected') {
            console.error('[useSchemaGraph] Failed to get foreign keys for', table.name, foreignKeysResult.reason);
          }

          const foreignKeys = foreignKeysResult.status === 'fulfilled' ? foreignKeysResult.value : ([] as ForeignKey[]);

          if (foreignKeys.length > 0) {
            console.log(`[useSchemaGraph] Table ${table.name} has ${foreignKeys.length} foreign keys:`, foreignKeys);
          }

          return {
            id: makeTableId(table.schema, table.name),
            schema: table.schema,
            name: table.name,
            tableType: table.tableType,
            columns:
              columnsResult.status === 'fulfilled'
                ? columnsResult.value
                : ([] as Column[]),
            foreignKeys,
            isExternal: false,
          } satisfies SchemaGraphNode;
        },
        (current, total) => {
          console.log('[useSchemaGraph] Progress:', current, '/', total);
          setProgress({ current, total });
        },
        10000 // 10 second timeout per table
      );

      console.log('[useSchemaGraph] Batch processing complete. Got', detailedTables.length, 'detailed tables');

      // Check if aborted after processing
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Build node map
      const nodeMap = new Map<string, SchemaGraphNode>();

      // Add existing nodes if appending
      if (isAppending) {
        console.log('[useSchemaGraph] Appending to existing nodes:', nodes.length);
        nodes.forEach(node => nodeMap.set(node.id, node));
      }

      // Add new nodes
      detailedTables.forEach((table) => {
        nodeMap.set(table.id, table);
      });

      // Build edges
      const newEdges: SchemaGraphEdge[] = [];
      console.log('[useSchemaGraph] Building edges from nodes...');

      Array.from(nodeMap.values()).forEach((table) => {
        if (table.foreignKeys.length > 0) {
          console.log(`[useSchemaGraph] Processing foreign keys for ${table.id}:`, table.foreignKeys);
        }

        table.foreignKeys.forEach((fk) => {
          const targetId = makeTableId(fk.foreignSchema, fk.foreignTable);
          console.log(`[useSchemaGraph] Creating edge: ${table.id} -> ${targetId}`, {
            constraint: fk.name,
            columns: fk.columns,
            foreignColumns: fk.foreignColumns,
          });

          // Add external nodes for foreign tables not in current schema
          if (!nodeMap.has(targetId)) {
            console.log(`[useSchemaGraph] Adding external node: ${targetId}`);
            nodeMap.set(targetId, {
              id: targetId,
              schema: fk.foreignSchema,
              name: fk.foreignTable,
              tableType: 'external',
              columns: [],
              foreignKeys: [],
              isExternal: true,
            });
          }

          newEdges.push({
            id: `fk:${table.id}:${fk.name}`,
            source: table.id,
            target: targetId,
            name: fk.name,
            columns: fk.columns,
            foreignColumns: fk.foreignColumns,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
          });
        });
      });

      console.log(`[useSchemaGraph] Created ${newEdges.length} edges`);

      console.log('[useSchemaGraph] Setting', nodeMap.size, 'nodes and', newEdges.length, 'edges');
      setNodes(Array.from(nodeMap.values()));
      setEdges(newEdges);
      setLoadedCount(loadedCount + tablesToLoad.length);
      setProgress(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'Operation cancelled') {
        console.log('[useSchemaGraph] Graph loading cancelled');
        return;
      }

      console.error('[useSchemaGraph] Failed to build schema graph:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load schema graph'
      );

      // Keep partial results if appending
      if (!isAppending) {
        setNodes([]);
        setEdges([]);
      }
    } finally {
      console.log('[useSchemaGraph] loadTables complete');
      setLoading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [connectionId, batchSize, nodes, loadedCount]);

  const load = useCallback(async () => {
    console.log('[useSchemaGraph.load] Starting load, connectionId:', connectionId, 'schema:', schema);

    if (!connectionId) {
      console.log('[useSchemaGraph.load] No connection ID, clearing state');
      setNodes([]);
      setEdges([]);
      setAllTables([]);
      setLoadedCount(0);
      return;
    }

    try {
      // Fetch all table names first
      console.log('[useSchemaGraph.load] Fetching table list...');
      const tables = await invoke<Table[]>('list_tables', {
        connectionId,
        schema,
      });

      console.log('[useSchemaGraph.load] Got', tables.length, 'tables');
      setAllTables(tables);
      setLoadedCount(0);

      // Load first batch
      const initialBatch = tables.slice(0, maxTables);
      console.log('[useSchemaGraph.load] Loading initial batch of', initialBatch.length, 'tables');
      await loadTables(initialBatch, false);
    } catch (err) {
      console.error('[useSchemaGraph.load] Failed to list tables:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to list tables'
      );
      setNodes([]);
      setEdges([]);
      setAllTables([]);
    }
  }, [connectionId, schema, maxTables, loadTables]);

  const loadMore = useCallback(async () => {
    if (loadedCount >= allTables.length) {
      return;
    }

    const nextBatch = allTables.slice(loadedCount, loadedCount + maxTables);
    await loadTables(nextBatch, true);
  }, [allTables, loadedCount, maxTables, loadTables]);

  const refresh = useCallback(async () => {
    // Cancel any ongoing load operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setNodes([]);
    setEdges([]);
    setLoadedCount(0);
    await load();
  }, [load]);

  useEffect(() => {
    if (autoLoad && connectionId) {
      console.log('[useSchemaGraph] useEffect triggering load');
      load();
    }

    // Cleanup: abort any ongoing operations when unmounting or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        console.log('[useSchemaGraph] Aborting ongoing operation');
        abortControllerRef.current.abort();
      }
    };
  }, [autoLoad, connectionId, schema]); // Only depend on primitive values, not the load function

  return {
    nodes,
    edges,
    loading,
    error,
    progress,
    hasMore: loadedCount < allTables.length,
    loadMore,
    refresh,
  };
}
