import { useState, useEffect } from 'react';
import { Plus, Server, Settings, Database, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isMcpServerBuilt } from '@/lib/mcpConfig';

interface HeaderProps {
  onNewConnection: () => void;
  onOpenMcpDialog: () => void;
  onOpenSettings: () => void;
  onToggleConnections?: () => void;
  connectionsOpen?: boolean;
}

export function Header({ onNewConnection, onOpenMcpDialog, onOpenSettings, onToggleConnections, connectionsOpen = false }: HeaderProps) {
  const [mcpServerBuilt, setMcpServerBuilt] = useState(false);

  // Check MCP server build status
  useEffect(() => {
    const checkMcpStatus = async () => {
      const isBuilt = await isMcpServerBuilt();
      setMcpServerBuilt(isBuilt);
    };
    checkMcpStatus();
  }, []);

  return (
    <header className="h-12 border-b bg-background flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        {/* Connections Toggle Button */}
        {onToggleConnections && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggleConnections}
            className="h-8 w-8"
            title={connectionsOpen ? 'Hide Connections' : 'Show Connections'}
          >
            {connectionsOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Database className="h-4 w-4" />
            )}
          </Button>
        )}
        <h1 className="text-lg font-semibold">RowFlow</h1>
      </div>
      <div className="flex items-center gap-2">
        {/* Add Connection Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onNewConnection}
          className="h-8"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Connection
        </Button>

        {/* MCP Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenMcpDialog}
          className="h-8 px-2"
        >
          <Badge
            variant={mcpServerBuilt ? 'default' : 'outline'}
            className="flex items-center gap-1 cursor-pointer hover:opacity-80"
          >
            <div
              className={`h-2 w-2 rounded-full ${
                mcpServerBuilt ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <Server className="h-3 w-3" />
            <span className="text-xs">MCP</span>
          </Badge>
        </Button>

        {/* Settings Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={onOpenSettings}
          className="h-8 w-8"
          title="Settings (⌘,)"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

