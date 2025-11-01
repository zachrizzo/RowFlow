export interface FieldInfo {
  name: string;
  typeOid: number;
  typeName: string;
  nullable: boolean;
}

export interface QueryResult {
  fields: FieldInfo[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTime: number; // milliseconds
  hasMore: boolean;
}

export interface QueryExecutionState {
  status: 'idle' | 'running' | 'success' | 'error';
  result: QueryResult | null;
  error: string | null;
  duration: number; // milliseconds
  backendPid?: number;
}

export interface TableQueryContext {
  type: 'table';
  schema: string;
  table: string;
}

export type QueryTabContext = TableQueryContext;

export type QueryTabViewType = 'sql' | 'table';

export interface QueryTab {
  id: string;
  title: string;
  sql: string;
  execution: QueryExecutionState;
  context?: QueryTabContext;
  viewType?: QueryTabViewType; // 'sql' for SQL editor, 'table' for table data view
}

export interface QueryHistoryItem {
  id: string;
  sql: string;
  timestamp: number;
  duration: number;
  rowCount: number;
  success: boolean;
  error?: string;
}

export type ExportFormat = 'csv' | 'json' | 'clipboard';

export interface ExportOptions {
  format: ExportFormat;
  includeHeaders?: boolean;
  filename?: string;
}
