import { useState, useCallback } from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { SchemaPanel } from '@/components/SchemaPanel';
import { QueryPanel } from '@/components/QueryPanel';
import { DatabaseProvider } from '@/contexts/DatabaseContext';
import { CommandProvider } from '@/contexts/CommandContext';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { Toaster } from '@/components/ui/toaster';
import { Settings } from '@/components/Settings';
import { Header } from '@/components/Header';
import { ConnectionForm } from '@/components/ConnectionForm';
import { McpInfoDialog } from '@/components/McpInfoDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';
import type { StoredProfile } from '@/types/connection';

function AppContent() {
  // Initialize command palette keyboard listener
  useCommandPalette();

  const [insertSqlCallback, setInsertSqlCallback] = useState<((sql: string) => void) | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isConnectionFormOpen, setIsConnectionFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StoredProfile | undefined>();
  const [isMcpDialogOpen, setIsMcpDialogOpen] = useState(false);
  const [connectionsSidebarOpen, setConnectionsSidebarOpen] = useState(false);

  const handleTableSelect = useCallback((schema: string, table: string) => {
    // Generate a SELECT statement for the selected table
    const query = `SELECT * FROM ${schema}.${table} LIMIT 100;`;
    if (insertSqlCallback) {
      insertSqlCallback(query);
    }
  }, [insertSqlCallback]);

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
          onOpenMcpDialog={() => setIsMcpDialogOpen(true)}
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

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Schema Browser Panel */}
            <Panel
              defaultSize={30}
              minSize={25}
              maxSize={50}
              className="min-w-[250px]"
            >
              <SchemaPanel onTableSelect={handleTableSelect} />
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

            {/* Query Editor and Results Panel */}
            <Panel defaultSize={70} minSize={50}>
              <QueryPanel onSqlInsert={setInsertSqlCallback} />
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

      {/* MCP Info Dialog */}
      <McpInfoDialog open={isMcpDialogOpen} onOpenChange={setIsMcpDialogOpen} />
      
      <Toaster />
    </>
  );
}

function App() {
  // Initialize theme (handles localStorage and applies theme class)
  useTheme();

  return (
    <DatabaseProvider>
      <CommandProvider>
        <AppContent />
      </CommandProvider>
    </DatabaseProvider>
  );
}

export default App;
