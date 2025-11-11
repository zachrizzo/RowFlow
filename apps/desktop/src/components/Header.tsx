import { Plus, Settings, Database, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onNewConnection: () => void;
  onOpenSettings: () => void;
  onToggleConnections?: () => void;
  connectionsOpen?: boolean;
  onToggleAiChat?: () => void;
  aiChatOpen?: boolean;
}

export function Header({ onNewConnection, onOpenSettings, onToggleConnections, connectionsOpen = false, onToggleAiChat, aiChatOpen = false }: HeaderProps) {

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
        {/* AI Chat Toggle Button */}
        {onToggleAiChat && (
          <Button
            size="icon"
            variant={aiChatOpen ? "default" : "ghost"}
            onClick={onToggleAiChat}
            className="h-8 w-8"
            title={aiChatOpen ? 'Hide AI Chat' : 'Show AI Chat'}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
        
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

