// TypeScript types matching Rust backend types (from types.rs)

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export interface TlsConfig {
  enabled: boolean;
  verifyCa: boolean;
  caCertPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
}

export interface ConnectionProfile {
  id?: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  useSsh: boolean;
  sshConfig?: SshConfig;
  tlsConfig?: TlsConfig;
  connectionTimeout?: number; // seconds
  statementTimeout?: number;  // milliseconds
  lockTimeout?: number;       // milliseconds
  idleTimeout?: number;       // seconds
  readOnly: boolean;
}

export interface FieldInfo {
  name: string;
  typeOid: number;
  typeName: string;
  nullable: boolean;
}

export interface QueryResult {
  fields: FieldInfo[];
  rows: any[];
  rowCount: number;
  executionTime: number; // milliseconds
  hasMore: boolean;
}

export interface ConnectionInfo {
  connectionId: string;
  serverVersion: string;
  databaseName: string;
  username: string;
  serverEncoding: string;
  clientEncoding: string;
  isSuperuser: boolean;
  sessionUser: string;
  currentSchema: string;
}

export interface Schema {
  name: string;
  owner: string;
  isSystem: boolean;
  description?: string;
}

export interface Table {
  schema: string;
  name: string;
  tableType: string;
  owner?: string;
  rowCount?: number;
  size?: string;
  description?: string;
}

export interface Column {
  name: string;
  dataType: string;
  isNullable: boolean;
  columnDefault?: string;
  characterMaximumLength?: number;
  numericPrecision?: number;
  numericScale?: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isForeignKey: boolean;
  foreignKeySchema?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  description?: string;
}

export interface ForeignKeySearchRequest {
  schema: string;
  table: string;
  column: string;
  search?: string;
  limit?: number;
}

export interface ForeignKeySearchResult {
  key: string;
  row: Record<string, unknown>;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  foreignSchema: string;
  foreignTable: string;
  foreignColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface TableColumnDefinition {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultExpression?: string;
  isPrimaryKey: boolean;
  references?: ColumnReference;
}

export interface ColumnReference {
  schema?: string;
  table: string;
  column: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface CreateTableRequest {
  schema: string;
  tableName: string;
  columns: TableColumnDefinition[];
  ifNotExists: boolean;
}

export interface DropTableRequest {
  schema: string;
  tableName: string;
  cascade: boolean;
  ifExists: boolean;
}

export interface AddTableColumnRequest {
  schema: string;
  tableName: string;
  column: TableColumnDefinition;
  ifNotExists: boolean;
}

export interface DropTableColumnRequest {
  schema: string;
  tableName: string;
  columnName: string;
  cascade: boolean;
  ifExists: boolean;
}

export interface TableRowData {
  values: Record<string, any>;
}

export interface CreateSchemaRequest {
  name: string;
  ifNotExists: boolean;
}

export interface DropSchemaRequest {
  name: string;
  cascade: boolean;
  ifExists: boolean;
}

export interface RenameSchemaRequest {
  currentName: string;
  newName: string;
}

export interface InsertRowRequest {
  schema: string;
  tableName: string;
  row: TableRowData;
}

export interface DeleteRowRequest {
  schema: string;
  tableName: string;
  criteria: TableRowData;
  limit?: number;
}

// Connection status for UI state management
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  profile: ConnectionProfile;
  status: ConnectionStatus;
  connectionId?: string;
  connectionInfo?: ConnectionInfo;
  error?: string;
}

// Stored profile (without sensitive runtime data)
export interface StoredProfile extends Omit<ConnectionProfile, 'id'> {
  id: string;
  createdAt: number;
  updatedAt: number;
  isMcpManaged?: boolean; // True if managed by MCP server
}
