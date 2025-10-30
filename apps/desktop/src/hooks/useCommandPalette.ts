import { useEffect } from 'react';
import { useCommands } from '@/contexts/CommandContext';

export function useCommandPalette() {
  const { toggleCommandPalette } = useCommands();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+K (macOS) or Ctrl+K (Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (modifierKey && event.key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleCommandPalette]);
}

export function useRegisterCommands() {
  return useCommands();
}
