import { useEffect, useState } from 'react';
import { Moon, Sun, Server, CheckCircle2, XCircle, Copy, ExternalLink, Zap, Settings as SettingsIcon, Loader2 } from 'lucide-react';
import { OllamaModelManager } from '@/components/OllamaModelManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/contexts/SettingsContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  MCP_TOOLS,
  getConfigJsonString,
  getClaudeDesktopConfigPath,
  isMcpServerBuilt,
  getMcpServerPath,
  getClaudeCodeCommand,
  isClaudeCodeInstalled,
  addToClaudeCode,
} from '@/lib/mcpConfig';

export interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Settings({ open, onOpenChange }: SettingsProps) {
  const { theme, toggleTheme } = useTheme();
  const { settings, setQueryPreviewLimit, setEditingEnabled } = useSettings();
  const { toast } = useToast();
  const [previewLimitInput, setPreviewLimitInput] = useState(
    String(settings.queryPreviewLimit)
  );
  const isDark = theme === 'dark';

  // MCP state
  const [isBuilt, setIsBuilt] = useState(false);
  const [configPath, setConfigPath] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [claudeCodeInstalled, setClaudeCodeInstalled] = useState(false);
  const [claudeCodeCommand, setClaudeCodeCommand] = useState('');
  const [isAddingToClaudeCode, setIsAddingToClaudeCode] = useState(false);
  const [configJson, setConfigJson] = useState('');

  useEffect(() => {
    setPreviewLimitInput(String(settings.queryPreviewLimit));
  }, [settings.queryPreviewLimit]);

  useEffect(() => {
    if (open) {
      checkServerStatus();
      loadConfigPath();
      loadClaudeCodeInfo();
      loadConfigJson();
    }
  }, [open]);

  const commitPreviewLimit = () => {
    const parsed = Number.parseInt(previewLimitInput, 10);
    if (Number.isNaN(parsed)) {
      setPreviewLimitInput(String(settings.queryPreviewLimit));
      return;
    }
    setQueryPreviewLimit(parsed);
  };

  const checkServerStatus = async () => {
    setIsChecking(true);
    try {
      const built = await isMcpServerBuilt();
      setIsBuilt(built);
    } catch (error) {
      console.error('Error checking server status:', error);
      setIsBuilt(false);
    } finally {
      setIsChecking(false);
    }
  };

  const loadConfigPath = async () => {
    try {
      const path = await getClaudeDesktopConfigPath();
      setConfigPath(path);
    } catch (error) {
      console.error('Error loading config path:', error);
    }
  };

  const loadClaudeCodeInfo = async () => {
    try {
      const installed = await isClaudeCodeInstalled();
      setClaudeCodeInstalled(installed);

      const command = await getClaudeCodeCommand();
      setClaudeCodeCommand(command);
    } catch (error) {
      console.error('Error loading Claude Code info:', error);
    }
  };

  const loadConfigJson = async () => {
    try {
      const json = await getConfigJsonString();
      setConfigJson(json);
    } catch (error) {
      console.error('Error loading config JSON:', error);
      setConfigJson('// Error loading configuration');
    }
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      toast({
        title: 'Copied to clipboard',
        description: 'Claude Desktop configuration has been copied',
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy configuration to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleCopyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast({
        title: 'Copied to clipboard',
        description: 'Command has been copied',
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy command to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleAddToClaudeCode = async () => {
    setIsAddingToClaudeCode(true);
    try {
      const result = await addToClaudeCode();
      toast({
        title: result.success ? 'Success!' : 'Error',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsAddingToClaudeCode(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      const serverPath = await getMcpServerPath();
      await open(serverPath);
    } catch (error) {
      toast({
        title: 'Failed to open folder',
        description: 'Could not open MCP server folder',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0 mb-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ollama">AI Models</TabsTrigger>
            <TabsTrigger value="mcp">MCP Server</TabsTrigger>
          </TabsList>

          {/* AI Models Tab */}
          <TabsContent value="ollama" className="flex-1 flex flex-col mt-0 min-h-0 overflow-hidden data-[state=inactive]:hidden">
            <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-4 min-h-0">
              <OllamaModelManager open />
            </div>
          </TabsContent>

          {/* General Settings Tab */}
          <TabsContent value="general" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=inactive]:hidden min-h-0">
            <div className="h-full overflow-y-auto space-y-6 py-4">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="theme-toggle" className="text-base">
                  Theme
                </Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isDark ? (
                    <>
                      <Moon className="h-4 w-4" />
                      <span>Dark mode</span>
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4" />
                      <span>Light mode</span>
                    </>
                  )}
                </div>
              </div>
              <Switch
                id="theme-toggle"
                checked={isDark}
                onCheckedChange={toggleTheme}
              />
              </div>

              {/* Editing toggle */}
              <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="editing-toggle" className="text-base">
                    Enable table editing
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Allows inline edits to table previews. Changes are held locally until you apply them.
                  </p>
                </div>
                <Switch
                  id="editing-toggle"
                  checked={settings.editingEnabled}
                  onCheckedChange={setEditingEnabled}
                />
              </div>
              {settings.editingEnabled && (
                <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2">
                  Editing runs UPDATE statements against the connected database. Review changes carefully before applying them.
                </div>
              )}
            </div>

            {/* Table preview limit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="preview-limit" className="text-base">
                  Table preview row limit
                </Label>
                <Input
                  id="preview-limit"
                  type="number"
                  min={1}
                  max={10000}
                  value={previewLimitInput}
                  onChange={(event) => setPreviewLimitInput(event.target.value)}
                  onBlur={commitPreviewLimit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitPreviewLimit();
                    }
                  }}
                  className="w-24 text-right"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Controls how many rows load when you sample a table. Supports pagination via "Load more".
              </p>
              </div>
            </div>
          </TabsContent>

          {/* MCP Server Tab */}
          <TabsContent value="mcp" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=inactive]:hidden min-h-0">
            <div className="h-full overflow-y-auto space-y-4 py-4">
              {/* Server Status */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  Server Status
                </h3>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Build Status</span>
                    <Badge
                      variant={isBuilt ? 'default' : 'destructive'}
                      className="flex items-center gap-1"
                    >
                      {isChecking ? (
                        <>
                          <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
                          Checking...
                        </>
                      ) : isBuilt ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Built
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Not Built
                        </>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Transport</span>
                    <Badge variant="outline">stdio</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Server Location</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleOpenFolder}
                      className="h-7 text-xs"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open Folder
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Quick Stats
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <div className="text-xl font-bold text-primary">{MCP_TOOLS.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Available Tools</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <div className="text-xl font-bold text-green-500">Read-Only</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Query Mode</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <div className="text-xl font-bold text-blue-500">PostgreSQL</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Database Type</div>
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Claude Desktop Configuration</h3>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Config Path:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyCommand(configPath)}
                        className="h-6 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Path
                      </Button>
                    </div>
                    <code className="text-xs bg-background px-2 py-1.5 rounded block overflow-x-auto font-mono break-all">
                      {configPath}
                    </code>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Configuration JSON:
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyConfig}
                        className="h-6 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Config
                      </Button>
                    </div>
                    <pre className="text-xs bg-background px-2 py-1.5 rounded overflow-x-auto font-mono max-h-24 overflow-y-auto break-all">
                      {configJson || 'Loading...'}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Quick Setup with Claude Code */}
              {claudeCodeInstalled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-500" />
                      Quick Setup with Claude Code
                    </h3>
                    <Badge variant="default" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Claude Code Detected
                    </Badge>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">CLI Command:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyCommand(claudeCodeCommand)}
                        className="h-6 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="text-xs bg-background px-2 py-1.5 rounded overflow-x-auto font-mono break-all">
                      {claudeCodeCommand || 'Loading...'}
                    </pre>
                  </div>
                  <Button onClick={handleAddToClaudeCode} disabled={isAddingToClaudeCode} size="sm" className="w-full">
                    {isAddingToClaudeCode ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Add to Claude Code
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end pt-2 flex-shrink-0">
                <Button variant="outline" onClick={checkServerStatus} size="sm">
                  <Server className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

