# RowFlow Command Palette Documentation

## Overview

The RowFlow command palette provides a keyboard-first interface for executing commands across the application. Press `⌘K` (macOS) or `Ctrl+K` (Windows/Linux) to open the palette and access all available actions.

## Features

- **Global Keyboard Shortcut**: `⌘K` / `Ctrl+K` opens the command palette from anywhere
- **Fuzzy Search**: Type to search through all available commands
- **Keyboard Navigation**: Use arrow keys, Enter, and Esc to navigate
- **Grouped Commands**: Commands organized by category (Connection, Query, Schema, Export, View, Navigation, Help)
- **Recent Commands**: Quick access to your 10 most recently used commands
- **Contextual Availability**: Commands automatically enable/disable based on app state
- **Visual Feedback**: Icons, colors, and keyboard shortcuts displayed for each command
- **Dark Theme**: Glassmorphism design with backdrop blur

## Files Created

### Core Infrastructure

1. **`src/lib/commands.ts`**
   - Command type definitions
   - CommandRegistry class for managing commands
   - Command categories and grouping logic

2. **`src/lib/recentCommands.ts`**
   - RecentCommandsManager for tracking command history
   - LocalStorage persistence
   - Maximum 10 recent commands

3. **`src/contexts/CommandContext.tsx`**
   - React context for command palette state
   - Command registration API
   - Command execution with error handling

4. **`src/hooks/useCommandPalette.ts`**
   - Global keyboard listener for `⌘K` / `Ctrl+K`
   - Hook for registering commands from components

### UI Components

5. **`src/components/CommandPalette.tsx`**
   - Main command palette UI using `cmdk` library
   - Search input and results list
   - Recent commands section
   - Grouped command display
   - Command execution handling

6. **`src/components/KeyboardShortcutsDialog.tsx`**
   - Modal showing all keyboard shortcuts
   - Organized by category
   - Accessible via "Show Keyboard Shortcuts" command

### Integration

7. **`src/App.tsx`** (Modified)
   - Added CommandProvider wrapper
   - Added CommandPalette component
   - Initialized keyboard listener

## Command Definitions

### Connection Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Connect to Database... | `⌘O` | Choose a connection profile | No |
| Disconnect | `⌘D` | Disconnect from active database | Yes |
| New Connection | `⌘N` | Create a new connection profile | No |
| Switch Database | - | Quick database switcher | Yes |
| Connect to [Profile] | - | Direct connection to specific profile | No |

### Query Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Run Query | `⌘Enter` | Execute the active query | Yes |
| Cancel Query | - | Cancel the running query | Yes |
| Format SQL | `⌥⌘F` | Format the current query | No |
| New Query Tab | `⌘T` | Create a new query tab | Yes |
| Close Query Tab | `⌘W` | Close the active query tab | No |
| Clear Editor | - | Clear the SQL editor | No |

### Schema Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Refresh Schema | - | Re-fetch the database schema | Yes |
| Find Table... | - | Search for a table in the schema | Yes |
| Sample Table | - | Sample the selected table | Yes |
| Copy Table Name | - | Copy the selected table name | Yes |

### Export Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Export to CSV | `⌘E` | Export query results to CSV | Yes |
| Export to JSON | `⌘J` | Export query results to JSON | Yes |
| Copy Results | - | Copy query results to clipboard | Yes |

### View Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Toggle Read-only Mode | - | Toggle database read-only mode | No |
| Show Query History | - | View query execution history | No |

### Navigation Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Focus Editor | `⌘3` | Focus the SQL editor | No |
| Focus Schema Browser | `⌘2` | Focus the schema tree | No |
| Focus Connections | `⌘1` | Focus the connections panel | No |

### Help Commands

| Command | Shortcut | Description | Requires Connection |
|---------|----------|-------------|-------------------|
| Show Keyboard Shortcuts | `⌘?` | View all keyboard shortcuts | No |
| Clear Recent Commands | - | Clear command history | No |

## How to Register New Commands

### Basic Command Registration

```typescript
import { useEffect } from 'react';
import { useCommands } from '@/contexts/CommandContext';
import { PlayCircle } from 'lucide-react';

function MyComponent() {
  const { registerCommand } = useCommands();

  useEffect(() => {
    registerCommand({
      id: 'my-custom-command',
      label: 'My Custom Command',
      description: 'Does something cool',
      icon: PlayCircle,
      category: 'query',
      shortcut: ['⌘', 'Shift', 'X'],
      action: () => {
        console.log('Command executed!');
      },
    });
  }, [registerCommand]);

  return <div>My Component</div>;
}
```

### Conditional Command Availability

```typescript
registerCommand({
  id: 'conditional-command',
  label: 'Only Available When Connected',
  icon: Database,
  category: 'connection',
  action: () => {
    // Do something
  },
  enabled: () => {
    // Return true to enable, false to disable
    return activeConnection !== null;
  },
});
```

### Dynamic Command Generation

```typescript
// Generate commands based on data
profiles.forEach(profile => {
  registerCommand({
    id: `connect-to-${profile.id}`,
    label: `Connect to ${profile.name}`,
    description: `${profile.host}:${profile.port}`,
    icon: Database,
    category: 'connection',
    action: async () => {
      await connectToProfile(profile);
    },
  });
});
```

### Async Command Actions

```typescript
registerCommand({
  id: 'async-command',
  label: 'Async Operation',
  icon: RefreshCw,
  category: 'schema',
  action: async () => {
    try {
      await performAsyncOperation();
      toast({
        title: 'Success',
        description: 'Operation completed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  },
});
```

## Command Type Definition

```typescript
interface Command {
  id: string;                              // Unique identifier
  label: string;                           // Display name
  description?: string;                    // Optional description
  icon: LucideIcon;                        // Icon from lucide-react
  shortcut?: string[];                     // Keyboard shortcut keys
  category: CommandCategory;               // Category for grouping
  action: () => void | Promise<void>;      // Command action
  enabled?: () => boolean;                 // Optional availability check
}

type CommandCategory =
  | 'connection'
  | 'query'
  | 'schema'
  | 'export'
  | 'view'
  | 'navigation'
  | 'help';
```

## Integration Guide

### Using Commands in Your Component

```typescript
import { useCommands } from '@/contexts/CommandContext';

function MyComponent() {
  const { executeCommand, openCommandPalette } = useCommands();

  // Execute a command programmatically
  const handleClick = () => {
    executeCommand('run-query');
  };

  // Open the command palette programmatically
  const handleSearch = () => {
    openCommandPalette();
  };

  return (
    <div>
      <button onClick={handleClick}>Run Query</button>
      <button onClick={handleSearch}>Search Commands</button>
    </div>
  );
}
```

### Accessing All Commands

```typescript
const { getAllCommands, getAvailableCommands } = useCommands();

// Get all registered commands
const allCommands = getAllCommands();

// Get only enabled commands
const availableCommands = getAvailableCommands();
```

### Unregistering Commands

```typescript
const { registerCommand, unregisterCommand } = useCommands();

useEffect(() => {
  registerCommand({
    id: 'temp-command',
    label: 'Temporary Command',
    icon: Clock,
    category: 'help',
    action: () => console.log('temp'),
  });

  // Cleanup when component unmounts
  return () => {
    unregisterCommand('temp-command');
  };
}, [registerCommand, unregisterCommand]);
```

## Keyboard Shortcuts Reference

### General
- `⌘K` / `Ctrl+K` - Open command palette
- `Esc` - Close command palette
- `↑` `↓` - Navigate commands
- `Enter` - Execute selected command

### Query
- `⌘Enter` / `Ctrl+Enter` - Run query
- `⌥⌘F` / `Alt+Ctrl+F` - Format SQL
- `⌘T` / `Ctrl+T` - New query tab
- `⌘W` / `Ctrl+W` - Close query tab

### Navigation
- `⌘1` / `Ctrl+1` - Focus connections panel
- `⌘2` / `Ctrl+2` - Focus schema browser
- `⌘3` / `Ctrl+3` - Focus query editor

### Connection
- `⌘D` / `Ctrl+D` - Disconnect active connection
- `⌘N` / `Ctrl+N` - New connection

### Export
- `⌘E` / `Ctrl+E` - Export to CSV
- `⌘J` / `Ctrl+J` - Export to JSON
- `⌘C` / `Ctrl+C` - Copy results

## Styling and Theming

The command palette uses a glassmorphism design with:

- **Background**: `rgba(0, 0, 0, 0.8)` with backdrop blur
- **Border**: `rgba(255, 255, 255, 0.1)`
- **Animations**: Fade in/out, smooth transitions
- **Category Colors**:
  - Connection: Blue (`text-blue-400`)
  - Query: Green (`text-green-400`)
  - Schema: Purple (`text-purple-400`)
  - Export: Yellow (`text-yellow-400`)
  - View: Orange (`text-orange-400`)
  - Navigation: Cyan (`text-cyan-400`)
  - Help: Pink (`text-pink-400`)

## Recent Commands

The command palette automatically tracks your 10 most recently executed commands and displays them at the top of the list for quick access.

### Clearing Recent Commands

You can clear your command history:
1. Open the command palette (`⌘K`)
2. Type "Clear Recent Commands"
3. Press Enter

Or programmatically:

```typescript
const { clearRecentCommands } = useCommands();
clearRecentCommands();
```

## Error Handling

Commands that throw errors are automatically caught and displayed as toast notifications. For custom error handling:

```typescript
registerCommand({
  id: 'error-handling-example',
  label: 'Example with Error Handling',
  icon: AlertCircle,
  category: 'help',
  action: async () => {
    try {
      await riskyOperation();
    } catch (error) {
      // Custom error handling
      console.error('Operation failed:', error);
      toast({
        title: 'Operation Failed',
        description: error.message,
        variant: 'destructive',
      });
      // Re-throw to prevent command palette from closing
      throw error;
    }
  },
});
```

## Best Practices

1. **Use Descriptive Labels**: Make command names clear and actionable
2. **Add Descriptions**: Provide context for what the command does
3. **Choose Appropriate Icons**: Use icons that represent the action
4. **Set Correct Categories**: Organize commands logically
5. **Implement `enabled` Checks**: Disable commands when not applicable
6. **Handle Errors**: Provide user feedback for failed operations
7. **Use Shortcuts Wisely**: Reserve shortcuts for frequently used commands
8. **Async Operations**: Always handle promises properly

## Future Enhancements

Potential improvements for the command palette:

- Command aliases and synonyms for better search
- Command history with timestamps
- Frequently used commands section
- Command parameters/arguments
- Command chaining
- Custom command themes
- Search result ranking
- Fuzzy search highlighting
- Command favorites/pinning
- Multi-step commands (wizards)

## Troubleshooting

### Command Palette Not Opening

- Verify `CommandProvider` is wrapping your app
- Check that `useCommandPalette()` hook is called
- Ensure no other component is preventing keyboard events

### Commands Not Appearing

- Check that commands are registered in a `useEffect`
- Verify the component registering commands is mounted
- Check `enabled` function if command should be available

### Commands Not Executing

- Check browser console for errors
- Verify command action is defined
- Ensure async operations are properly handled

### Styling Issues

- Verify Tailwind CSS is configured correctly
- Check dark mode is enabled
- Ensure backdrop-filter is supported by browser

## Support

For issues or questions about the command palette system, refer to:
- This documentation
- Code comments in source files
- TypeScript type definitions
- Example implementations in existing commands
