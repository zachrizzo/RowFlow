/**
 * Example: How to Register Custom Commands
 *
 * This file demonstrates various ways to register commands in the RowFlow command palette.
 * Use these patterns in your own components to add custom functionality.
 */

import { useEffect } from 'react';
import { useCommands } from '@/contexts/CommandContext';
import {
  Database,
  PlayCircle,
  RefreshCw,
  FileCode,
  Download,
  Eye,
  Navigation,
  Keyboard,
  Search,
  Settings,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function CustomCommandsExample() {
  const { registerCommand, registerCommands, unregisterCommand } = useCommands();
  const { toast } = useToast();

  useEffect(() => {
    // Example 1: Simple Command
    registerCommand({
      id: 'example-simple',
      label: 'Simple Command',
      description: 'A basic command example',
      icon: Zap,
      category: 'help',
      action: () => {
        toast({
          title: 'Simple Command',
          description: 'This is a simple command',
        });
      },
    });

    // Example 2: Command with Keyboard Shortcut
    registerCommand({
      id: 'example-shortcut',
      label: 'Command with Shortcut',
      description: 'Press ⌘Shift+E to execute',
      icon: Keyboard,
      category: 'help',
      shortcut: ['⌘', 'Shift', 'E'],
      action: () => {
        toast({
          title: 'Shortcut Command',
          description: 'You executed this with a keyboard shortcut!',
        });
      },
    });

    // Example 3: Async Command
    registerCommand({
      id: 'example-async',
      label: 'Async Operation',
      description: 'Performs an async operation',
      icon: RefreshCw,
      category: 'query',
      action: async () => {
        try {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 1000));

          toast({
            title: 'Success',
            description: 'Async operation completed',
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      },
    });

    // Example 4: Conditional Command
    const isFeatureEnabled = true; // Replace with actual condition

    registerCommand({
      id: 'example-conditional',
      label: 'Conditional Command',
      description: 'Only available when feature is enabled',
      icon: Settings,
      category: 'view',
      action: () => {
        toast({
          title: 'Conditional Command',
          description: 'This command was conditionally enabled',
        });
      },
      enabled: () => isFeatureEnabled,
    });

    // Example 5: Register Multiple Commands at Once
    const multipleCommands = [
      {
        id: 'example-batch-1',
        label: 'Batch Command 1',
        icon: FileCode,
        category: 'query' as const,
        action: () => console.log('Batch 1'),
      },
      {
        id: 'example-batch-2',
        label: 'Batch Command 2',
        icon: Download,
        category: 'export' as const,
        action: () => console.log('Batch 2'),
      },
      {
        id: 'example-batch-3',
        label: 'Batch Command 3',
        icon: Search,
        category: 'schema' as const,
        action: () => console.log('Batch 3'),
      },
    ];

    registerCommands(multipleCommands);

    // Example 6: Dynamic Commands from Data
    const items = ['Item 1', 'Item 2', 'Item 3'];

    items.forEach((item, index) => {
      registerCommand({
        id: `example-dynamic-${index}`,
        label: `Process ${item}`,
        description: `Dynamically generated command for ${item}`,
        icon: PlayCircle,
        category: 'query',
        action: () => {
          toast({
            title: 'Dynamic Command',
            description: `Processing ${item}`,
          });
        },
      });
    });

    // Example 7: Command with State
    let counter = 0;

    registerCommand({
      id: 'example-stateful',
      label: 'Increment Counter',
      description: `Current count: ${counter}`,
      icon: Database,
      category: 'help',
      action: () => {
        counter++;
        toast({
          title: 'Counter Incremented',
          description: `New count: ${counter}`,
        });
      },
    });

    // Example 8: Navigation Command
    registerCommand({
      id: 'example-navigation',
      label: 'Navigate to Section',
      description: 'Navigate to a specific section',
      icon: Navigation,
      category: 'navigation',
      action: () => {
        // Implement navigation logic
        console.log('Navigating to section...');
        toast({
          title: 'Navigation',
          description: 'Navigated to section',
        });
      },
    });

    // Example 9: Command with Error Handling
    registerCommand({
      id: 'example-error-handling',
      label: 'Command with Error',
      description: 'Demonstrates error handling',
      icon: Eye,
      category: 'view',
      action: async () => {
        try {
          // Simulate an error
          throw new Error('Something went wrong!');
        } catch (error) {
          toast({
            title: 'Error Occurred',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
          // Re-throw to prevent command palette from closing
          throw error;
        }
      },
    });

    // Cleanup: Unregister commands when component unmounts
    return () => {
      unregisterCommand('example-simple');
      unregisterCommand('example-shortcut');
      unregisterCommand('example-async');
      unregisterCommand('example-conditional');
      unregisterCommand('example-batch-1');
      unregisterCommand('example-batch-2');
      unregisterCommand('example-batch-3');
      unregisterCommand('example-navigation');
      unregisterCommand('example-error-handling');
      unregisterCommand('example-stateful');

      // Unregister dynamic commands
      items.forEach((_, index) => {
        unregisterCommand(`example-dynamic-${index}`);
      });
    };
  }, [registerCommand, registerCommands, unregisterCommand, toast]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Custom Commands Example</h2>
      <p className="text-muted-foreground">
        This component registers several example commands. Press ⌘K to open the
        command palette and search for commands starting with "example-" or check
        the source code to see how they're implemented.
      </p>
    </div>
  );
}

/**
 * Best Practices for Command Registration:
 *
 * 1. Always register commands in useEffect
 * 2. Always provide a cleanup function to unregister commands
 * 3. Use descriptive IDs with prefixes (e.g., 'my-feature-action')
 * 4. Add descriptions to help users understand what commands do
 * 5. Choose appropriate categories for better organization
 * 6. Use the enabled function for conditional availability
 * 7. Handle errors gracefully in async operations
 * 8. Add keyboard shortcuts for frequently used commands
 * 9. Use appropriate icons that represent the action
 * 10. Test commands in different app states
 */

/**
 * Common Patterns:
 *
 * Pattern 1: Commands that depend on context
 * ```typescript
 * const { activeConnection } = useDatabase();
 *
 * registerCommand({
 *   id: 'context-dependent',
 *   label: 'Context Dependent',
 *   icon: Database,
 *   category: 'connection',
 *   action: () => {
 *     // Use context data
 *     console.log(activeConnection);
 *   },
 *   enabled: () => !!activeConnection,
 * });
 * ```
 *
 * Pattern 2: Commands that update state
 * ```typescript
 * const [data, setData] = useState([]);
 *
 * registerCommand({
 *   id: 'update-state',
 *   label: 'Update State',
 *   icon: RefreshCw,
 *   category: 'query',
 *   action: async () => {
 *     const newData = await fetchData();
 *     setData(newData);
 *   },
 * });
 * ```
 *
 * Pattern 3: Commands that open dialogs
 * ```typescript
 * const [isDialogOpen, setIsDialogOpen] = useState(false);
 *
 * registerCommand({
 *   id: 'open-dialog',
 *   label: 'Open Dialog',
 *   icon: Settings,
 *   category: 'view',
 *   action: () => {
 *     setIsDialogOpen(true);
 *   },
 * });
 * ```
 */
