// Schema tree types for the browser

import type { Schema, Table, Column, ForeignKey } from './connection';

// Re-export ForeignKey for use in other modules
export type { ForeignKey };

export type NodeType = 'schema' | 'table' | 'view' | 'column';

export type FilterType = 'all' | 'tables' | 'views';

export interface SchemaNode {
  id: string;
  name: string;
  type: NodeType;
  schema?: string;
  table?: string;
  children?: SchemaNode[];
  metadata?: NodeMetadata;
  isExpanded?: boolean;
  isLoading?: boolean;
  childrenLoaded?: boolean;
}

export interface NodeMetadata {
  // For schemas
  owner?: string;
  isSystem?: boolean;
  description?: string;

  // For tables/views
  tableType?: string; // 'BASE TABLE' or 'VIEW'
  rowCount?: number;
  size?: string;

  // For columns
  dataType?: string;
  isNullable?: boolean;
  columnDefault?: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  characterMaximumLength?: number;
  numericPrecision?: number;
  numericScale?: number;
}

export interface SchemaTreeState {
  nodes: SchemaNode[];
  expandedNodes: Set<string>;
  selectedNode: string | null;
  searchQuery: string;
  filterType: FilterType;
  loading: boolean;
  error: string | null;
}

export interface SchemaGraphNode {
  id: string;
  schema: string;
  name: string;
  tableType: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  isExternal?: boolean;
}

export interface SchemaGraphEdge {
  id: string;
  source: string;
  target: string;
  name: string;
  columns: string[];
  foreignColumns: string[];
  onDelete: string;
  onUpdate: string;
}

// Helper functions to convert backend types to tree nodes
export function schemaToNode(schema: Schema): SchemaNode {
  return {
    id: `schema:${schema.name}`,
    name: schema.name,
    type: 'schema',
    schema: schema.name,
    children: [],
    metadata: {
      owner: schema.owner,
      isSystem: schema.isSystem,
      description: schema.description,
    },
    isExpanded: false,
    childrenLoaded: false,
  };
}

export function tableToNode(table: Table, schema: string): SchemaNode {
  const isView = table.tableType === 'VIEW';
  return {
    id: `${schema}.${table.name}:${isView ? 'view' : 'table'}`,
    name: table.name,
    type: isView ? 'view' : 'table',
    schema: schema,
    table: table.name,
    children: [],
    metadata: {
      tableType: table.tableType,
      owner: table.owner,
      rowCount: table.rowCount,
      size: table.size,
      description: table.description,
    },
    isExpanded: false,
    childrenLoaded: false,
  };
}

export function columnToNode(column: Column, schema: string, table: string): SchemaNode {
  return {
    id: `${schema}.${table}.${column.name}:column`,
    name: column.name,
    type: 'column',
    schema: schema,
    table: table,
    metadata: {
      dataType: column.dataType,
      isNullable: column.isNullable,
      columnDefault: column.columnDefault,
      isPrimaryKey: column.isPrimaryKey,
      isUnique: column.isUnique,
      isForeignKey: column.isForeignKey,
      foreignKeyTable: column.foreignKeyTable,
      foreignKeyColumn: column.foreignKeyColumn,
      characterMaximumLength: column.characterMaximumLength,
      numericPrecision: column.numericPrecision,
      numericScale: column.numericScale,
      description: column.description,
    },
  };
}

// Search and filter helpers
export function matchesSearch(node: SchemaNode, query: string): boolean {
  if (!query) return true;

  const lowerQuery = query.toLowerCase();
  const nameMatch = node.name.toLowerCase().includes(lowerQuery);

  // Also check description
  if (node.metadata?.description) {
    return nameMatch || node.metadata.description.toLowerCase().includes(lowerQuery);
  }

  return nameMatch;
}

export function matchesFilter(node: SchemaNode, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'tables' && node.type === 'table') return true;
  if (filter === 'views' && node.type === 'view') return true;
  return false;
}

export function filterNodes(
  nodes: SchemaNode[],
  query: string,
  filter: FilterType
): SchemaNode[] {
  if (!query && filter === 'all') return nodes;

  const result: SchemaNode[] = [];

  for (const node of nodes) {
    if (node.type === 'schema') {
      // For schemas, check if any children match
      const filteredChildren = node.children
        ? filterNodes(node.children, query, filter)
        : [];

      if (filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
          isExpanded: query.length > 0, // Auto-expand if searching
        });
      }
    } else if (node.type === 'table' || node.type === 'view') {
      // Check if the table/view matches filter and search
      const matchesF = matchesFilter(node, filter);
      const matchesS = matchesSearch(node, query);

      if (matchesF && matchesS) {
        result.push({
          ...node,
          isExpanded: query.length > 0, // Auto-expand if searching
        });
      } else if (node.children) {
        // Check if any columns match
        const filteredChildren = node.children.filter(child =>
          matchesSearch(child, query)
        );

        if (matchesF && filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
            isExpanded: true,
          });
        }
      }
    } else {
      // Column nodes
      if (matchesSearch(node, query)) {
        result.push(node);
      }
    }
  }

  return result;
}
