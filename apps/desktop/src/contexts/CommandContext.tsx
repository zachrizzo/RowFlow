import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Command, commandRegistry } from '@/lib/commands';
import { recentCommandsManager } from '@/lib/recentCommands';

interface CommandContextType {
  isOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  registerCommand: (command: Command) => void;
  registerCommands: (commands: Command[]) => void;
  unregisterCommand: (commandId: string) => void;
  executeCommand: (commandId: string) => Promise<void>;
  getAllCommands: () => Command[];
  getAvailableCommands: () => Command[];
  getRecentCommandIds: () => string[];
  clearRecentCommands: () => void;
}

const CommandContext = createContext<CommandContextType | undefined>(undefined);

interface CommandProviderProps {
  children: ReactNode;
}

export function CommandProvider({ children }: CommandProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  // Subscribe to command registry changes
  useEffect(() => {
    const unsubscribe = commandRegistry.subscribe(() => {
      forceUpdate(prev => prev + 1);
    });
    return unsubscribe;
  }, []);

  const openCommandPalette = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const registerCommand = useCallback((command: Command) => {
    commandRegistry.register(command);
  }, []);

  const registerCommands = useCallback((commands: Command[]) => {
    commandRegistry.registerMultiple(commands);
  }, []);

  const unregisterCommand = useCallback((commandId: string) => {
    commandRegistry.unregister(commandId);
  }, []);

  const executeCommand = useCallback(async (commandId: string) => {
    const command = commandRegistry.getCommand(commandId);
    if (!command) {
      console.warn(`Command not found: ${commandId}`);
      return;
    }

    // Check if command is enabled
    if (command.enabled && !command.enabled()) {
      console.warn(`Command is disabled: ${commandId}`);
      return;
    }

    try {
      // Add to recent commands
      recentCommandsManager.addCommand(commandId);

      // Execute the command
      await command.action();

      // Close the palette after execution
      closeCommandPalette();
    } catch (error) {
      console.error(`Failed to execute command ${commandId}:`, error);
      throw error;
    }
  }, [closeCommandPalette]);

  const getAllCommands = useCallback(() => {
    return commandRegistry.getAllCommands();
  }, []);

  const getAvailableCommands = useCallback(() => {
    return commandRegistry.getAvailableCommands();
  }, []);

  const getRecentCommandIds = useCallback(() => {
    return recentCommandsManager.getRecentCommandIds();
  }, []);

  const clearRecentCommands = useCallback(() => {
    recentCommandsManager.clearRecentCommands();
    forceUpdate(prev => prev + 1);
  }, []);

  const value: CommandContextType = {
    isOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    registerCommand,
    registerCommands,
    unregisterCommand,
    executeCommand,
    getAllCommands,
    getAvailableCommands,
    getRecentCommandIds,
    clearRecentCommands,
  };

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  );
}

export function useCommands() {
  const context = useContext(CommandContext);
  if (context === undefined) {
    throw new Error('useCommands must be used within a CommandProvider');
  }
  return context;
}
