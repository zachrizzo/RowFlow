import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDatabase } from '@/hooks/useDatabase';
import type { StoredProfile } from '@/types/connection';

const connectionFormSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().optional(),
  readOnly: z.boolean(),
  tlsEnabled: z.boolean(),
  tlsVerifyCa: z.boolean(),
  tlsCaCertPath: z.string().optional(),
  tlsClientCertPath: z.string().optional(),
  tlsClientKeyPath: z.string().optional(),
  useSsh: z.boolean(),
  sshHost: z.string().optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  sshUsername: z.string().optional(),
  sshPassword: z.string().optional(),
  sshPrivateKeyPath: z.string().optional(),
  sshPassphrase: z.string().optional(),
  connectionTimeout: z.number().int().min(0).optional(),
  statementTimeout: z.number().int().min(0).optional(),
  lockTimeout: z.number().int().min(0).optional(),
  idleTimeout: z.number().int().min(0).optional(),
});

type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

interface ConnectionFormProps {
  profile?: StoredProfile;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ConnectionForm({ profile, onSuccess, onCancel }: ConnectionFormProps) {
  const { createProfile, updateProfile, testConnection } = useDatabase();
  const [showPassword, setShowPassword] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSshOptions, setShowSshOptions] = useState(false);

  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionFormSchema),
    defaultValues: {
      name: profile?.name || '',
      host: profile?.host || 'localhost',
      port: profile?.port || 5432,
      database: profile?.database || '',
      username: profile?.username || '',
      password: profile?.password || '',
      readOnly: profile?.readOnly || false,
      tlsEnabled: profile?.tlsConfig?.enabled || false,
      tlsVerifyCa: profile?.tlsConfig?.verifyCa || false,
      tlsCaCertPath: profile?.tlsConfig?.caCertPath || '',
      tlsClientCertPath: profile?.tlsConfig?.clientCertPath || '',
      tlsClientKeyPath: profile?.tlsConfig?.clientKeyPath || '',
      useSsh: profile?.useSsh || false,
      sshHost: profile?.sshConfig?.host || '',
      sshPort: profile?.sshConfig?.port || 22,
      sshUsername: profile?.sshConfig?.username || '',
      sshPassword: profile?.sshConfig?.password || '',
      sshPrivateKeyPath: profile?.sshConfig?.privateKeyPath || '',
      sshPassphrase: profile?.sshConfig?.passphrase || '',
      connectionTimeout: profile?.connectionTimeout || 30,
      statementTimeout: profile?.statementTimeout || 0,
      lockTimeout: profile?.lockTimeout || 0,
      idleTimeout: profile?.idleTimeout || 0,
    },
  });

  const handleTestConnection = async () => {
    const values = form.getValues();
    setIsTestingConnection(true);
    setTestResult(null);

    const testProfile = {
      name: values.name,
      host: values.host,
      port: values.port,
      database: values.database,
      username: values.username,
      password: values.password,
      readOnly: values.readOnly,
      useSsh: values.useSsh,
      sshConfig: values.useSsh
        ? {
            host: values.sshHost || '',
            port: values.sshPort || 22,
            username: values.sshUsername || '',
            password: values.sshPassword,
            privateKeyPath: values.sshPrivateKeyPath,
            passphrase: values.sshPassphrase,
          }
        : undefined,
      tlsConfig: values.tlsEnabled
        ? {
            enabled: true,
            verifyCa: values.tlsVerifyCa,
            caCertPath: values.tlsCaCertPath,
            clientCertPath: values.tlsClientCertPath,
            clientKeyPath: values.tlsClientKeyPath,
          }
        : { enabled: false, verifyCa: false },
      connectionTimeout: values.connectionTimeout,
      statementTimeout: values.statementTimeout,
      lockTimeout: values.lockTimeout,
      idleTimeout: values.idleTimeout,
    };

    const result = await testConnection(testProfile);
    setIsTestingConnection(false);
    setTestResult(result ? 'success' : 'error');
  };

  const onSubmit = async (values: ConnectionFormValues) => {
    const profileData = {
      name: values.name,
      host: values.host,
      port: values.port,
      database: values.database,
      username: values.username,
      password: values.password,
      readOnly: values.readOnly,
      useSsh: values.useSsh,
      sshConfig: values.useSsh
        ? {
            host: values.sshHost || '',
            port: values.sshPort || 22,
            username: values.sshUsername || '',
            password: values.sshPassword,
            privateKeyPath: values.sshPrivateKeyPath,
            passphrase: values.sshPassphrase,
          }
        : undefined,
      tlsConfig: values.tlsEnabled
        ? {
            enabled: true,
            verifyCa: values.tlsVerifyCa,
            caCertPath: values.tlsCaCertPath,
            clientCertPath: values.tlsClientCertPath,
            clientKeyPath: values.tlsClientKeyPath,
          }
        : { enabled: false, verifyCa: false },
      connectionTimeout: values.connectionTimeout,
      statementTimeout: values.statementTimeout,
      lockTimeout: values.lockTimeout,
      idleTimeout: values.idleTimeout,
    };

    if (profile?.id) {
      await updateProfile({
        ...profileData,
        id: profile.id,
        createdAt: profile.createdAt,
        updatedAt: Date.now(),
      });
    } else {
      await createProfile(profileData);
    }

    onSuccess?.();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Security Warning */}
        <Alert>
          <AlertDescription className="text-xs">
            Passwords are stored in plain text. Use with caution on shared systems.
          </AlertDescription>
        </Alert>

        {/* Basic Connection Info */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Connection Name</FormLabel>
              <FormControl>
                <Input placeholder="My Database" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="host"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Host</FormLabel>
                <FormControl>
                  <Input placeholder="localhost" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Port</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="5432" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="database"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Database</FormLabel>
              <FormControl>
                <Input placeholder="postgres" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="postgres" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Read-only Mode */}
        <FormField
          control={form.control}
          name="readOnly"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Read-only Mode</FormLabel>
                <FormDescription className="text-xs">
                  Prevent modifications to the database
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* SSL/TLS Options */}
        <FormField
          control={form.control}
          name="tlsEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Enable SSL/TLS</FormLabel>
                <FormDescription className="text-xs">
                  Use encrypted connection
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {form.watch('tlsEnabled') && (
          <div className="space-y-3 rounded-lg border p-3 bg-muted/50">
            <FormField
              control={form.control}
              name="tlsVerifyCa"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Verify CA Certificate</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tlsCaCertPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">CA Certificate Path</FormLabel>
                  <FormControl>
                    <Input placeholder="/path/to/ca.crt" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {/* SSH Tunnel */}
        <FormField
          control={form.control}
          name="useSsh"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>SSH Tunnel</FormLabel>
                <FormDescription className="text-xs">
                  Connect through SSH tunnel
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {form.watch('useSsh') && (
          <div className="space-y-3 rounded-lg border p-3 bg-muted/50">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sshHost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">SSH Host</FormLabel>
                    <FormControl>
                      <Input placeholder="ssh.example.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sshPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">SSH Port</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="22" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sshUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">SSH Username</FormLabel>
                  <FormControl>
                    <Input placeholder="user" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Collapsible open={showSshOptions} onOpenChange={setShowSshOptions}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="w-full">
                  {showSshOptions ? (
                    <ChevronUp className="h-4 w-4 mr-2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  )}
                  SSH Authentication Options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                <FormField
                  control={form.control}
                  name="sshPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">SSH Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showSshPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowSshPassword(!showSshPassword)}
                          >
                            {showSshPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sshPrivateKeyPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Private Key Path</FormLabel>
                      <FormControl>
                        <Input placeholder="/path/to/id_rsa" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sshPassphrase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Key Passphrase</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Advanced Settings */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full">
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 mr-2" />
              ) : (
                <ChevronDown className="h-4 w-4 mr-2" />
              )}
              Advanced Settings
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-3">
            <FormField
              control={form.control}
              name="connectionTimeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Connection Timeout (seconds)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="30" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    0 = no timeout
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="statementTimeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Statement Timeout (ms)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    0 = no timeout
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lockTimeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Lock Timeout (ms)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    0 = no timeout
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="idleTimeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Idle Timeout (seconds)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    0 = no timeout
                  </FormDescription>
                </FormItem>
              )}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult === 'success' ? 'default' : 'destructive'}>
            {testResult === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {testResult === 'success'
                ? 'Connection test successful!'
                : 'Connection test failed. Check the logs for details.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="flex-1"
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          <Button type="submit" className="flex-1">
            {profile ? 'Update' : 'Save'}
          </Button>

          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
