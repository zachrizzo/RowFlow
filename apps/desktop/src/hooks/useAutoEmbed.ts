import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/hooks/use-toast';
import { checkAndPromptForMissingModels, EMBEDDING_MODEL, CHAT_MODEL } from '@/lib/modelCheck';
import type { Schema, Table, Column } from '@/types/connection';
import type { EmbeddingJobRequest, EmbeddingJobResult, EmbeddingTableMetadata } from '@/types/ai';

/**
 * Auto-embed schema metadata when a connection is established
 * This embeds table and column information for semantic search
 */
export function useAutoEmbed() {
  const { toast } = useToast();

  const embedSchemaMetadata = useCallback(
    async (connectionId: string, onOpenSettings?: () => void) => {
      try {
        // Check for embedding model before proceeding
        const modelAvailable = await checkAndPromptForMissingModels(
          { type: 'embedding', model: EMBEDDING_MODEL },
          toast,
          onOpenSettings
        );
        
        if (!modelAvailable) {
          console.log('[AutoEmbed] Embedding model not available, skipping auto-embedding');
          return;
        }

        // Check existing embeddings to avoid re-embedding
        let existingMetadata: EmbeddingTableMetadata[] = [];
        try {
          existingMetadata = await invoke<EmbeddingTableMetadata[]>('get_embedding_metadata', { connectionId });
        } catch (error) {
          console.log('[AutoEmbed] Could not check existing embeddings, proceeding...');
        }

        // Get all schemas
        const schemas = await invoke<Schema[]>('list_schemas', { connectionId });
        
        // Filter out system schemas for embedding
        const userSchemas = schemas.filter((s) => !s.isSystem);
        
        if (userSchemas.length === 0) {
          console.log('[AutoEmbed] No user schemas to embed');
          return;
        }

        let totalEmbedded = 0;

        // Embed metadata for each schema's tables
        for (const schema of userSchemas) {
          try {
            const tables = await invoke<Table[]>('list_tables', {
              connectionId,
              schema: schema.name,
            });

            for (const table of tables) {
              try {
                // Skip if already embedded (check by row count - if it matches, assume it's up to date)
                const tableKey = `${schema.name}.${table.name}`;
                const existing = existingMetadata.find(
                  (m) => m.schemaName === schema.name && m.tableName === table.name
                );
                
                // If embeddings exist and table hasn't grown significantly, skip
                if (existing && table.rowCount && existing.rowCount >= (table.rowCount || 0)) {
                  console.log(`[AutoEmbed] Skipping ${tableKey} - already embedded`);
                  continue;
                }

                // Get columns for the table
                const columns = await invoke<Column[]>('get_table_columns', {
                  connectionId,
                  schema: schema.name,
                  table: table.name,
                });

                if (columns.length === 0) continue;

                // Embed a sample of actual data (first 100 rows) for better context
                const columnNames = columns.map((col) => col.name);
                const request: EmbeddingJobRequest = {
                  connectionId,
                  schema: schema.name,
                  table: table.name,
                  columns: columnNames,
                  model: EMBEDDING_MODEL,
                  limit: 100, // Limit to first 100 rows for auto-embedding
                };

                const result = await invoke<EmbeddingJobResult>('embed_table', { request });
                totalEmbedded += result.embeddedRows;

                console.log(
                  `[AutoEmbed] Embedded ${result.embeddedRows} rows from ${schema.name}.${table.name}`
                );
              } catch (error) {
                console.error(
                  `[AutoEmbed] Failed to embed table ${schema.name}.${table.name}:`,
                  error
                );
                // Continue with other tables
              }
            }
          } catch (error) {
            console.error(`[AutoEmbed] Failed to load tables for schema ${schema.name}:`, error);
            // Continue with other schemas
          }
        }

        if (totalEmbedded > 0) {
          toast({
            title: 'Auto-embedding complete',
            description: `Embedded ${totalEmbedded} rows for semantic search`,
          });
        }
      } catch (error) {
        console.error('[AutoEmbed] Failed to auto-embed schema:', error);
        // Don't show error toast for auto-embedding failures - it's optional
      }
    },
    [toast]
  );

  return {
    embedSchemaMetadata,
    embeddingModel: EMBEDDING_MODEL,
    chatModel: CHAT_MODEL,
  };
}
