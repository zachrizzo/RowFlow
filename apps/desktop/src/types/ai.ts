// AI and embedding types matching Rust backend

export interface EmbeddingJobRequest {
  connectionId: string;
  schema: string;
  table: string;
  columns: string[];
  model: string;
  limit?: number;
}

export interface EmbeddingJobResult {
  embeddedRows: number;
  skippedRows: number;
}

export interface EmbeddingSearchRequest {
  connectionId: string;
  schema?: string;
  table?: string;
  query: string;
  model: string;
  topK: number;
}

export interface EmbeddingSearchMatch {
  rowReference: string;
  schema: string;
  table: string;
  score: number;
  content: string;
  metadata: Record<string, any>;
}

export interface EmbeddingTableMetadata {
  connectionId: string;
  schemaName: string;
  tableName: string;
  rowCount: number;
  lastUpdated: number;
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
  digest?: string;
  modifiedAt?: string;
}

export interface OllamaStatus {
  available: boolean;
  endpoint?: string;
  version?: string;
  models: OllamaModelInfo[];
  message?: string;
}

export interface OllamaInstallInfo {
  isBundled: boolean;
  isInstalled: boolean;
  systemOllamaAvailable: boolean;
  systemOllamaPath?: string;
  modelsDir: string;
  modelsSize: number;
  modelsSizeFormatted: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  matches?: EmbeddingSearchMatch[];
  sqlQuery?: string;
}

export type AgentIntent = 'greeting' | 'smallTalk' | 'databaseQuery' | 'unknown';

export interface AgentState {
  message: string;
  intent: AgentIntent;
  context?: string;
  response?: string;
  sql?: string;
  shouldSearch: boolean;
}
