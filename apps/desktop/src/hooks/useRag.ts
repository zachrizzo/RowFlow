import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/hooks/use-toast';
import { quoteIdentifier } from '@/lib/sqlPlaceholders';
import { checkAndPromptForMissingModels, EMBEDDING_MODEL, CHAT_MODEL } from '@/lib/modelCheck';
import type {
  EmbeddingSearchRequest,
  EmbeddingSearchMatch,
  EmbeddingJobRequest,
  EmbeddingJobResult,
  OllamaStatus,
} from '@/types/ai';
import type { Column } from '@/types/connection';

const DEFAULT_EMBEDDING_MODEL = EMBEDDING_MODEL;
const DEFAULT_CHAT_MODEL = CHAT_MODEL;

export function useRag(connectionId: string | null) {
  const { toast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);

  /**
   * Search embeddings using RAG
   */
  const searchEmbeddings = useCallback(
    async (
      query: string,
      options?: {
        schema?: string;
        table?: string;
        topK?: number;
        model?: string;
        onOpenSettings?: () => void;
      }
    ): Promise<EmbeddingSearchMatch[]> => {
      if (!connectionId) {
        throw new Error('No active database connection');
      }

      // Check for embedding model before searching
      const modelAvailable = await checkAndPromptForMissingModels(
        { type: 'embedding', model: options?.model || DEFAULT_EMBEDDING_MODEL },
        toast,
        options?.onOpenSettings
      );
      
      if (!modelAvailable) {
        throw new Error('Embedding model not available');
      }

      setIsSearching(true);
      try {
        const request: EmbeddingSearchRequest = {
          connectionId,
          schema: options?.schema,
          table: options?.table,
          query,
          model: options?.model || DEFAULT_EMBEDDING_MODEL,
          topK: options?.topK || 5,
        };

        const matches = await invoke<EmbeddingSearchMatch[]>('search_embeddings', { request });
        return matches;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to search embeddings';
        toast({
          title: 'Search Failed',
          description: errorMessage,
          variant: 'destructive',
        });
        throw error;
      } finally {
        setIsSearching(false);
      }
    },
    [connectionId, toast]
  );

  /**
   * Generate embeddings for a table
   */
  const embedTable = useCallback(
    async (request: EmbeddingJobRequest): Promise<EmbeddingJobResult> => {
      setIsEmbedding(true);
      try {
        const result = await invoke<EmbeddingJobResult>('embed_table', { request });
        toast({
          title: 'Embedding Complete',
          description: `Embedded ${result.embeddedRows} rows from ${request.schema}.${request.table}`,
        });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate embeddings';
        toast({
          title: 'Embedding Failed',
          description: errorMessage,
          variant: 'destructive',
        });
        throw error;
      } finally {
        setIsEmbedding(false);
      }
    },
    [toast]
  );

  /**
   * Check Ollama status
   */
  const checkOllamaStatus = useCallback(async (): Promise<OllamaStatus> => {
    try {
      return await invoke<OllamaStatus>('check_ollama_status');
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      return { available: false, models: [] };
    }
  }, []);

  /**
   * Generate SQL query from natural language using RAG context
   */
  const generateSqlFromRag = useCallback(
    async (
      question: string,
      options?: {
        schema?: string;
        table?: string;
        topK?: number;
        onOpenSettings?: () => void;
      }
    ): Promise<{ sql: string; matches: EmbeddingSearchMatch[] }> => {
      // Check for chat model before generating SQL
      const chatModelAvailable = await checkAndPromptForMissingModels(
        { type: 'chat', model: DEFAULT_CHAT_MODEL },
        toast,
        options?.onOpenSettings
      );
      
      if (!chatModelAvailable) {
        throw new Error('Chat model not available');
      }

      // First, search for relevant context
      const matches = await searchEmbeddings(question, {
        schema: options?.schema,
        table: options?.table,
        topK: options?.topK || 5,
        onOpenSettings: options?.onOpenSettings,
      });

      if (matches.length === 0) {
        throw new Error('No relevant data found. Please embed some tables first.');
      }

      // Build enhanced context from matches including schema relationships
      const contextParts: string[] = [];
      
      // Add table data from matches
      const uniqueTables = new Map<string, Set<string>>();
      matches.forEach((match) => {
        const key = `${match.schema}.${match.table}`;
        if (!uniqueTables.has(key)) {
          uniqueTables.set(key, new Set());
        }
        uniqueTables.get(key)!.add(match.content);
      });
      
      // Build context with table information
      for (const [tableKey, contents] of uniqueTables.entries()) {
        const [schema, table] = tableKey.split('.');
        contextParts.push(`Table: ${tableKey}`);
        contextParts.push(`Sample Data:\n${Array.from(contents).slice(0, 2).join('\n')}`);
        
        // Try to get foreign key relationships for this table
        try {
          if (connectionId) {
            const columns = await invoke<Column[]>('get_table_columns', {
              connectionId,
              schema,
              table,
            });
            
            const foreignKeys = columns
              .filter(col => col.isForeignKey && col.foreignKeyTable)
              .map(col => 
                `  - ${col.name} (${col.dataType}) -> ${col.foreignKeySchema || schema}.${col.foreignKeyTable}.${col.foreignKeyColumn || 'id'}`
              );
            
            if (foreignKeys.length > 0) {
              contextParts.push(`Foreign Keys:\n${foreignKeys.join('\n')}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to get foreign keys for ${tableKey}:`, error);
        }
        
        contextParts.push(''); // Empty line between tables
      }
      
      const context = contextParts.join('\n').trim();

      // Use chat model to generate SQL from the question and context
      try {
        const sql = await invoke<string>('generate_sql_from_question', {
          question,
          context: context,
          model: DEFAULT_CHAT_MODEL,
        });

        // Clean up the SQL - remove markdown code blocks if present
        let cleanedSql = sql.trim();
        if (cleanedSql.startsWith('```')) {
          // Remove markdown code blocks
          cleanedSql = cleanedSql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '');
          cleanedSql = cleanedSql.replace(/\s*```$/i, '').trim();
        }
        
        // Remove any leading/trailing whitespace and ensure it ends with semicolon
        cleanedSql = cleanedSql.trim();
        if (!cleanedSql.endsWith(';')) {
          cleanedSql += ';';
        }

        return { sql: cleanedSql, matches };
      } catch (error) {
        console.error('Failed to generate SQL with chat model:', error);
        // Fallback to simple query if chat generation fails
        if (matches.length === 0) {
          throw new Error('Failed to generate SQL and no matches are available for fallback.');
        }
        const [firstMatch] = matches;
        if (!firstMatch) {
          throw new Error('Failed to determine a fallback match for SQL generation.');
        }
        const sql = `SELECT * FROM ${quoteIdentifier(firstMatch.schema)}.${quoteIdentifier(firstMatch.table)} LIMIT 100;`;
        return { sql, matches };
      }
    },
    [searchEmbeddings, connectionId, toast]
  );

  return {
    searchEmbeddings,
    embedTable,
    checkOllamaStatus,
    generateSqlFromRag,
    isSearching,
    isEmbedding,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    chatModel: DEFAULT_CHAT_MODEL,
  };
}
