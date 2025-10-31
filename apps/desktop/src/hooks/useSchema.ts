import { useState, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Schema, Table, Column } from '@/types/connection';
import type {
  SchemaNode,
  FilterType,
  SchemaStats,
} from '@/types/schema';
import {
  schemaToNode,
  tableToNode,
  columnToNode,
  filterNodes,
  calculateStats,
} from '@/types/schema';

interface UseSchemaOptions {
  connectionId: string | null;
  autoLoad?: boolean;
}

interface UseSchemaReturn {
  nodes: SchemaNode[];
  filteredNodes: SchemaNode[];
  stats: SchemaStats;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  filterType: FilterType;
  expandedNodes: Set<string>;

  // Actions
  fetchSchemas: () => Promise<void>;
  fetchTables: (schemaName: string) => Promise<void>;
  fetchColumns: (schemaName: string, tableName: string) => Promise<void>;
  refreshSchema: () => Promise<void>;
  toggleNode: (nodeId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: FilterType) => void;
  expandNode: (nodeId: string) => void;
  collapseNode: (nodeId: string) => void;
  clearSearch: () => void;
}

// Cache for schema data per connection
const schemaCache = new Map<string, SchemaNode[]>();

export function useSchema({ connectionId, autoLoad = true }: UseSchemaOptions): UseSchemaReturn {
  const [nodes, setNodes] = useState<SchemaNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Fetch all schemas
  const fetchSchemas = useCallback(async () => {
    if (!connectionId) {
      setNodes([]);
      return;
    }

    // Check cache first
    const cached = schemaCache.get(connectionId);
    if (cached) {
      setNodes(cached);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const schemas = await invoke<Schema[]>('list_schemas', {
        connectionId,
      });

      const schemaNodes = schemas.map(schemaToNode);
      setNodes(schemaNodes);
      schemaCache.set(connectionId, schemaNodes);
    } catch (err) {
      console.error('Failed to fetch schemas:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch schemas');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // Fetch tables for a schema
  const fetchTables = useCallback(async (schemaName: string) => {
    if (!connectionId) return;

    setLoading(true);
    setError(null);

    try {
      const tables = await invoke<Table[]>('list_tables', {
        connectionId,
        schema: schemaName,
      });

      const tableNodes = tables.map(table => tableToNode(table, schemaName));

      // Update the schema node with its tables
      setNodes(prevNodes => {
        const newNodes = prevNodes.map(node => {
          if (node.type === 'schema' && node.schema === schemaName) {
            return {
              ...node,
              children: tableNodes,
              childrenLoaded: true,
            };
          }
          return node;
        });

        // Update cache
        if (connectionId) {
          schemaCache.set(connectionId, newNodes);
        }

        return newNodes;
      });
    } catch (err) {
      console.error('Failed to fetch tables:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tables');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // Fetch columns for a table
  const fetchColumns = useCallback(async (schemaName: string, tableName: string) => {
    if (!connectionId) return;

    setLoading(true);
    setError(null);

    try {
      const columns = await invoke<Column[]>('get_table_columns', {
        connectionId,
        schema: schemaName,
        table: tableName,
      });

      const columnNodes = columns.map(column =>
        columnToNode(column, schemaName, tableName)
      );

      // Update the table node with its columns
      setNodes(prevNodes => {
        const newNodes = prevNodes.map(schemaNode => {
          if (schemaNode.type === 'schema' && schemaNode.schema === schemaName) {
            return {
              ...schemaNode,
              children: schemaNode.children?.map(tableNode => {
                if (
                  (tableNode.type === 'table' || tableNode.type === 'view') &&
                  tableNode.table === tableName
                ) {
                  return {
                    ...tableNode,
                    children: columnNodes,
                    childrenLoaded: true,
                  };
                }
                return tableNode;
              }),
            };
          }
          return schemaNode;
        });

        // Update cache
        if (connectionId) {
          schemaCache.set(connectionId, newNodes);
        }

        return newNodes;
      });
    } catch (err) {
      console.error('Failed to fetch columns:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch columns');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // Refresh all schema data
  const refreshSchema = useCallback(async () => {
    if (!connectionId) return;

    // Clear cache for this connection
    schemaCache.delete(connectionId);
    setExpandedNodes(new Set());

    await fetchSchemas();
  }, [connectionId, fetchSchemas]);

  // Toggle node expansion
  const toggleNode = useCallback(async (nodeId: string) => {
    // Don't allow toggle while loading to prevent race conditions
    if (loading) {
      console.log('Cannot toggle node while loading');
      return;
    }

    // Helper to find node recursively - defined inline to avoid dependency issues
    const findNode = (searchNodes: SchemaNode[], id: string): SchemaNode | null => {
      for (const node of searchNodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(nodes, nodeId);
    if (!node) {
      console.log('Node not found:', nodeId);
      return;
    }

    const isExpanded = expandedNodes.has(nodeId);

    if (isExpanded) {
      // Collapse
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    } else {
      // Expand
      setExpandedNodes(prev => new Set(prev).add(nodeId));

      // Lazy load children if not loaded
      if (!node.childrenLoaded && !node.isLoading) {
        console.log('Loading children for:', node.name, node.type);
        if (node.type === 'schema' && node.schema) {
          await fetchTables(node.schema);
        } else if ((node.type === 'table' || node.type === 'view') && node.schema && node.table) {
          await fetchColumns(node.schema, node.table);
        }
      }
    }
  }, [nodes, expandedNodes, fetchTables, fetchColumns, loading]);

  // Expand a specific node
  const expandNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => new Set(prev).add(nodeId));
  }, []);

  // Collapse a specific node
  const collapseNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Auto-load schemas when connection changes
  useEffect(() => {
    if (autoLoad && connectionId) {
      fetchSchemas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, autoLoad]); // Remove fetchSchemas to prevent loop

  // Calculate filtered nodes
  const filteredNodes = useMemo(() => {
    return filterNodes(nodes, searchQuery, filterType);
  }, [nodes, searchQuery, filterType]);

  // Calculate stats
  const stats = useMemo(() => {
    return calculateStats(nodes);
  }, [nodes]);

  // Auto-expand nodes when searching (with loop prevention)
  useEffect(() => {
    if (searchQuery.length > 0) {
      // Expand all schema nodes that have matching children
      const nodesToExpand = new Set<string>();

      filteredNodes.forEach(node => {
        if (node.type === 'schema' && node.children && node.children.length > 0) {
          nodesToExpand.add(node.id);

          // Also expand table/view nodes with matching columns
          node.children.forEach(child => {
            if ((child.type === 'table' || child.type === 'view') &&
                child.children && child.children.length > 0) {
              nodesToExpand.add(child.id);
            }
          });
        }
      });

      // Only update if the set actually changed (prevent infinite loop)
      const currentIds = Array.from(expandedNodes).sort().join(',');
      const newIds = Array.from(nodesToExpand).sort().join(',');

      if (currentIds !== newIds) {
        setExpandedNodes(nodesToExpand);
      }
    }
  }, [searchQuery, filteredNodes, expandedNodes]);

  return {
    nodes,
    filteredNodes,
    stats,
    loading,
    error,
    searchQuery,
    filterType,
    expandedNodes,
    fetchSchemas,
    fetchTables,
    fetchColumns,
    refreshSchema,
    toggleNode,
    setSearchQuery,
    setFilterType,
    expandNode,
    collapseNode,
    clearSearch,
  };
}
