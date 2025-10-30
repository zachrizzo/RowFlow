import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { QueryResult, QueryExecutionState } from '@/types/query';
import { formatSql } from '@/lib/sqlFormatter';
import { useToast } from '@/hooks/use-toast';

export interface UseQueryExecutionOptions {
  connectionId: string | null;
  onSuccess?: (result: QueryResult) => void;
  onError?: (error: string) => void;
}

export function useQueryExecution(options: UseQueryExecutionOptions) {
  const { connectionId, onSuccess, onError } = options;
  const { toast } = useToast();

  const [state, setState] = useState<QueryExecutionState>({
    status: 'idle',
    result: null,
    error: null,
    duration: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const backendPidRef = useRef<number | null>(null);

  /**
   * Execute a SQL query
   */
  const executeQuery = useCallback(
    async (sql: string, params: any[] = []) => {
      if (!connectionId) {
        const error = 'No active database connection';
        setState({
          status: 'error',
          result: null,
          error,
          duration: 0,
        });
        toast({
          title: 'Error',
          description: error,
          variant: 'destructive',
        });
        onError?.(error);
        return;
      }

      if (!sql.trim()) {
        const error = 'Query cannot be empty';
        setState({
          status: 'error',
          result: null,
          error,
          duration: 0,
        });
        toast({
          title: 'Error',
          description: error,
          variant: 'destructive',
        });
        onError?.(error);
        return;
      }

      // Create abort controller for this execution
      abortControllerRef.current = new AbortController();

      // Set state to running
      setState({
        status: 'running',
        result: null,
        error: null,
        duration: 0,
      });

      const startTime = performance.now();

      try {
        // Get backend PID for cancel support
        const pid = await invoke<number>('get_backend_pid', { connectionId });
        backendPidRef.current = pid;

        // Execute query
        const result = await invoke<QueryResult>('execute_query', {
          connectionId,
          sql,
          params,
        });

        const duration = performance.now() - startTime;

        setState({
          status: 'success',
          result,
          error: null,
          duration,
          backendPid: pid,
        });

        toast({
          title: 'Query Executed',
          description: `${result.rowCount} rows returned in ${duration.toFixed(2)}ms`,
        });

        onSuccess?.(result);
      } catch (error) {
        const duration = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        setState({
          status: 'error',
          result: null,
          error: errorMessage,
          duration,
        });

        toast({
          title: 'Query Failed',
          description: errorMessage,
          variant: 'destructive',
        });

        onError?.(errorMessage);
      } finally {
        abortControllerRef.current = null;
        backendPidRef.current = null;
      }
    },
    [connectionId, toast, onSuccess, onError]
  );

  /**
   * Execute a query with streaming/pagination support for large result sets
   */
  const executeQueryStream = useCallback(
    async (sql: string, chunkSize = 10000, offset = 0) => {
      if (!connectionId) {
        const error = 'No active database connection';
        setState({
          status: 'error',
          result: null,
          error,
          duration: 0,
        });
        toast({
          title: 'Error',
          description: error,
          variant: 'destructive',
        });
        onError?.(error);
        return null;
      }

      if (!sql.trim()) {
        const error = 'Query cannot be empty';
        setState({
          status: 'error',
          result: null,
          error,
          duration: 0,
        });
        toast({
          title: 'Error',
          description: error,
          variant: 'destructive',
        });
        onError?.(error);
        return null;
      }

      // Only set to running on first chunk
      if (offset === 0) {
        setState({
          status: 'running',
          result: null,
          error: null,
          duration: 0,
        });
      }

      const startTime = performance.now();

      try {
        const result = await invoke<QueryResult>('execute_query_stream', {
          connectionId,
          sql,
          chunkSize,
          offset,
        });

        const duration = performance.now() - startTime;

        // If this is the first chunk, set the initial result
        // Otherwise, append rows to existing result
        setState((prev) => {
          if (offset === 0) {
            return {
              status: result.hasMore ? 'running' : 'success',
              result,
              error: null,
              duration,
            };
          } else {
            return {
              ...prev,
              status: result.hasMore ? 'running' : 'success',
              result: prev.result
                ? {
                    ...prev.result,
                    rows: [...prev.result.rows, ...result.rows],
                    rowCount: prev.result.rowCount + result.rowCount,
                    hasMore: result.hasMore,
                  }
                : result,
              duration: prev.duration + duration,
            };
          }
        });

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        setState({
          status: 'error',
          result: null,
          error: errorMessage,
          duration,
        });

        toast({
          title: 'Query Failed',
          description: errorMessage,
          variant: 'destructive',
        });

        onError?.(errorMessage);
        return null;
      }
    },
    [connectionId, toast, onError]
  );

  /**
   * Cancel the currently running query
   */
  const cancelQuery = useCallback(async () => {
    if (state.status !== 'running' || !connectionId || !backendPidRef.current) {
      return;
    }

    try {
      await invoke('cancel_query', {
        connectionId,
        backendPid: backendPidRef.current,
      });

      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Query cancelled by user',
      }));

      toast({
        title: 'Query Cancelled',
        description: 'The query execution was cancelled',
      });
    } catch (error) {
      console.error('Failed to cancel query:', error);
      toast({
        title: 'Cancel Failed',
        description: 'Failed to cancel the query',
        variant: 'destructive',
      });
    }
  }, [state.status, connectionId, toast]);

  /**
   * Format SQL using sql-formatter
   */
  const formatQuery = useCallback((sql: string): string => {
    try {
      return formatSql(sql);
    } catch (error) {
      console.error('Failed to format SQL:', error);
      toast({
        title: 'Format Failed',
        description: 'Failed to format the SQL query',
        variant: 'destructive',
      });
      return sql;
    }
  }, [toast]);

  /**
   * Reset the execution state
   */
  const reset = useCallback(() => {
    setState({
      status: 'idle',
      result: null,
      error: null,
      duration: 0,
    });
  }, []);

  return {
    state,
    executeQuery,
    executeQueryStream,
    cancelQuery,
    formatQuery,
    reset,
    isRunning: state.status === 'running',
    isIdle: state.status === 'idle',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  };
}
