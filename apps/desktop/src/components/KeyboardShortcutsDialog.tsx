import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';

interface ShortcutItem {
  category: string;
  shortcuts: {
    keys: string;
    description: string;
  }[];
}

const shortcuts: ShortcutItem[] = [
  {
    category: 'General',
    shortcuts: [
      { keys: '⌘K / Ctrl+K', description: 'Open command palette' },
      { keys: 'Esc', description: 'Close command palette' },
      { keys: '↑ ↓', description: 'Navigate commands' },
      { keys: 'Enter', description: 'Execute selected command' },
    ],
  },
  {
    category: 'Query',
    shortcuts: [
      { keys: '⌘Enter / Ctrl+Enter', description: 'Run query' },
      { keys: '⌥⌘F / Alt+Ctrl+F', description: 'Format SQL' },
      { keys: '⌘T / Ctrl+T', description: 'New query tab' },
      { keys: '⌘W / Ctrl+W', description: 'Close query tab' },
    ],
  },
  {
    category: 'Navigation',
    shortcuts: [
      { keys: '⌘1 / Ctrl+1', description: 'Focus connections panel' },
      { keys: '⌘2 / Ctrl+2', description: 'Focus schema browser' },
      { keys: '⌘3 / Ctrl+3', description: 'Focus query editor' },
    ],
  },
  {
    category: 'Connection',
    shortcuts: [
      { keys: '⌘D / Ctrl+D', description: 'Disconnect active connection' },
      { keys: '⌘N / Ctrl+N', description: 'New connection' },
    ],
  },
  {
    category: 'Export',
    shortcuts: [
      { keys: '⌘E / Ctrl+E', description: 'Export to CSV' },
      { keys: '⌘J / Ctrl+J', description: 'Export to JSON' },
      { keys: '⌘C / Ctrl+C', description: 'Copy results' },
    ],
  },
  {
    category: 'Help',
    shortcuts: [
      { keys: '⇧⌘M / Shift+Ctrl+M', description: 'Show MCP Server info' },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Master RowFlow with these keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <kbd className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono font-medium text-foreground shadow-sm">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">⌘K</kbd> or{' '}
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">Ctrl+K</kbd> to open the
            command palette anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
