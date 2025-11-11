import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, CheckCircle2, XCircle, FolderOpen } from 'lucide-react';
import type { OllamaStatus, OllamaInstallInfo } from '@/types/ai';

// Progress component - simple implementation
const Progress = ({ value, className }: { value: number; className?: string }) => (
  <div className={`w-full bg-secondary rounded-full h-2 ${className || ''}`}>
    <div
      className="bg-primary h-2 rounded-full transition-all duration-300"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

interface ModelPullProgress {
  model: string;
  status: string;
  message: string;
  progress: number | null;
}

interface OllamaModelManagerProps {
  open: boolean;
}

export function OllamaModelManager({ open }: OllamaModelManagerProps) {
  const { toast } = useToast();
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [installInfo, setInstallInfo] = useState<OllamaInstallInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pullProgress, setPullProgress] = useState<Map<string, ModelPullProgress>>(new Map());
  const [newModelName, setNewModelName] = useState('');
  const [isPulling, setIsPulling] = useState(false);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await invoke<OllamaStatus>('check_ollama_status');
      setOllamaStatus(status);
      
      const info = await invoke<OllamaInstallInfo>('get_ollama_install_info');
      setInstallInfo(info);
    } catch (error) {
      console.error('Failed to refresh Ollama status:', error);
      toast({
        title: 'Failed to refresh status',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      refreshStatus();
    }
  }, [open, refreshStatus]);

  // Listen for pull progress events
  useEffect(() => {
    if (!open) return;

    const unlisten = listen<ModelPullProgress>('ollama-pull-progress', (event) => {
      const progress = event.payload;
      setPullProgress((prev) => {
        const next = new Map(prev);
        next.set(progress.model, progress);
        return next;
      });

      if (progress.status === 'completed') {
        setIsPulling(false);
        toast({
          title: 'Model downloaded',
          description: `Model "${progress.model}" is now available.`,
        });
        refreshStatus();
      } else if (progress.status === 'error') {
        setIsPulling(false);
        toast({
          title: 'Download failed',
          description: progress.message,
          variant: 'destructive',
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [open, toast, refreshStatus]);

  const handlePullModel = useCallback(async () => {
    if (!newModelName.trim()) {
      toast({
        title: 'Model name required',
        description: 'Please enter a model name (e.g., qwen3:4b)',
        variant: 'destructive',
      });
      return;
    }

    setIsPulling(true);
    setPullProgress((prev) => {
      const next = new Map(prev);
      next.set(newModelName.trim(), {
        model: newModelName.trim(),
        status: 'starting',
        message: 'Starting download...',
        progress: 0,
      });
      return next;
    });

    try {
      await invoke('pull_ollama_model', { model: newModelName.trim() });
      setNewModelName('');
    } catch (error) {
      setIsPulling(false);
      toast({
        title: 'Failed to start download',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [newModelName, toast]);

  const handleInstallOllama = useCallback(async () => {
    setIsLoading(true);
    try {
      const path = await invoke<string>('install_ollama');
      toast({
        title: 'Ollama installed',
        description: `Ollama binary installed to: ${path}`,
      });
      await refreshStatus();
    } catch (error) {
      toast({
        title: 'Installation failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, refreshStatus]);

  const handleStartOllama = useCallback(async () => {
    setIsLoading(true);
    try {
      await invoke('start_ollama');
      toast({
        title: 'Ollama started',
        description: 'Ollama service is now running.',
      });
      await refreshStatus();
    } catch (error) {
      toast({
        title: 'Failed to start Ollama',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, refreshStatus]);

  const handleStopOllama = useCallback(async () => {
    setIsLoading(true);
    try {
      await invoke('stop_ollama');
      toast({
        title: 'Ollama stopped',
        description: 'Ollama service has been shut down.',
      });
      await refreshStatus();
    } catch (error) {
      toast({
        title: 'Failed to stop Ollama',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, refreshStatus]);

  const handleOpenModelsFolder = useCallback(async () => {
    if (!installInfo?.modelsDir) return;
    
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(installInfo.modelsDir);
    } catch (error) {
      toast({
        title: 'Failed to open folder',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [installInfo, toast]);

  return (
    <div className="space-y-6">
          {/* Ollama Status */}
          <div className="border rounded-md p-4 space-y-3">
            <h3 className="font-semibold text-md">Ollama Service</h3>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : ollamaStatus?.available ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Ollama is running</span>
                  {ollamaStatus.version && (
                    <Badge variant="outline" className="text-xs">
                      v{ollamaStatus.version}
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleStopOllama} disabled={isLoading}>
                  Stop Ollama
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm">Ollama is not running</span>
                </div>
                {installInfo?.isInstalled ? (
                  <Button variant="default" size="sm" onClick={handleStartOllama} disabled={isLoading}>
                    Start Ollama
                  </Button>
                ) : installInfo?.isBundled ? (
                  <Button variant="default" size="sm" onClick={handleInstallOllama} disabled={isLoading}>
                    Install Ollama
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ollama is not bundled. Please install it manually from{' '}
                    <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      ollama.ai
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Installation Info */}
          {installInfo && (
            <div className="border rounded-md p-4 space-y-2">
              <h3 className="font-semibold text-md">Installation</h3>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Models Directory:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{installInfo.modelsDir}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleOpenModelsFolder}
                      title="Open models folder"
                    >
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Models Size:</span>
                  <span>{installInfo.modelsSizeFormatted}</span>
                </div>
                {installInfo.systemOllamaAvailable && installInfo.systemOllamaPath && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">System Ollama:</span>
                    <span className="font-mono text-xs">{installInfo.systemOllamaPath}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Installed Models */}
          <div className="border rounded-md p-4 space-y-3">
            <h3 className="font-semibold text-md">Installed Models</h3>
            {ollamaStatus?.models && ollamaStatus.models.length > 0 ? (
              <div className="space-y-2">
                {ollamaStatus.models.map((model) => (
                  <div
                    key={model.name}
                    className="flex items-center justify-between p-2 border rounded-md bg-background"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{model.name}</span>
                      {model.size && (
                        <span className="text-xs text-muted-foreground">
                          {(model.size / 1024 / 1024 / 1024).toFixed(2)} GB
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary">Installed</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No models installed</p>
            )}
          </div>

          {/* Pull New Model */}
          <div className="border rounded-md p-4 space-y-3">
            <h3 className="font-semibold text-md">Download Model</h3>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., qwen3:4b, gemma3:4b, nomic-embed-text:latest"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePullModel()}
                disabled={isPulling || !ollamaStatus?.available}
              />
              <Button
                onClick={handlePullModel}
                disabled={isPulling || !ollamaStatus?.available || !newModelName.trim()}
              >
                {isPulling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </>
                )}
              </Button>
            </div>

            {/* Progress Display */}
            {Array.from(pullProgress.values()).map((progress) => (
              <div key={progress.model} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{progress.model}</span>
                  <span className="text-muted-foreground">{progress.message}</span>
                </div>
                {progress.progress !== null && (
                  <Progress value={progress.progress} className="h-2" />
                )}
                {progress.status === 'completed' && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Download complete</span>
                  </div>
                )}
                {progress.status === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span>{progress.message}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
    </div>
  );
}
