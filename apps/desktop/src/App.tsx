import { useState, useCallback, useRef } from 'react';
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
import { ConnectionForm } from '@/components/ConnectionForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';
import type { StoredProfile } from '@/types/connection';
import { generateSelectQuery } from '@/lib/sqlPlaceholders';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';

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

  const handleConnectionFormCancel = () => {
    setIsConnectionFormOpen(false);
    setEditingProfile(undefined);
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

        {/* Overlay when schema panel is expanded */}
        {schemaPanelSize === 'expanded' && (
          <div
            className="fixed inset-0 bg-black/10 z-20 top-12"
            onClick={() => handleSchemaPanelSizeChange('normal')}
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
              />
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

            {/* Query Editor and Results Panel */}
            <Panel defaultSize={70} minSize={5}>
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
          </PanelGroup>
        </div>
      </div>
      <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} />
      
      {/* Connection Form Dialog */}
      <Dialog open={isConnectionFormOpen} onOpenChange={setIsConnectionFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Edit Connection' : 'New Connection'}
            </DialogTitle>
          </DialogHeader>
          <ConnectionForm
            profile={editingProfile}
            onSuccess={handleConnectionFormSuccess}
            onCancel={handleConnectionFormCancel}
          />
        </DialogContent>
      </Dialog>
      
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
