import { useEffect, useState, useCallback } from 'react';
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

function AppContent() {
  // Initialize command palette keyboard listener
  useCommandPalette();

  const [insertSqlCallback, setInsertSqlCallback] = useState<((sql: string) => void) | null>(null);

  const handleTableSelect = useCallback((schema: string, table: string) => {
    // Generate a SELECT statement for the selected table
    const query = `SELECT * FROM ${schema}.${table} LIMIT 100;`;
    if (insertSqlCallback) {
      insertSqlCallback(query);
    }
  }, [insertSqlCallback]);

  return (
    <>
      <div className="h-screen w-screen overflow-hidden bg-background">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left Panel: Connections */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={35}
            className="min-w-[200px]"
          >
            <ConnectionsPanel />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

          {/* Middle Panel: Schema Browser */}
          <Panel
            defaultSize={25}
            minSize={20}
            maxSize={40}
            className="min-w-[250px]"
          >
            <SchemaPanel onTableSelect={handleTableSelect} />
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

          {/* Right Panel: Query Editor and Results */}
          <Panel defaultSize={55} minSize={30}>
            <QueryPanel onSqlInsert={setInsertSqlCallback} />
          </Panel>
        </PanelGroup>
      </div>
      <CommandPalette />
      <Toaster />
    </>
  );
}

function App() {
  useEffect(() => {
    // Apply dark mode by default
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <DatabaseProvider>
      <CommandProvider>
        <AppContent />
      </CommandProvider>
    </DatabaseProvider>
  );
}

export default App;
