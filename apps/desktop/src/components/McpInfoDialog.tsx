import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Database,
  Zap,
  FileText,
  Settings,
  Lock,
  XOctagon,
  Search,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  MCP_TOOLS,
  getConfigJsonString,
  getClaudeDesktopConfigPath,
  INSTALLATION_STEPS,
  MCP_SERVER_VERSION,
  isMcpServerBuilt,
  getMcpServerPath,
  getClaudeCodeCommand,
  isClaudeCodeInstalled,
  addToClaudeCode,
} from '@/lib/mcpConfig';

interface McpInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toolIcons: Record<string, typeof Database> = {
  'pg.describe': Database,
  'pg.query': Search,
  'pg.explain': BarChart3,
  'pg.sample': FileText,
  'pg.locks': Lock,
  'pg.cancel': XOctagon,
};

export function McpInfoDialog({ open, onOpenChange }: McpInfoDialogProps) {
  const { toast } = useToast();
  const [isBuilt, setIsBuilt] = useState(false);
  const [configPath, setConfigPath] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [claudeCodeInstalled, setClaudeCodeInstalled] = useState(false);
  const [claudeCodeCommand, setClaudeCodeCommand] = useState('');
  const [isAddingToClaudeCode, setIsAddingToClaudeCode] = useState(false);
  const [configJson, setConfigJson] = useState('');

  useEffect(() => {
    if (open) {
      checkServerStatus();
      loadConfigPath();
      loadClaudeCodeInfo();
      loadConfigJson();
    }
  }, [open]);

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

  const handleTestConnection = () => {
    if (!isBuilt) {
      toast({
        title: 'Server Not Built',
        description: 'Please build the MCP server first (see Setup tab)',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Connection Test',
      description: 'To test the MCP server, use it from Claude Desktop after setup',
    });
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Server Details
          </DialogTitle>
          <DialogDescription>
            RowFlow PostgreSQL MCP Server - v{MCP_SERVER_VERSION}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools">Tools ({MCP_TOOLS.length})</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Server Status */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Server Status
              </h3>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
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
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Quick Stats
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{MCP_TOOLS.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Available Tools</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-green-500">Read-Only</div>
                  <div className="text-xs text-muted-foreground mt-1">Query Mode</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-500">PostgreSQL</div>
                  <div className="text-xs text-muted-foreground mt-1">Database Type</div>
                </div>
              </div>
            </div>

            {/* Quick Start */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Quick Start</h3>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  The MCP server allows Claude Desktop to interact with your PostgreSQL databases
                  using natural language. Once configured, you can ask Claude to:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Describe your database schema</li>
                  <li>Run SELECT queries to fetch data</li>
                  <li>Analyze query performance with EXPLAIN</li>
                  <li>Sample data from tables</li>
                  <li>Monitor and manage database locks</li>
                  <li>Cancel long-running queries</li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleTestConnection} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
              <Button variant="outline" onClick={checkServerStatus}>
                <Server className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
            </div>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The following tools are available for Claude to use with your PostgreSQL databases:
              </p>
              <div className="space-y-3">
                {MCP_TOOLS.map((tool) => {
                  const Icon = toolIcons[tool.name] || Database;
                  return (
                    <div
                      key={tool.name}
                      className="rounded-lg border border-border bg-muted/30 p-4 space-y-2"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-primary/10 p-2">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold font-mono">{tool.name}</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
                          <div className="mt-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-medium text-muted-foreground min-w-[60px]">
                                Inputs:
                              </span>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                                {tool.inputs}
                              </code>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-xs font-medium text-muted-foreground min-w-[60px]">
                                Example:
                              </span>
                              <span className="text-xs text-muted-foreground italic">
                                {tool.example}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Setup Tab */}
          <TabsContent value="setup" className="space-y-6">
            {/* Installation Steps */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Installation Steps</h3>
              <div className="space-y-3">
                {INSTALLATION_STEPS.map((step, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-muted/30 p-4 space-y-2"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <h4 className="text-sm font-semibold">{step.title}</h4>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-3 py-1.5 rounded flex-1 font-mono">
                            {step.command}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyCommand(step.command)}
                            className="h-7"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Claude Desktop Config */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Claude Desktop Configuration</h3>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="space-y-2">
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
                  <code className="text-xs bg-background px-3 py-2 rounded block overflow-x-auto font-mono">
                    {configPath}
                  </code>
                </div>
                <div className="space-y-2">
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
                  <pre className="text-xs bg-background px-3 py-2 rounded overflow-x-auto font-mono">
                    {configJson || 'Loading...'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Claude Code CLI Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  Quick Setup with Claude Code
                </h3>
                <Badge variant={claudeCodeInstalled ? 'default' : 'secondary'} className="text-xs">
                  {claudeCodeInstalled ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Claude Code Detected
                    </>
                  ) : (
                    'Manual Setup Available'
                  )}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                Use the Claude Code CLI to automatically add the MCP server configuration with one command.
              </p>

              {/* Command Display */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
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
                <pre className="text-xs bg-background px-3 py-2 rounded overflow-x-auto font-mono">
                  {claudeCodeCommand || 'Loading...'}
                </pre>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {claudeCodeInstalled && (
                  <Button onClick={handleAddToClaudeCode} disabled={isAddingToClaudeCode} size="sm">
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
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyCommand(claudeCodeCommand)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Command
                </Button>
              </div>

              {/* Manual Steps */}
              <div className="text-xs text-muted-foreground space-y-2 bg-muted/20 p-3 rounded-lg">
                <p className="font-semibold">Manual setup steps:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Copy the command above</li>
                  <li>Open your terminal</li>
                  <li>Paste and run the command</li>
                  <li>Restart Claude Code</li>
                  <li>Test with: "List my database connections using RowFlow"</li>
                </ol>
              </div>
            </div>

            {/* Important Notes */}
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                <Server className="h-4 w-4" />
                Important Notes
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                <li>The MCP server must be built before it can be used</li>
                <li>Claude Desktop must be completely restarted after adding the configuration</li>
                <li>All database operations are read-only for safety</li>
                <li>The server uses your RowFlow connection profiles</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
