import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Cloud,
  Code,
  FileText,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useS3 } from '@/hooks/useS3';
import type { StoredS3Profile } from '@/types/s3';

const s3ConnectionFormSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
  endpoint: z.string().optional(),
  region: z.string().min(1, 'Region is required'),
  bucket: z.string().min(1, 'Bucket name is required'),
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
  sessionToken: z.string().optional(),
  pathPrefix: z.string().optional(),
  forcePathStyle: z.boolean(),
});

type S3ConnectionFormValues = z.infer<typeof s3ConnectionFormSchema>;

interface S3ConnectionFormProps {
  profile?: StoredS3Profile;
  onSuccess?: () => void;
  onCancel?: () => void;
  onSave?: (profile: Omit<StoredS3Profile, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

export function S3ConnectionForm({ profile, onSuccess, onCancel, onSave }: S3ConnectionFormProps) {
  const { testS3Connection } = useS3();
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showSessionToken, setShowSessionToken] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form');
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const form = useForm<S3ConnectionFormValues>({
    resolver: zodResolver(s3ConnectionFormSchema),
    defaultValues: {
      name: profile?.name || '',
      endpoint: profile?.endpoint || '',
      region: profile?.region || 'us-east-1',
      bucket: profile?.bucket || '',
      accessKeyId: profile?.accessKeyId || '',
      secretAccessKey: profile?.secretAccessKey || '',
      sessionToken: profile?.sessionToken || '',
      pathPrefix: profile?.pathPrefix || '',
      forcePathStyle: profile?.forcePathStyle || false,
    },
  });

  // Convert form values to JSON
  const formValuesToJson = (values: S3ConnectionFormValues): string => {
    const profileData = {
      name: values.name,
      endpoint: values.endpoint || undefined,
      region: values.region,
      bucket: values.bucket,
      accessKeyId: values.accessKeyId,
      secretAccessKey: values.secretAccessKey,
      sessionToken: values.sessionToken || undefined,
      pathPrefix: values.pathPrefix || undefined,
      forcePathStyle: values.forcePathStyle,
    };
    return JSON.stringify(profileData, null, 2);
  };

  // Initialize JSON input from form values when switching to JSON mode
  useEffect(() => {
    if (inputMode === 'json') {
      const values = form.getValues();
      setJsonInput(formValuesToJson(values));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  // Parse JSON and populate form
  const handleJsonToForm = () => {
    try {
      setJsonError(null);
      const parsed = JSON.parse(jsonInput);

      // Validate required fields
      if (!parsed.name || !parsed.region || !parsed.bucket || !parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error('Missing required fields: name, region, bucket, accessKeyId, secretAccessKey');
      }

      // Populate form
      form.reset({
        name: parsed.name || '',
        endpoint: parsed.endpoint || '',
        region: parsed.region || 'us-east-1',
        bucket: parsed.bucket || '',
        accessKeyId: parsed.accessKeyId || '',
        secretAccessKey: parsed.secretAccessKey || '',
        sessionToken: parsed.sessionToken || '',
        pathPrefix: parsed.pathPrefix || '',
        forcePathStyle: parsed.forcePathStyle || false,
      });

      setInputMode('form');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  // Update JSON when form values change (only if in form mode)
  useEffect(() => {
    if (inputMode === 'form') {
      const subscription = form.watch(() => {
        const values = form.getValues();
        setJsonInput(formValuesToJson(values));
      });
      return () => subscription.unsubscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);

    let testProfile;
    if (inputMode === 'json') {
      try {
        testProfile = JSON.parse(jsonInput);
      } catch (error) {
        setJsonError('Invalid JSON format');
        setIsTestingConnection(false);
        setTestResult('error');
        return;
      }
    } else {
      const values = form.getValues();
      testProfile = {
        name: values.name,
        endpoint: values.endpoint || undefined,
        region: values.region,
        bucket: values.bucket,
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
        sessionToken: values.sessionToken || undefined,
        pathPrefix: values.pathPrefix || undefined,
        forcePathStyle: values.forcePathStyle,
      };
    }

    try {
      await testS3Connection(testProfile);
      setTestResult('success');
    } catch (error) {
      console.error('S3 connection test failed:', error);
      setTestResult('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onSubmit = async (values: S3ConnectionFormValues) => {
    let profileData;

    if (inputMode === 'json') {
      try {
        profileData = JSON.parse(jsonInput);
      } catch (error) {
        setJsonError('Invalid JSON format');
        return;
      }
    } else {
      profileData = {
        name: values.name,
        endpoint: values.endpoint || undefined,
        region: values.region,
        bucket: values.bucket,
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
        sessionToken: values.sessionToken || undefined,
        pathPrefix: values.pathPrefix || undefined,
        forcePathStyle: values.forcePathStyle,
      };
    }

    if (onSave) {
      await onSave(profileData);
    }

    onSuccess?.();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'json') {
      // In JSON mode, submit directly without form validation
      onSubmit(form.getValues());
    } else {
      // In form mode, use form validation
      form.handleSubmit(onSubmit)(e);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Input Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={inputMode === 'form' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputMode('form')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Form
            </Button>
            <Button
              type="button"
              variant={inputMode === 'json' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (inputMode === 'form') {
                  const values = form.getValues();
                  setJsonInput(formValuesToJson(values));
                }
                setInputMode('json');
              }}
            >
              <Code className="h-4 w-4 mr-2" />
              JSON
            </Button>
          </div>
          {inputMode === 'json' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleJsonToForm}
            >
              Load from JSON
            </Button>
          )}
        </div>

        {/* Security Warning */}
        <Alert>
          <AlertDescription className="text-xs">
            Credentials are stored in plain text. Use with caution on shared systems.
          </AlertDescription>
        </Alert>

        {/* JSON Input Mode */}
        {inputMode === 'json' && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              S3 Connection JSON
            </label>
            <textarea
              className="w-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setJsonError(null);
              }}
              placeholder='{\n  "name": "My S3 Bucket",\n  "endpoint": "http://localhost:9000",\n  "region": "us-east-1",\n  "bucket": "test-bucket",\n  "accessKeyId": "your-access-key",\n  "secretAccessKey": "your-secret-key",\n  "forcePathStyle": true\n}'
            />
            {jsonError && (
              <p className="text-sm font-medium text-destructive mt-1">{jsonError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Enter S3 connection details as JSON. Click "Load from JSON" to populate the form, or test/save directly.
            </p>
          </div>
        )}

        {/* Form Input Mode */}
        {inputMode === 'form' && (
          <div key="form-mode">

        {/* Basic S3 Info */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Connection Name</FormLabel>
              <FormControl>
                <Input placeholder="My S3 Bucket" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bucket"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bucket Name</FormLabel>
              <FormControl>
                <Input placeholder="my-bucket" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Region</FormLabel>
                <FormControl>
                  <Input placeholder="us-east-1" {...field} />
                </FormControl>
                <FormDescription className="text-xs">
                  AWS region (e.g., us-east-1, eu-west-1)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endpoint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom Endpoint (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="https://s3.example.com" {...field} />
                </FormControl>
                <FormDescription className="text-xs">
                  For MinIO, R2, or other S3-compatible services
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Credentials */}
        <FormField
          control={form.control}
          name="accessKeyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Access Key ID</FormLabel>
              <FormControl>
                <Input placeholder="AKIAIOSFODNN7EXAMPLE" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="secretAccessKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Secret Access Key</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showSecretKey ? 'text' : 'password'}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? (
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

        <FormField
          control={form.control}
          name="sessionToken"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session Token (Optional)</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showSessionToken ? 'text' : 'password'}
                    placeholder="For temporary credentials"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSessionToken(!showSessionToken)}
                  >
                    {showSessionToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormDescription className="text-xs">
                Required for temporary AWS credentials (STS)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advanced Options */}
        <FormField
          control={form.control}
          name="pathPrefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Path Prefix (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="my-folder/" {...field} />
              </FormControl>
              <FormDescription className="text-xs">
                Limit access to a specific folder within the bucket
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="forcePathStyle"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Force Path-Style Addressing</FormLabel>
                <FormDescription className="text-xs">
                  Required for MinIO and some S3-compatible services
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

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
                : 'Connection test failed. Check your credentials and bucket name.'}
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
              <>
                <Cloud className="mr-2 h-4 w-4" />
                Test Connection
              </>
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
          </div>
        )}
      </form>
    </Form>
  );
}
