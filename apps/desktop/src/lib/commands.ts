import { LucideIcon } from 'lucide-react';

export type CommandCategory =
  | 'connection'
  | 'query'
  | 'schema'
  | 'export'
  | 'view'
  | 'navigation'
  | 'help';

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string[];
  category: CommandCategory;
  action: () => void | Promise<void>;
  enabled?: () => boolean;
  keywords?: string[];
}

export interface CommandGroup {
  category: CommandCategory;
  label: string;
  commands: Command[];
}

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private listeners: Set<() => void> = new Set();

  register(command: Command): void {
    this.commands.set(command.id, command);
    this.notifyListeners();
  }

  registerMultiple(commands: Command[]): void {
    commands.forEach(command => {
      this.commands.set(command.id, command);
    });
    this.notifyListeners();
  }

  unregister(commandId: string): void {
    this.commands.delete(commandId);
    this.notifyListeners();
  }

  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getAvailableCommands(): Command[] {
    return this.getAllCommands().filter(command => {
      if (!command.enabled) return true;
      return command.enabled();
    });
  }

  getCommandsByCategory(category: CommandCategory): Command[] {
    return this.getAllCommands().filter(command => command.category === category);
  }

  getGroupedCommands(): CommandGroup[] {
    const categoryLabels: Record<CommandCategory, string> = {
      connection: 'Connection',
      query: 'Query',
      schema: 'Schema',
      export: 'Export',
      view: 'View',
      navigation: 'Navigation',
      help: 'Help',
    };

    const groups: CommandGroup[] = [];
    const categories: CommandCategory[] = [
      'connection',
      'query',
      'schema',
      'export',
      'view',
      'navigation',
      'help',
    ];

    categories.forEach(category => {
      const commands = this.getAvailableCommands().filter(
        cmd => cmd.category === category
      );
      if (commands.length > 0) {
        groups.push({
          category,
          label: categoryLabels[category],
          commands,
        });
      }
    });

    return groups;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  clear(): void {
    this.commands.clear();
    this.notifyListeners();
  }
}

export const commandRegistry = new CommandRegistry();
