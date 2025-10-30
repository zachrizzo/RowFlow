import { useEffect, useCallback } from 'react';
import { Play, Square, Zap, Database, Loader2 } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SqlEditor } from './SqlEditor';
import { ResultsGrid } from './ResultsGrid';
import { QueryTabs, useQueryTabs } from './QueryTabs';
import { useQueryExecution } from '@/hooks/useQueryExecution';
import { useDatabase } from '@/hooks/useDatabase';

export interface QueryPanelProps {
  onSqlInsert?: (callback: (sql: string) => void) => void;
}

export function QueryPanel({ onSqlInsert }: QueryPanelProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();

  // Query tabs management
  const {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    updateTabSql,
    updateTabExecution,
  } = useQueryTabs();

  // Query execution
  const { executeQuery, cancelQuery, formatQuery, isRunning } = useQueryExecution({
    connectionId: activeConnection?.connectionId || null,
    onSuccess: (result) => {
      if (activeTabId) {
        updateTabExecution(activeTabId, {
          status: 'success',
          result,
          error: null,
        });
      }
    },
    onError: (error) => {
      if (activeTabId) {
        updateTabExecution(activeTabId, {
          status: 'error',
          error,
          result: null,
        });
      }
    },
  });

  // Expose insertSql function via ref (for schema browser integration)
  const insertSql = useCallback(
    (sql: string) => {
      if (activeTab) {
        const newSql = activeTab.sql + (activeTab.sql ? '\n' : '') + sql;
        updateTabSql(activeTab.id, newSql);
      }
    },
    [activeTab, updateTabSql]
  );

  // Call onSqlInsert callback when provided
  useEffect(() => {
    if (onSqlInsert) {
      // Pass the callback function to the parent
      onSqlInsert(insertSql);
    }
  }, [onSqlInsert, insertSql]);

  // Handle query execution
  const handleExecute = useCallback(() => {
    if (!activeTab || !activeTab.sql.trim()) return;

    // Update tab state to running
    if (activeTabId) {
      updateTabExecution(activeTabId, {
        status: 'running',
        result: null,
        error: null,
      });
    }

    executeQuery(activeTab.sql);
  }, [activeTab, activeTabId, executeQuery, updateTabExecution]);

  // Handle query cancellation
  const handleCancel = useCallback(() => {
    cancelQuery();
    if (activeTabId) {
      updateTabExecution(activeTabId, {
        status: 'idle',
      });
    }
  }, [activeTabId, cancelQuery, updateTabExecution]);

  // Handle SQL formatting
  const handleFormat = useCallback(() => {
    if (!activeTab) return;
    const formatted = formatQuery(activeTab.sql);
    updateTabSql(activeTab.id, formatted);
  }, [activeTab, formatQuery, updateTabSql]);

  // Handle SQL editor changes
  const handleSqlChange = useCallback(
    (sql: string) => {
      if (activeTab) {
        updateTabSql(activeTab.id, sql);
      }
    },
    [activeTab, updateTabSql]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + T: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      // Cmd/Ctrl + W: Close tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, addTab, closeTab]);

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>No query tabs open</p>
          <Button onClick={addTab} className="mt-4">
            Create New Tab
          </Button>
        </div>
      </div>
    );
  }

  const execution = activeTab.execution;
  const hasConnection = !!activeConnection?.connectionId;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tabs */}
      <QueryTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        onTabClose={closeTab}
        onTabAdd={addTab}
        onTabRename={renameTab}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/20">
        <div className="flex items-center gap-2">
          {/* Execute/Cancel button */}
          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleCancel}>
              <Square className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={handleExecute}
              disabled={!hasConnection || !activeTab.sql.trim()}
            >
              <Play className="h-4 w-4 mr-1" />
              Run Query
            </Button>
          )}

          {/* Format button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleFormat}
            disabled={!activeTab.sql.trim()}
            title="Format SQL (⌥⌘F)"
          >
            <Zap className="h-4 w-4 mr-1" />
            Format
          </Button>

          {/* Connection indicator */}
          {hasConnection ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-4">
              <Database className="h-3 w-3 text-green-500" />
              <span>
                {activeConnection?.connectionInfo?.databaseName || 'Connected'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-4">
              <Database className="h-3 w-3 text-red-500" />
              <span>No connection</span>
            </div>
          )}
        </div>

        {/* Execution info */}
        {execution.status === 'success' && execution.result && (
          <div className="text-xs text-muted-foreground">
            {execution.result.rowCount} rows in {execution.result.executionTime.toFixed(2)}ms
          </div>
        )}
        {execution.status === 'running' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Executing query...
          </div>
        )}
      </div>

      {/* Split panel: Editor + Results */}
      <PanelGroup direction="vertical" className="flex-1">
        {/* SQL Editor Panel */}
        <Panel defaultSize={50} minSize={20}>
          <div className="h-full">
            <SqlEditor
              value={activeTab.sql}
              onChange={handleSqlChange}
              onExecute={handleExecute}
              onFormat={handleFormat}
              readOnly={isRunning}
            />
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

        {/* Results Panel */}
        <Panel defaultSize={50} minSize={20}>
          <div className="h-full flex flex-col">
            {/* Results header */}
            <div className="flex items-center gap-2 border-b px-4 py-2 bg-muted/50">
              <span className="text-sm font-medium">Results</span>
            </div>

            {/* Error display */}
            {execution.status === 'error' && execution.error && (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertDescription className="text-sm font-mono whitespace-pre-wrap">
                    {execution.error}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Results grid or empty state */}
            {execution.status === 'success' && execution.result ? (
              <div className="flex-1 overflow-hidden">
                <ResultsGrid result={execution.result} />
              </div>
            ) : execution.status === 'idle' && !execution.error ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Play className="h-12 w-12 mb-4 opacity-20 mx-auto" />
                  <p className="text-sm">Execute a query to see results</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">
                    Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to run
                  </p>
                </div>
              </div>
            ) : execution.status === 'running' ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 mb-4 animate-spin mx-auto text-primary" />
                  <p className="text-sm">Executing query...</p>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
