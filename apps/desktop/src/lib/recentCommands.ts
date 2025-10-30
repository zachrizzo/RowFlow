const RECENT_COMMANDS_KEY = 'rowflow_recent_commands';
const MAX_RECENT_COMMANDS = 10;

export interface RecentCommand {
  commandId: string;
  timestamp: number;
}

export class RecentCommandsManager {
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  addCommand(commandId: string): void {
    const recent = this.getRecentCommands();

    // Remove existing entry if present
    const filtered = recent.filter(cmd => cmd.commandId !== commandId);

    // Add new entry at the beginning
    filtered.unshift({
      commandId,
      timestamp: Date.now(),
    });

    // Keep only the most recent commands
    const limited = filtered.slice(0, MAX_RECENT_COMMANDS);

    this.saveRecentCommands(limited);
  }

  getRecentCommands(): RecentCommand[] {
    try {
      const stored = this.storage.getItem(RECENT_COMMANDS_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed;
    } catch (error) {
      console.error('Failed to load recent commands:', error);
      return [];
    }
  }

  getRecentCommandIds(): string[] {
    return this.getRecentCommands().map(cmd => cmd.commandId);
  }

  clearRecentCommands(): void {
    this.storage.removeItem(RECENT_COMMANDS_KEY);
  }

  private saveRecentCommands(commands: RecentCommand[]): void {
    try {
      this.storage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(commands));
    } catch (error) {
      console.error('Failed to save recent commands:', error);
    }
  }
}

export const recentCommandsManager = new RecentCommandsManager();
