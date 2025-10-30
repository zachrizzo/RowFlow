import { useEffect } from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { SchemaPanel } from '@/components/SchemaPanel';
import { QueryPanel } from '@/components/QueryPanel';

function App() {
  useEffect(() => {
    // Apply dark mode by default
    document.documentElement.classList.add('dark');
  }, []);

  return (
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
          <SchemaPanel />
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary" />

        {/* Right Panel: Query Editor and Results */}
        <Panel defaultSize={55} minSize={30}>
          <QueryPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default App;
