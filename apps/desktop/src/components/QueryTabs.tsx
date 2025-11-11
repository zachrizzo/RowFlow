import { useEffect, useState, useCallback } from 'react';
import { X, Plus, Edit2, Check, Database, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { QueryTab, QueryTabContext, QueryResult } from '@/types/query';
import { DEFAULT_SQL, sanitizeSql } from '@/lib/sqlPlaceholders';

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
            {/* View type icon */}
            {tab.viewType === 'table' ? (
              <Database className="h-3 w-3 text-blue-500" />
            ) : (
              <FileCode className="h-3 w-3 text-muted-foreground" />
            )}

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

  // Define createInitialTab before using it in effects
  const createInitialTab = useCallback(() => {
    const initialTab: QueryTab = {
      id: `tab-${Date.now()}`,
      title: 'Query 1',
      sql: DEFAULT_SQL,
      execution: {
        status: 'idle',
        result: null,
        error: null,
        duration: 0,
      },
      context: undefined,
      viewType: 'sql',
    };
    setTabs([initialTab]);
    setActiveTabId(initialTab.id);
  }, []);

  // Load tabs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('rowflow-query-tabs');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Check if data is corrupted (tabs have undefined, null, or non-string sql)
        const hasCorruptedData = parsed.tabs?.some(
          (tab: any) => tab.sql === undefined || tab.sql === null || typeof tab.sql !== 'string'
        );

        if (hasCorruptedData) {
          console.warn('Corrupted localStorage data detected, clearing and creating fresh tab');
          localStorage.removeItem('rowflow-query-tabs');
          createInitialTab();
          return;
        }

        // Ensure all tabs have valid sql property
        const validTabs = parsed.tabs.map((tab: QueryTab) => {
          const sanitizedSql = sanitizeSql(tab.sql);
          const hasOriginalValue = tab.sql !== undefined && tab.sql !== null && typeof tab.sql === 'string';

          return {
            ...tab,
            sql:
              sanitizedSql === '' && !hasOriginalValue
                ? DEFAULT_SQL
                : sanitizedSql,
            context: tab.context,
            viewType: tab.viewType || 'sql', // Default to 'sql' for backwards compatibility
          };
        });
        setTabs(validTabs);
        setActiveTabId(parsed.activeTabId);
      } catch (error) {
        console.error('Failed to load tabs from localStorage:', error);
        localStorage.removeItem('rowflow-query-tabs');
        // Create default tab if loading fails
        createInitialTab();
      }
    } else {
      // Create default tab if no stored tabs
      createInitialTab();
    }
  }, [createInitialTab]);

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    if (tabs.length > 0) {
      // Validate all tabs have valid sql strings before saving
      const allTabsValid = tabs.every(
        (tab) => tab.sql !== undefined && tab.sql !== null && typeof tab.sql === 'string'
      );

      if (allTabsValid) {
        localStorage.setItem(
          'rowflow-query-tabs',
          JSON.stringify({
            tabs,
            activeTabId,
          })
        );
      } else {
        console.error('Attempted to save invalid tabs to localStorage, skipping save');
      }
    }
  }, [tabs, activeTabId]);

  const addTab = useCallback(() => {
    const newTab: QueryTab = {
      id: `tab-${Date.now()}`,
      title: `Query ${tabs.length + 1}`,
      sql: DEFAULT_SQL,
      execution: {
        status: 'idle',
        result: null,
        error: null,
        duration: 0,
      },
      context: undefined,
      viewType: 'sql',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, [tabs.length]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      // If we're closing the last tab, create a new one
      if (filtered.length === 0) {
        const newTab: QueryTab = {
          id: `tab-${Date.now()}`,
          title: 'Query 1',
          sql: DEFAULT_SQL,
          execution: {
            status: 'idle',
            result: null,
            error: null,
            duration: 0,
          },
          context: undefined,
          viewType: 'sql',
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
    // Validate input is actually a string
    if (typeof sql !== 'string') {
      console.error('updateTabSql called with non-string value:', typeof sql, sql);
      return; // Don't update if not a string
    }

    const normalizedSql = sanitizeSql(sql);

    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, sql: normalizedSql } : tab))
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

  const updateTabContext = useCallback(
    (tabId: string, context: QueryTabContext | undefined) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, context }
            : tab
        )
      );
    },
    []
  );

  const addTableTab = useCallback((schema: string, table: string, result: QueryResult, sql?: string) => {
    // Check if a tab for this table already exists
    const existingTab = tabs.find(
      (t) => t.viewType === 'table' && t.context?.type === 'table' &&
      t.context.schema === schema && t.context.table === table
    );
    
    if (existingTab) {
      // Update existing tab instead of creating a new one
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === existingTab.id
            ? {
                ...tab,
                sql: sql || tab.sql, // Update SQL if provided
                execution: {
                  status: 'success',
                  result,
                  error: null,
                  duration: result.executionTime,
                },
              }
            : tab
        )
      );
      setActiveTabId(existingTab.id);
      return existingTab.id;
    }

    const tabId = `table-${schema}-${table}-${Date.now()}`;
    const newTab: QueryTab = {
      id: tabId,
      title: `${schema}.${table}`,
      sql: sql || '', // Store SQL for load more functionality
      execution: {
        status: 'success',
        result,
        error: null,
        duration: result.executionTime,
      },
      context: {
        type: 'table',
        schema,
        table,
      },
      viewType: 'table',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    return tabId;
  }, [tabs]);

  const getActiveTab = useCallback(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  return {
    tabs,
    activeTabId,
    activeTab: getActiveTab(),
    setActiveTabId,
    addTab,
    addTableTab,
    closeTab,
    renameTab,
    updateTabSql,
    updateTabExecution,
    updateTabContext,
  };
}
