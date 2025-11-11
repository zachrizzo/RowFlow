import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Database, Sparkles, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useRag } from '@/hooks/useRag';
import { useDatabase } from '@/hooks/useDatabase';
import { useToast } from '@/hooks/use-toast';
import { checkAndPromptForMissingModels, checkBothModels, CHAT_MODEL, EMBEDDING_MODEL } from '@/lib/modelCheck';
import type { ChatMessage, EmbeddingSearchMatch } from '@/types/ai';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface AiChatProps {
  onSelectRow?: (match: EmbeddingSearchMatch) => void;
  onExecuteSql?: (sql: string) => void;
  onOpenSettings?: () => void;
}

export function AiChat({ onSelectRow, onExecuteSql, onOpenSettings }: AiChatProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();
  const connectionId = activeConnection?.connectionId || null;
  const { searchEmbeddings, generateSqlFromRag, isSearching } = useRag(connectionId);
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I can help you explore your database using natural language. Ask me questions about your data, and I\'ll find relevant rows using semantic search.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatModelAvailable, setChatModelAvailable] = useState<boolean | null>(null);
  const [embeddingModelAvailable, setEmbeddingModelAvailable] = useState<boolean | null>(null);
  const [downloadingChatModel, setDownloadingChatModel] = useState(false);
  const [downloadingEmbeddingModel, setDownloadingEmbeddingModel] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Listen for model pull progress events
  useEffect(() => {
    if (!connectionId) return;

    const unlisten = listen<{ model: string; status: string; message: string; progress: number | null }>(
      'ollama-pull-progress',
      (event) => {
        const progress = event.payload;
        
        if (progress.model === CHAT_MODEL) {
          if (progress.status === 'completed') {
            setDownloadingChatModel(false);
            setChatModelAvailable(true);
            toast({
              title: 'Model downloaded',
              description: `Chat model "${CHAT_MODEL}" is now available.`,
            });
            // Recheck all models
            checkBothModels(toast, onOpenSettings, false).then((result) => {
              setChatModelAvailable(result.chat);
              setEmbeddingModelAvailable(result.embedding);
            });
          } else if (progress.status === 'error') {
            setDownloadingChatModel(false);
            toast({
              title: 'Download failed',
              description: progress.message,
              variant: 'destructive',
            });
          }
        }
        
        if (progress.model === EMBEDDING_MODEL) {
          if (progress.status === 'completed') {
            setDownloadingEmbeddingModel(false);
            setEmbeddingModelAvailable(true);
            toast({
              title: 'Model downloaded',
              description: `Embedding model "${EMBEDDING_MODEL}" is now available.`,
            });
            // Recheck all models
            checkBothModels(toast, onOpenSettings, false).then((result) => {
              setChatModelAvailable(result.chat);
              setEmbeddingModelAvailable(result.embedding);
            });
          } else if (progress.status === 'error') {
            setDownloadingEmbeddingModel(false);
            toast({
              title: 'Download failed',
              description: progress.message,
              variant: 'destructive',
            });
          }
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [connectionId, toast, onOpenSettings]);

  // Check for required models when component mounts or connection changes
  useEffect(() => {
    if (!connectionId) {
      setChatModelAvailable(null);
      setEmbeddingModelAvailable(null);
      return;
    }

    let mounted = true;

    const checkModels = async () => {
      try {
        // Don't show toast on initial check, only show the UI warning
        const result = await checkBothModels(toast, onOpenSettings, false);
        
        if (!mounted) return;
        
        setChatModelAvailable(result.chat);
        setEmbeddingModelAvailable(result.embedding);
        
        // If models are missing, show toast once (with a small delay to avoid spam)
        if (!result.chat || !result.embedding) {
          setTimeout(() => {
            if (mounted) {
              checkBothModels(toast, onOpenSettings, true);
            }
          }, 500);
        }
      } catch (error) {
        console.error('Failed to check models:', error);
        if (mounted) {
          setChatModelAvailable(false);
          setEmbeddingModelAvailable(false);
        }
      }
    };

    checkModels();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]); // Only depend on connectionId to avoid infinite loops

  const handleDownloadChatModel = useCallback(async () => {
    setDownloadingChatModel(true);
    try {
      await invoke('pull_ollama_model', { model: CHAT_MODEL });
    } catch (error) {
      setDownloadingChatModel(false);
      toast({
        title: 'Failed to start download',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleDownloadEmbeddingModel = useCallback(async () => {
    setDownloadingEmbeddingModel(true);
    try {
      await invoke('pull_ollama_model', { model: EMBEDDING_MODEL });
    } catch (error) {
      setDownloadingEmbeddingModel(false);
      toast({
        title: 'Failed to start download',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isProcessing || !connectionId) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input.trim();
    setInput('');
    setIsProcessing(true);

    try {
      // Step 1: Check for chat model before classifying intent
      const chatModelAvailable = await checkAndPromptForMissingModels(
        { type: 'chat', model: CHAT_MODEL },
        toast,
        onOpenSettings
      );
      
      if (!chatModelAvailable) {
        const errorResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Chat model is not available. Please install it in Settings > AI Models.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorResponse]);
        return;
      }

      // Step 2: Classify user intent using LangGraph-style agent
      const agentState = await invoke<import('@/types/ai').AgentState>('classify_user_message', {
        message: userInput,
      });

      // Step 3: Handle based on intent
      if (!agentState.shouldSearch) {
        // Greeting or small talk - just respond without searching
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: agentState.response || 'Hello! How can I help you explore your database?',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      // Step 4: For database queries, perform RAG search
      const matches = await searchEmbeddings(userInput, { 
        topK: 5,
        onOpenSettings,
      });

      if (matches.length === 0) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            'I couldn\'t find any relevant data for your question. Make sure you\'ve embedded some tables first by selecting a table and generating embeddings.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      // Step 5: Generate SQL query from RAG context
      const { sql, matches: contextMatches } = await generateSqlFromRag(userInput, {
        onOpenSettings,
      });

      // Build response with matches
      const matchSummary = contextMatches
        .slice(0, 3)
        .map((match, idx) => `${idx + 1}. ${match.schema}.${match.table} (score: ${match.score.toFixed(2)})`)
        .join('\n');

      const responseContent = `I found ${matches.length} relevant result${matches.length > 1 ? 's' : ''}:\n\n${matchSummary}\n\nHere's a query to explore the data:\n\`\`\`sql\n${sql}\n\`\`\``;

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
        matches: contextMatches,
        sqlQuery: sql,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process your question';
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, connectionId, searchEmbeddings, generateSqlFromRag, onOpenSettings, toast]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleMatchClick = useCallback(
    (match: EmbeddingSearchMatch) => {
      if (onSelectRow) {
        onSelectRow(match);
      }
    },
    [onSelectRow]
  );

  const handleExecuteSql = useCallback(
    (sql: string) => {
      if (onExecuteSql) {
        onExecuteSql(sql);
      }
    },
    [onExecuteSql]
  );

  if (!connectionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <Database className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">Connect to a database to use AI chat</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">AI Chat</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          RAG
        </Badge>
      </div>

      {/* Model Status Warning */}
      {(chatModelAvailable === false || embeddingModelAvailable === false) && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-destructive">Missing AI Models</p>
              <div className="space-y-2">
                {!chatModelAvailable && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Chat model ({CHAT_MODEL}) is required for AI chat.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadChatModel}
                      disabled={downloadingChatModel}
                      className="h-7 text-xs ml-2"
                    >
                      {downloadingChatModel ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                )}
                {!embeddingModelAvailable && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Embedding model ({EMBEDDING_MODEL}) is required for semantic search.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadEmbeddingModel}
                      disabled={downloadingEmbeddingModel}
                      className="h-7 text-xs ml-2"
                    >
                      {downloadingEmbeddingModel ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>

                {/* Matches */}
                {message.matches && message.matches.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold opacity-80 mb-2">Found {message.matches.length} relevant rows:</div>
                    {message.matches.map((match, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleMatchClick(match)}
                        className="p-2 rounded bg-background/50 cursor-pointer hover:bg-background/80 transition-colors text-xs"
                      >
                        <div className="font-medium">{match.schema}.{match.table}</div>
                        <div className="text-muted-foreground mt-1 line-clamp-2">{match.content}</div>
                        <div className="text-muted-foreground mt-1">Score: {match.score.toFixed(3)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SQL Query */}
                {message.sqlQuery && (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExecuteSql(message.sqlQuery!)}
                      className="w-full text-xs"
                    >
                      Execute SQL Query
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your data..."
            disabled={isProcessing || isSearching}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing || isSearching}
            size="icon"
          >
            {isProcessing || isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Uses semantic search to find relevant rows. Embed tables first for best results.
        </p>
      </div>
    </div>
  );
}
