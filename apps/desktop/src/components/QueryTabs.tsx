import { useEffect, useState, useCallback } from 'react';
import { X, Plus, Edit2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { QueryTab } from '@/types/query';

export interface QueryTabsProps {
  tabs: QueryTab[];
  activeTabId: string | null;
  onTabChange: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabAdd: () => void;
  onTabRename: (tabId: string, newTitle: string) => void;
}

export function QueryTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  onTabAdd,
  onTabRename,
}: QueryTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleStartEdit = (tab: QueryTab) => {
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
  };

  const handleFinishEdit = (tabId: string) => {
    if (editingTitle.trim()) {
      onTabRename(tabId, editingTitle.trim());
    }
    setEditingTabId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = () => {
    setEditingTabId(null);
    setEditingTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleFinishEdit(tabId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isEditing = editingTabId === tab.id;

        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-t min-w-[120px] max-w-[200px]',
              'border border-b-0 transition-colors group relative',
              isActive
                ? 'bg-background border-border'
                : 'bg-muted/50 border-transparent hover:bg-muted hover:border-border/50'
            )}
          >
            {/* Execution status indicator */}
            {tab.execution.status === 'running' && (
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
            {tab.execution.status === 'success' && (
              <div className="w-2 h-2 rounded-full bg-green-500" />
            )}
            {tab.execution.status === 'error' && (
              <div className="w-2 h-2 rounded-full bg-red-500" />
            )}

            {/* Tab title - editable or clickable */}
            {isEditing ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                  onBlur={() => handleFinishEdit(tab.id)}
                  className="h-6 text-xs px-2 py-0"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => handleFinishEdit(tab.id)}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                className="flex-1 text-left text-sm truncate"
                onClick={() => onTabChange(tab.id)}
                onDoubleClick={() => handleStartEdit(tab)}
                title={tab.title}
              >
                {tab.title}
              </button>
            )}

            {/* Edit button (visible on hover) */}
            {!isEditing && isActive && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleStartEdit(tab)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}

            {/* Close button */}
            {!isEditing && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}

      {/* Add new tab button */}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={onTabAdd}
        title="New Query Tab (Cmd+T)"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Hook to manage query tabs with localStorage persistence
export function useQueryTabs() {
  const [tabs, setTabs] = useState<QueryTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Load tabs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('rowflow-query-tabs');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTabs(parsed.tabs);
        setActiveTabId(parsed.activeTabId);
      } catch (error) {
        console.error('Failed to load tabs from localStorage:', error);
        // Create default tab if loading fails
        createInitialTab();
      }
    } else {
      // Create default tab if no stored tabs
      createInitialTab();
    }
  }, []);

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    if (tabs.length > 0) {
      localStorage.setItem(
        'rowflow-query-tabs',
        JSON.stringify({
          tabs,
          activeTabId,
        })
      );
    }
  }, [tabs, activeTabId]);

  const createInitialTab = () => {
    const initialTab: QueryTab = {
      id: `tab-${Date.now()}`,
      title: 'Query 1',
      sql: '-- Write your SQL query here\nSELECT * FROM ',
      execution: {
        status: 'idle',
        result: null,
        error: null,
        duration: 0,
      },
    };
    setTabs([initialTab]);
    setActiveTabId(initialTab.id);
  };

  const addTab = useCallback(() => {
    const newTab: QueryTab = {
      id: `tab-${Date.now()}`,
      title: `Query ${tabs.length + 1}`,
      sql: '-- Write your SQL query here\nSELECT * FROM ',
      execution: {
        status: 'idle',
        result: null,
        error: null,
        duration: 0,
      },
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs.length]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      // If we're closing the last tab, create a new one
      if (filtered.length === 0) {
        const newTab: QueryTab = {
          id: `tab-${Date.now()}`,
          title: 'Query 1',
          sql: '-- Write your SQL query here\nSELECT * FROM ',
          execution: {
            status: 'idle',
            result: null,
            error: null,
            duration: 0,
          },
        };
        setActiveTabId(newTab.id);
        return [newTab];
      }
      return filtered;
    });

    // If we're closing the active tab, switch to another tab
    setActiveTabId((prev) => {
      if (prev === tabId) {
        const remainingTabs = tabs.filter((t) => t.id !== tabId);
        return remainingTabs.length > 0 ? (remainingTabs[0]?.id || null) : null;
      }
      return prev;
    });
  }, [tabs]);

  const renameTab = useCallback((tabId: string, newTitle: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, title: newTitle } : tab
      )
    );
  }, []);

  const updateTabSql = useCallback((tabId: string, sql: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, sql } : tab))
    );
  }, []);

  const updateTabExecution = useCallback(
    (tabId: string, execution: Partial<QueryTab['execution']>) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, execution: { ...tab.execution, ...execution } }
            : tab
        )
      );
    },
    []
  );

  const getActiveTab = useCallback(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  return {
    tabs,
    activeTabId,
    activeTab: getActiveTab(),
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    updateTabSql,
    updateTabExecution,
  };
}
