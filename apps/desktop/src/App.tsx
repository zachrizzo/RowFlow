import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { SchemaPanel, type PanelSize } from '@/components/SchemaPanel';
import { QueryPanel, type InsertSqlHandler } from '@/components/QueryPanel';
import { DatabaseProvider } from '@/contexts/DatabaseContext';
import { CommandProvider } from '@/contexts/CommandContext';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { Toaster } from '@/components/ui/toaster';
import { Settings } from '@/components/Settings';
import { Header } from '@/components/Header';
import { ConnectionDialog } from '@/components/ConnectionDialog';
import { AiChat } from '@/components/AiChat';
import type { EmbeddingSearchMatch } from '@/types/ai';
import { useTheme } from '@/hooks/useTheme';
import type { StoredProfile } from '@/types/connection';
import { generateSelectQuery } from '@/lib/sqlPlaceholders';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { useDatabase } from '@/hooks/useDatabase';

// Emergency fix: Clear corrupted localStorage data on app load
try {
  const stored = localStorage.getItem('rowflow-query-tabs');
  if (stored) {
    const parsed = JSON.parse(stored);

    // Check for various types of corruption
    const isCorrupted =
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.tabs) ||
      parsed.tabs.some(
        (tab: any) =>
          !tab ||
          typeof tab !== 'object' ||
          tab.sql === undefined ||
          tab.sql === null ||
          typeof tab.sql !== 'string' ||
          (typeof tab.sql === 'object' && tab.sql !== null) ||
          tab.sql === '[object Promise]' ||
          String(tab.sql).includes('Promise')
      );

    if (isCorrupted) {
      console.warn('EMERGENCY: Clearing corrupted localStorage data on app startup');
      localStorage.removeItem('rowflow-query-tabs');
    }
  }
} catch (error) {
  console.error('Failed to check localStorage, clearing it:', error);
  localStorage.removeItem('rowflow-query-tabs');
}

function AppContent() {
  // Initialize command palette keyboard listener
  useCommandPalette();
  const { getActiveConnection } = useDatabase();

  const { settings } = useSettings();
  const tablePreviewLimit = settings.queryPreviewLimit;

  const [insertSqlHandler, setInsertSqlHandler] = useState<InsertSqlHandler | null>(null);
  const [selectedTable, setSelectedTable] = useState<{ schema: string; table: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isConnectionFormOpen, setIsConnectionFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StoredProfile | undefined>();
  const [connectionsSidebarOpen, setConnectionsSidebarOpen] = useState(false);
  const [schemaPanelSize, setSchemaPanelSize] = useState<PanelSize>('normal');
  const schemaPanelRef = useRef<ImperativePanelHandle>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const handleSchemaPanelSizeChange = useCallback((size: PanelSize) => {
    setSchemaPanelSize(size);
    const panel = schemaPanelRef.current;
    if (!panel) return;

    switch (size) {
      case 'minimized':
        panel.resize(3); // Very small, just enough for the button
        break;
      case 'normal':
        panel.resize(30); // Default 30%
        break;
      case 'expanded':
        panel.resize(95); // Almost full screen
        break;
    }
  }, []);

  const updateSelectedTable = useCallback((value: { schema: string; table: string } | null) => {
    setSelectedTable((prev) => {
      const prevSchema = prev?.schema ?? null;
      const prevTable = prev?.table ?? null;
      const nextSchema = value?.schema ?? null;
      const nextTable = value?.table ?? null;

      if (prevSchema === nextSchema && prevTable === nextTable) {
        return prev;
      }

      return value;
    });
  }, []);

  const handleTableSelect = useCallback(async (schema: string, table: string) => {
    console.log('[App] handleTableSelect called:', { schema, table });
    console.log('[App] insertSqlHandler defined?', !!insertSqlHandler);

    // Generate a properly quoted SELECT statement for the selected table
    const query = generateSelectQuery(schema, table, tablePreviewLimit);
    console.log('[App] Generated query:', query);
    updateSelectedTable({ schema, table });

    if (insertSqlHandler) {
      console.log('[App] Calling insertSqlHandler with query:', query);
      try {
        await insertSqlHandler(query, {
          execute: true,
          replace: true,
          tabName: `${schema}.${table}`,
          context: {
            type: 'table',
            schema,
            table,
          },
        });
        console.log('[App] insertSqlHandler completed successfully');
      } catch (error) {
        console.error('[App] Error calling insertSqlHandler:', error);
      }
    } else {
      console.warn('[App] insertSqlHandler is not defined!');
    }
  }, [insertSqlHandler, tablePreviewLimit, updateSelectedTable]);

  const handleNewConnection = () => {
    setEditingProfile(undefined);
    setIsConnectionFormOpen(true);
    // Open connections sidebar when adding a new connection
    setConnectionsSidebarOpen(true);
  };

  const handleConnectionFormSuccess = () => {
    setIsConnectionFormOpen(false);
    setEditingProfile(undefined);
    // Open connections sidebar when a connection is successfully added
    setConnectionsSidebarOpen(true);
  };


  return (
    <>
      <div className="h-screen w-screen overflow-hidden bg-background flex flex-col relative">
        {/* Header */}
      <Header
        onNewConnection={handleNewConnection}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleConnections={() => setConnectionsSidebarOpen(!connectionsSidebarOpen)}
        connectionsOpen={connectionsSidebarOpen}
        onToggleAiChat={() => setAiChatOpen(!aiChatOpen)}
        aiChatOpen={aiChatOpen}
      />

        {/* Connections Sidebar */}
        <div
          className={`fixed left-0 top-12 bottom-0 w-80 bg-card border-r z-40 transition-transform duration-300 ease-in-out ${
            connectionsSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ConnectionsPanel />
        </div>

        {/* Overlay when sidebar is open */}
        {connectionsSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-30 top-12"
            onClick={() => setConnectionsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Schema Browser Panel */}
            <Panel
              ref={schemaPanelRef}
              defaultSize={30}
              minSize={3}
              maxSize={95}
              collapsible={false}
            >
              <SchemaPanel
                onTableSelect={handleTableSelect}
                selectedTable={selectedTable}
                panelSize={schemaPanelSize}
                onPanelSizeChange={handleSchemaPanelSizeChange}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

            {/* Query Editor and Results Panel */}
            <Panel defaultSize={aiChatOpen ? 50 : 70} minSize={5}>
              <QueryPanel
                onSqlInsert={(handler) => setInsertSqlHandler(() => handler)}
                onTableContextChange={(context) => {
                  if (context?.type === 'table') {
                    updateSelectedTable({ schema: context.schema, table: context.table });
                  } else {
                    updateSelectedTable(null);
                  }
                }}
                tablePreviewLimit={tablePreviewLimit}
                editingEnabled={settings.editingEnabled}
              />
            </Panel>

            {/* AI Chat Panel */}
            {aiChatOpen && (
              <>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />
                <Panel defaultSize={30} minSize={20} maxSize={50}>
                  <AiChat
                    onOpenSettings={() => setSettingsOpen(true)}
                    onSelectRow={async (match: EmbeddingSearchMatch) => {
                      const activeConnection = getActiveConnection();
                      // Build WHERE clause from metadata to find the exact row
                      const metadata = match.metadata;
                      const conditions: string[] = [];
                      
                      // Helper to quote identifiers
                      const quoteId = (id: string) => `"${id.replace(/"/g, '""')}"`;
                      
                      // Helper to escape SQL values
                      const escapeValue = (value: any): string => {
                        if (value === null || value === undefined) {
                          return 'NULL';
                        }
                        if (typeof value === 'string') {
                          return `'${value.replace(/'/g, "''")}'`;
                        }
                        if (typeof value === 'number') {
                          return String(value);
                        }
                        if (typeof value === 'boolean') {
                          return value ? 'TRUE' : 'FALSE';
                        }
                        // For arrays/objects, convert to JSON string
                        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
                      };
                      
                      // Use metadata to build WHERE conditions
                      // Use ALL non-null columns from metadata to uniquely identify the row
                      if (metadata && typeof metadata === 'object') {
                        // Get primary keys to prioritize them, but use all non-null columns
                        let primaryKeys: string[] = [];
                        try {
                          const connectionId = activeConnection?.connectionId;
                          if (connectionId) {
                            primaryKeys = await invoke<string[]>('get_primary_keys', {
                              connectionId,
                              schema: match.schema,
                              table: match.table,
                            });
                          }
                        } catch (error) {
                          console.warn('Failed to get primary keys, using all columns:', error);
                        }
                        
                        // Collect all non-null values from metadata
                        const allMetadataEntries = Object.entries(metadata).filter(
                          ([_, value]) => value !== null && value !== undefined
                        );
                        
                        // Sort to put primary keys first if available
                        const sortedEntries = allMetadataEntries.sort(([keyA], [keyB]) => {
                          const aIsPk = primaryKeys.includes(keyA);
                          const bIsPk = primaryKeys.includes(keyB);
                          if (aIsPk && !bIsPk) return -1;
                          if (!aIsPk && bIsPk) return 1;
                          return 0;
                        });
                        
                        // Use all non-null columns to build WHERE clause
                        // This ensures we match the exact row even if primary keys aren't in metadata
                        sortedEntries.forEach(([key, value]) => {
                          conditions.push(`${quoteId(key)} = ${escapeValue(value)}`);
                        });
                      }
                      
                      // Build SQL query - ALWAYS use conditions if we have metadata
                      // This ensures we show only the specific row
                      let sql: string;
                      if (conditions.length > 0) {
                        // Use conditions to show only the specific row (no LIMIT needed)
                        sql = `SELECT * FROM ${quoteId(match.schema)}.${quoteId(match.table)} WHERE ${conditions.join(' AND ')};`;
                        console.log('[RowSelection] Generated SQL:', sql);
                        console.log('[RowSelection] Conditions:', conditions);
                        console.log('[RowSelection] Metadata:', metadata);
                      } else {
                        // Fallback: if no metadata, show table with limit
                        console.warn('[RowSelection] No conditions found, falling back to table view');
                        sql = `SELECT * FROM ${quoteId(match.schema)}.${quoteId(match.table)} LIMIT 100;`;
                      }
                      
                      if (insertSqlHandler) {
                        // Don't set table context when showing a specific row
                        // This prevents QueryPanel from overriding our SQL
                        insertSqlHandler(sql, {
                          execute: true,
                          replace: true,
                          tabName: `${match.schema}.${match.table} (Row)`,
                          // Don't set context - let it be a SQL tab, not a table tab
                        });
                      }
                    }}
                    onExecuteSql={(sql: string) => {
                      if (insertSqlHandler) {
                        insertSqlHandler(sql, {
                          execute: true,
                          replace: true, // Clear existing SQL and replace with new
                        });
                      }
                    }}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>
      <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Connection Dialog - Supports both PostgreSQL and S3 */}
      <ConnectionDialog
        open={isConnectionFormOpen}
        onOpenChange={setIsConnectionFormOpen}
        onSuccess={handleConnectionFormSuccess}
        editingProfile={editingProfile}
      />

      <Toaster />
    </>
  );
}

function App() {
  // Initialize theme (handles localStorage and applies theme class)
  useTheme();

  return (
    <SettingsProvider>
      <DatabaseProvider>
        <CommandProvider>
          <AppContent />
        </CommandProvider>
      </DatabaseProvider>
    </SettingsProvider>
  );
}

export default App;
