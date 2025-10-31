import { useEffect, useState, useCallback, useMemo, useContext } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Database,
  PlayCircle,
  XCircle,
  FileCode,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Search,
  FileText,
  Download,
  Copy,
  Eye,
  Navigation,
  Keyboard,
  Clock,
  Trash2,
  Server,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useCommands } from '@/contexts/CommandContext';
import { DatabaseContext } from '@/contexts/DatabaseContext';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { McpInfoDialog } from './McpInfoDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Command } from '@/lib/commands';

const categoryColors = {
  connection: 'text-blue-400',
  query: 'text-green-400',
  schema: 'text-purple-400',
  export: 'text-yellow-400',
  view: 'text-orange-400',
  navigation: 'text-cyan-400',
  help: 'text-pink-400',
};

export interface CommandPaletteProps {
  onOpenSettings?: () => void;
}

export function CommandPalette({ onOpenSettings }: CommandPaletteProps = {}) {
  const {
    isOpen,
    closeCommandPalette,
    executeCommand,
    getAvailableCommands,
    getRecentCommandIds,
    clearRecentCommands,
    registerCommands,
  } = useCommands();

  const databaseContext = useContext(DatabaseContext);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMcpInfo, setShowMcpInfo] = useState(false);

  // Get all available commands
  const commands = useMemo(() => getAvailableCommands(), [getAvailableCommands]);

  // Get recent command IDs
  const recentCommandIds = useMemo(() => getRecentCommandIds(), [getRecentCommandIds]);

  // Filter recent commands
  const recentCommands = useMemo(() => {
    return recentCommandIds
      .map(id => commands.find(cmd => cmd.id === id))
      .filter((cmd): cmd is NonNullable<typeof cmd> => cmd !== undefined)
      .slice(0, 5);
  }, [recentCommandIds, commands]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};

    if (commands) {
      commands.forEach(command => {
        if (!groups[command.category]) {
          groups[command.category] = [];
        }
        groups[command.category]?.push(command);
      });
    }

    return groups;
  }, [commands]);

  // Register all commands
  useEffect(() => {
    if (!databaseContext) return;

    const {
      profiles,
      connectToProfile,
      disconnectFromProfile,
      getActiveConnection,
    } = databaseContext;

    const activeConnection = getActiveConnection();

    const allCommands: Command[] = [
      // Connection Commands
      {
        id: 'connect-to',
        label: 'Connect to Database...',
        description: 'Choose a connection profile',
        icon: Database,
        category: 'connection' as const,
        shortcut: ['⌘', 'O'],
        action: () => {
          // This would open a connection picker
          toast({
            title: 'Connection Picker',
            description: 'Connection picker functionality would go here',
          });
        },
      },
      {
        id: 'disconnect',
        label: 'Disconnect',
        description: 'Disconnect from active database',
        icon: XCircle,
        category: 'connection' as const,
        shortcut: ['⌘', 'D'],
        action: async () => {
          if (activeConnection?.connectionId) {
            await disconnectFromProfile(activeConnection.connectionId);
          }
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'new-connection',
        label: 'New Connection',
        description: 'Create a new connection profile',
        icon: PlusCircle,
        category: 'connection' as const,
        shortcut: ['⌘', 'N'],
        action: () => {
          toast({
            title: 'New Connection',
            description: 'New connection form would open here',
          });
        },
      },
      {
        id: 'switch-database',
        label: 'Switch Database',
        description: 'Quick database switcher',
        icon: RefreshCw,
        category: 'connection' as const,
        action: () => {
          toast({
            title: 'Database Switcher',
            description: 'Database switcher would open here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },

      // Query Commands
      {
        id: 'run-query',
        label: 'Run Query',
        description: 'Execute the active query',
        icon: PlayCircle,
        category: 'query' as const,
        shortcut: ['⌘', 'Enter'],
        action: () => {
          toast({
            title: 'Run Query',
            description: 'Query execution functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'cancel-query',
        label: 'Cancel Query',
        description: 'Cancel the running query',
        icon: XCircle,
        category: 'query' as const,
        action: () => {
          toast({
            title: 'Cancel Query',
            description: 'Query cancellation functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'format-sql',
        label: 'Format SQL',
        description: 'Format the current query',
        icon: FileCode,
        category: 'query' as const,
        shortcut: ['⌥', '⌘', 'F'],
        action: () => {
          toast({
            title: 'Format SQL',
            description: 'SQL formatting functionality would go here',
          });
        },
      },
      {
        id: 'new-query-tab',
        label: 'New Query Tab',
        description: 'Create a new query tab',
        icon: PlusCircle,
        category: 'query' as const,
        shortcut: ['⌘', 'T'],
        action: () => {
          toast({
            title: 'New Query Tab',
            description: 'New tab functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'close-query-tab',
        label: 'Close Query Tab',
        description: 'Close the active query tab',
        icon: MinusCircle,
        category: 'query' as const,
        shortcut: ['⌘', 'W'],
        action: () => {
          toast({
            title: 'Close Query Tab',
            description: 'Close tab functionality would go here',
          });
        },
      },
      {
        id: 'clear-editor',
        label: 'Clear Editor',
        description: 'Clear the SQL editor',
        icon: Trash2,
        category: 'query' as const,
        action: () => {
          toast({
            title: 'Clear Editor',
            description: 'Clear editor functionality would go here',
          });
        },
      },

      // Schema Commands
      {
        id: 'refresh-schema',
        label: 'Refresh Schema',
        description: 'Re-fetch the database schema',
        icon: RefreshCw,
        category: 'schema' as const,
        action: () => {
          toast({
            title: 'Refresh Schema',
            description: 'Schema refresh functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'find-table',
        label: 'Find Table...',
        description: 'Search for a table in the schema',
        icon: Search,
        category: 'schema' as const,
        action: () => {
          toast({
            title: 'Find Table',
            description: 'Table search functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'sample-table',
        label: 'Sample Table',
        description: 'Sample the selected table',
        icon: FileText,
        category: 'schema' as const,
        action: () => {
          toast({
            title: 'Sample Table',
            description: 'Table sampling functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'copy-table-name',
        label: 'Copy Table Name',
        description: 'Copy the selected table name',
        icon: Copy,
        category: 'schema' as const,
        action: () => {
          toast({
            title: 'Copy Table Name',
            description: 'Copy functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },

      // Export Commands
      {
        id: 'export-csv',
        label: 'Export to CSV',
        description: 'Export query results to CSV',
        icon: Download,
        category: 'export' as const,
        shortcut: ['⌘', 'E'],
        action: () => {
          toast({
            title: 'Export to CSV',
            description: 'CSV export functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'export-json',
        label: 'Export to JSON',
        description: 'Export query results to JSON',
        icon: Download,
        category: 'export' as const,
        shortcut: ['⌘', 'J'],
        action: () => {
          toast({
            title: 'Export to JSON',
            description: 'JSON export functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },
      {
        id: 'copy-results',
        label: 'Copy Results',
        description: 'Copy query results to clipboard',
        icon: Copy,
        category: 'export' as const,
        action: () => {
          toast({
            title: 'Copy Results',
            description: 'Copy functionality would go here',
          });
        },
        enabled: () => !!activeConnection?.connectionId,
      },

      // View Commands
      {
        id: 'toggle-readonly',
        label: 'Toggle Read-only Mode',
        description: 'Toggle database read-only mode',
        icon: Eye,
        category: 'view' as const,
        action: () => {
          toast({
            title: 'Toggle Read-only Mode',
            description: 'Read-only mode toggle would go here',
          });
        },
      },
      {
        id: 'show-query-history',
        label: 'Show Query History',
        description: 'View query execution history',
        icon: Clock,
        category: 'view' as const,
        action: () => {
          toast({
            title: 'Query History',
            description: 'Query history panel would open here',
          });
        },
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        description: 'Open application settings',
        icon: SettingsIcon,
        category: 'view' as const,
        shortcut: ['⌘', ','],
        action: () => {
          closeCommandPalette();
          onOpenSettings?.();
        },
      },

      // Navigation Commands
      {
        id: 'focus-editor',
        label: 'Focus Editor',
        description: 'Focus the SQL editor',
        icon: Navigation,
        category: 'navigation' as const,
        shortcut: ['⌘', '3'],
        action: () => {
          toast({
            title: 'Focus Editor',
            description: 'Focus editor functionality would go here',
          });
        },
      },
      {
        id: 'focus-schema',
        label: 'Focus Schema Browser',
        description: 'Focus the schema tree',
        icon: Navigation,
        category: 'navigation' as const,
        shortcut: ['⌘', '2'],
        action: () => {
          toast({
            title: 'Focus Schema Browser',
            description: 'Focus schema browser functionality would go here',
          });
        },
      },
      {
        id: 'focus-connections',
        label: 'Focus Connections',
        description: 'Focus the connections panel',
        icon: Navigation,
        category: 'navigation' as const,
        shortcut: ['⌘', '1'],
        action: () => {
          toast({
            title: 'Focus Connections',
            description: 'Focus connections panel functionality would go here',
          });
        },
      },

      // Help Commands
      {
        id: 'show-shortcuts',
        label: 'Show Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: Keyboard,
        category: 'help' as const,
        shortcut: ['⌘', '?'],
        action: () => {
          setShowShortcuts(true);
        },
      },
      {
        id: 'show-mcp-info',
        label: 'Show MCP Server Info',
        description: 'View MCP server details and setup',
        icon: Server,
        category: 'help' as const,
        shortcut: ['⇧', '⌘', 'M'],
        action: () => {
          setShowMcpInfo(true);
        },
      },
      {
        id: 'clear-recent',
        label: 'Clear Recent Commands',
        description: 'Clear command history',
        icon: Trash2,
        category: 'help' as const,
        action: () => {
          clearRecentCommands();
          toast({
            title: 'Recent Commands Cleared',
            description: 'Command history has been cleared',
          });
        },
      },
    ];

    // Add dynamic commands for each profile
    profiles.forEach(profile => {
      allCommands.push({
        id: `connect-to-${profile.id}`,
        label: `Connect to ${profile.name}`,
        description: `${profile.host}:${profile.port}/${profile.database}`,
        icon: Database,
        category: 'connection' as const,
        action: async () => {
          await connectToProfile(profile);
        },
      });
    });

    registerCommands(allCommands);
  }, [databaseContext, registerCommands, toast, clearRecentCommands, closeCommandPalette, onOpenSettings]);

  const handleSelect = useCallback(
    (commandId: string) => {
      executeCommand(commandId).catch((error) => {
        console.error('Command execution failed:', error);
        toast({
          title: 'Command Failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      });
    },
    [executeCommand, toast]
  );

  const handleEscape = useCallback(() => {
    closeCommandPalette();
  }, [closeCommandPalette]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  return (
    <>
      <CommandPrimitive.Dialog
        open={isOpen}
        onOpenChange={closeCommandPalette}
        label="Command Palette"
        className="fixed top-0 left-0 right-0 bottom-0 z-50"
      >
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={closeCommandPalette}
        />
        <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-2xl">
          <CommandPrimitive
            className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleEscape();
              }
            }}
          >
            <CommandPrimitive.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or search..."
              className="h-12 px-4 text-base border-b border-border/50"
            />
            <CommandPrimitive.List className="max-h-[400px] overflow-y-auto p-2">
              <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
                No commands found.
              </CommandPrimitive.Empty>

              {recentCommands.length > 0 && (
                <CommandPrimitive.Group
                  heading="Recent"
                  className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {recentCommands.map((command) => {
                    const Icon = command.icon;
                    return (
                      <CommandPrimitive.Item
                        key={command.id}
                        value={command.id}
                        onSelect={handleSelect}
                        className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-accent/50 data-[selected=true]:text-accent-foreground hover:bg-accent/30 transition-colors"
                      >
                        <Icon className={cn('h-4 w-4', categoryColors[command.category])} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{command.label}</div>
                          {command.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {command.description}
                            </div>
                          )}
                        </div>
                        {command.shortcut && (
                          <div className="flex items-center gap-1">
                            {command.shortcut.map((key, idx) => (
                              <kbd
                                key={idx}
                                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-mono font-medium text-muted-foreground"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                      </CommandPrimitive.Item>
                    );
                  })}
                </CommandPrimitive.Group>
              )}

              {Object.entries(groupedCommands).map(([category, categoryCommands]) => {
                const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

                return (
                  <CommandPrimitive.Group
                    key={category}
                    heading={categoryLabel}
                    className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {categoryCommands.map((command) => {
                      const Icon = command.icon;
                      return (
                        <CommandPrimitive.Item
                          key={command.id}
                          value={`${command.id} ${command.label} ${command.description || ''}`}
                          onSelect={() => handleSelect(command.id)}
                          className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-accent/50 data-[selected=true]:text-accent-foreground hover:bg-accent/30 transition-colors"
                        >
                          <Icon className={cn('h-4 w-4', categoryColors[command.category])} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{command.label}</div>
                            {command.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {command.description}
                              </div>
                            )}
                          </div>
                          {command.shortcut && (
                            <div className="flex items-center gap-1">
                              {command.shortcut.map((key, idx) => (
                                <kbd
                                  key={idx}
                                  className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-mono font-medium text-muted-foreground"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </div>
                          )}
                        </CommandPrimitive.Item>
                      );
                    })}
                  </CommandPrimitive.Group>
                );
              })}
            </CommandPrimitive.List>

            <div className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-background border border-border">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-background border border-border">Enter</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-background border border-border">Esc</kbd>
                  Close
                </span>
              </div>
              <span className="text-muted-foreground/70">
                {commands.length} commands available
              </span>
            </div>
          </CommandPrimitive>
        </div>
      </CommandPrimitive.Dialog>

      <KeyboardShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
      <McpInfoDialog open={showMcpInfo} onOpenChange={setShowMcpInfo} />
    </>
  );
}
