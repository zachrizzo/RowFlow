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
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  description?: string;
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
export interface StoredProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string; // Encrypted or plain - user warning needed
  useSsh: boolean;
  sshConfig?: SshConfig;
  tlsConfig?: TlsConfig;
  connectionTimeout?: number;
  statementTimeout?: number;
  lockTimeout?: number;
  idleTimeout?: number;
  readOnly: boolean;
  createdAt: number;
  updatedAt: number;
}
