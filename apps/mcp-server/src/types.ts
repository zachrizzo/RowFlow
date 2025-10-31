/**
 * Type definitions for RowFlow MCP Server
 */

export interface ProfileConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // Max pool connections
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface Profiles {
  [profileName: string]: ProfileConfig;
}

// Tool Input Types
export interface DescribeInput {
  profile: string;
  schema?: string;
}

export interface QueryInput {
  profile: string;
  sql: string;
  params?: any[];
  maxRows?: number;
}

export interface ExplainInput {
  profile: string;
  sql: string;
}

export interface SampleInput {
  profile: string;
  schema: string;
  table: string;
  limit?: number;
}

export interface LocksInput {
  profile: string;
}

export interface CancelInput {
  profile: string;
  pid: number;
}

// Connection Management Input Types
export interface ConnectionListInput {
  // No parameters needed
}

export interface ConnectionAddInput {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface ConnectionTestInput {
  profile: string;
}

// Tool Output Types
export interface SchemaInfo {
  schemaName: string;
  tables: TableInfo[];
}

export interface TableInfo {
  tableName: string;
  tableType: string;
  comment?: string;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

export interface DescribeOutput {
  schemas: SchemaInfo[];
}

export interface QueryField {
  name: string;
  dataTypeID: number;
  dataType?: string;
}

export interface QueryOutput {
  fields: QueryField[];
  rows: any[];
  rowCount: number;
  truncated: boolean;
}

export interface ExplainOutput {
  plan: any;
  executionTime?: number;
  planningTime?: number;
}

export interface SampleOutput {
  fields: QueryField[];
  rows: any[];
  rowCount: number;
  totalRows?: number;
}

export interface LockInfo {
  blockedPid: number;
  blockedQuery: string;
  blockedDuration: string;
  blockingPid: number;
  blockingQuery: string;
  blockingDuration: string;
  lockType: string;
  relation?: string;
}

export interface LocksOutput {
  locks: LockInfo[];
  blockerCount: number;
}

export interface CancelOutput {
  success: boolean;
  message: string;
}

// Connection Management Output Types
export interface ConnectionInfo {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  maxConnections?: number;
}

export interface ConnectionListOutput {
  connections: ConnectionInfo[];
  count: number;
}

export interface ConnectionAddOutput {
  success: boolean;
  message: string;
  profileName?: string;
  instructions?: string[];
  error?: string;
}

export interface ConnectionTestOutput {
  success: boolean;
  message: string;
  serverVersion?: string;
  serverInfo?: {
    version: string;
    uptime?: string;
    currentDatabase: string;
    currentUser: string;
    serverEncoding: string;
  };
  error?: string;
}

// MCP Error
export interface MCPError {
  code: string;
  message: string;
  details?: any;
}
