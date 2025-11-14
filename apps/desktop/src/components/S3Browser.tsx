import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Home, Folder, Upload, Trash2, RefreshCw, Grid3x3, List, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useS3 } from '@/hooks/useS3';
import { S3ObjectList } from './S3ObjectList';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { S3Object, StoredS3Profile } from '@/types/s3';

interface S3BrowserProps {
  profile: StoredS3Profile;
  onClose?: () => void;
}

export function S3Browser({ profile, onClose }: S3BrowserProps) {
  const { connectS3, disconnectS3, listS3Objects, deleteS3Objects, putS3Object } = useS3();
  const { toast } = useToast();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  const [currentPrefix, setCurrentPrefix] = useState('');
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterText, setFilterText] = useState('');
  const [continuationToken, setContinuationToken] = useState<string | undefined>();
  const [connecting, setConnecting] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Upload progress tracking
  interface UploadProgress {
    fileName: string;
    status: 'uploading' | 'success' | 'error';
    progress: number; // 0-100
    error?: string;
  }
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);

  // Connect to S3 on mount
  useEffect(() => {
    let isMounted = true;

    connectionIdRef.current = null;
    setConnectionId(null);
    setConnecting(true);

    const connect = async () => {
      try {
        const connId = await connectS3({
          name: profile.name,
          endpoint: profile.endpoint,
          region: profile.region,
          bucket: profile.bucket,
          accessKeyId: profile.accessKeyId,
          secretAccessKey: profile.secretAccessKey,
          sessionToken: profile.sessionToken,
          pathPrefix: profile.pathPrefix,
          forcePathStyle: profile.forcePathStyle,
        });

        if (!isMounted) {
          await disconnectS3(connId).catch(console.error);
          return;
        }

        connectionIdRef.current = connId;
        setConnectionId(connId);
      } catch (error) {
        console.error('Failed to connect to S3:', error);
        if (isMounted) {
          toast({
            title: 'Connection Failed',
            description: 'Failed to connect to S3. Please check your credentials.',
            variant: 'destructive',
          });
        }
      } finally {
        if (isMounted) {
          setConnecting(false);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      const id = connectionIdRef.current;
      if (id) {
        disconnectS3(id).catch(console.error);
      }
      connectionIdRef.current = null;
    };
  }, [profile, connectS3, disconnectS3, toast]);

  // Load objects
  const loadObjects = async (prefix: string = currentPrefix, append: boolean = false) => {
    if (!connectionId) return;

    setLoading(true);
    try {
      const result = await listS3Objects(connectionId, {
        prefix: prefix || undefined,
        delimiter: '/',
        maxKeys: 1000,
        continuationToken: append ? continuationToken : undefined,
      });

      if (append) {
        setObjects(prev => [...prev, ...result.objects]);
      } else {
        setObjects(result.objects);
      }

      setDirectories(result.commonPrefixes);
      setContinuationToken(result.continuationToken);
    } catch (error) {
      console.error('Failed to load S3 objects:', error);
      toast({
        title: 'Error',
        description: 'Failed to load objects from S3',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connectionId) {
      loadObjects(currentPrefix);
    }
  }, [connectionId, currentPrefix]);

  // Navigate to prefix
  const navigateToPrefix = (prefix: string) => {
    setCurrentPrefix(prefix);
    setSelectedKeys(new Set());
  };

  // Navigate up one level
  const navigateUp = () => {
    if (!currentPrefix) return;

    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    navigateToPrefix(newPrefix);
  };

  // Handle directory click
  const handleDirectoryClick = (dirPrefix: string) => {
    navigateToPrefix(dirPrefix);
  };

  // Handle object click
  const handleObjectClick = (object: S3Object) => {
    // Toggle selection
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(object.key)) {
      newSelected.delete(object.key);
    } else {
      newSelected.add(object.key);
    }
    setSelectedKeys(newSelected);
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      console.log('No files selected');
      return;
    }
    
    if (!connectionId) {
      toast({
        title: 'Error',
        description: 'Connection lost. Please reconnect.',
        variant: 'destructive',
      });
      return;
    }

    console.log(`Starting upload of ${files.length} file(s)`);

      const fileArray = Array.from(files);
      setIsUploading(true);
      const progressMap = new Map<string, UploadProgress>();

      // Initialize progress for all files
      fileArray.forEach((file) => {
        progressMap.set(file.name, {
          fileName: file.name,
          status: 'uploading',
          progress: 0,
        });
      });
      setUploadProgress(new Map(progressMap));

      let uploadedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const fileId = file.name;

        try {
          // Update progress to show file is being processed
          progressMap.set(fileId, {
            fileName: file.name,
            status: 'uploading',
            progress: 10, // Initial progress
          });
          setUploadProgress(new Map(progressMap));

          // Read file
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          // Update progress
          progressMap.set(fileId, {
            fileName: file.name,
            status: 'uploading',
            progress: 30,
          });
          setUploadProgress(new Map(progressMap));

          const key = currentPrefix + file.name;

          // Upload file
          await putS3Object(connectionId, {
            key,
            content: Array.from(bytes),
            contentType: file.type || undefined,
          });

          // Mark as success
          progressMap.set(fileId, {
            fileName: file.name,
            status: 'success',
            progress: 100,
          });
          setUploadProgress(new Map(progressMap));
          uploadedCount++;

          toast({
            title: 'Success',
            description: `Uploaded ${file.name}`,
          });
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          progressMap.set(fileId, {
            fileName: file.name,
            status: 'error',
            progress: 0,
            error: errorMessage,
          });
          setUploadProgress(new Map(progressMap));
          errorCount++;

          toast({
            title: 'Error',
            description: `Failed to upload ${file.name}`,
            variant: 'destructive',
          });
        }
      }

      // Reload objects after all uploads complete
      await loadObjects();

      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress(new Map());
        setIsUploading(false);
      }, 2000);

      // Reset the input so the same file can be selected again
      e.target.value = '';
    };

  // Handle file upload button click
  const handleUpload = () => {
    if (!connectionId) {
      toast({
        title: 'Error',
        description: 'Not connected to S3. Please wait for connection to establish.',
        variant: 'destructive',
      });
      return;
    }

    // Trigger the hidden file input
    const input = document.getElementById('s3-file-upload-input') as HTMLInputElement;
    if (input) {
      input.click();
    } else {
      toast({
        title: 'Error',
        description: 'File upload input not found',
        variant: 'destructive',
      });
    }
  };

  // Handle delete selected
  const handleDeleteSelected = async () => {
    if (!connectionId || selectedKeys.size === 0) return;

    setIsDeleting(true);
    try {
      const result = await deleteS3Objects(connectionId, {
        keys: Array.from(selectedKeys),
      });

      if (result.errors.length > 0) {
        toast({
          title: 'Warning',
          description: `Deleted ${result.deleted.length} objects, ${result.errors.length} failed`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Deleted ${result.deleted.length} object(s)`,
        });
      }

      setSelectedKeys(new Set());
      await loadObjects();
    } catch (error) {
      console.error('Failed to delete objects:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete objects',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleDeleteClick = () => {
    if (!connectionId || selectedKeys.size === 0) return;
    setIsDeleteDialogOpen(true);
  };

  // Breadcrumb navigation
  const breadcrumbs = currentPrefix
    ? currentPrefix.split('/').filter(Boolean)
    : [];

  // Filter objects
  const filteredObjects = filterText
    ? objects.filter(obj => obj.key.toLowerCase().includes(filterText.toLowerCase()))
    : objects;

  const filteredDirectories = filterText
    ? directories.filter(dir => dir.toLowerCase().includes(filterText.toLowerCase()))
    : directories;

  if (connecting) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Connecting to S3...</p>
        </div>
      </div>
    );
  }

  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-destructive">Failed to connect to S3</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4 space-y-3 flex-shrink-0">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Folder className="h-5 w-5" />
            {profile.name}
          </h2>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => navigateToPrefix('')}
          >
            <Home className="h-4 w-4" />
          </Button>
          {breadcrumbs.map((part, index) => (
            <div key={index} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  const prefix = breadcrumbs.slice(0, index + 1).join('/') + '/';
                  navigateToPrefix(prefix);
                }}
              >
                {part}
              </Button>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter objects..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1"
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadObjects()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Button variant="outline" size="sm" onClick={handleUpload}>
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteClick}
            disabled={selectedKeys.size === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete ({selectedKeys.size})
          </Button>

          <div className="flex border rounded">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        id="s3-file-upload-input"
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="*/*"
      />

      {/* Object List */}
      <div className="flex-1 overflow-auto min-h-0">
        <S3ObjectList
          connectionId={connectionId}
          objects={filteredObjects}
          directories={filteredDirectories}
          selectedKeys={selectedKeys}
          viewMode={viewMode}
          onObjectClick={handleObjectClick}
          onDirectoryClick={handleDirectoryClick}
          onNavigateUp={currentPrefix ? navigateUp : undefined}
        />
      </div>

      {/* Upload Progress Dialog */}
      <Dialog 
        open={isUploading || uploadProgress.size > 0}
        onOpenChange={(open) => {
          // Only allow closing if not currently uploading
          if (!isUploading && !open) {
            setUploadProgress(new Map());
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isUploading ? 'Uploading Files' : 'Upload Complete'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {Array.from(uploadProgress.values()).map((progress) => (
              <div key={progress.fileName} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate flex-1 mr-2">{progress.fileName}</span>
                  {progress.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  )}
                  {progress.status === 'success' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  )}
                  {progress.status === 'error' && (
                    <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  )}
                </div>
                {progress.status === 'uploading' && (
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%` }}
                    />
                  </div>
                )}
                {progress.status === 'success' && (
                  <div className="text-xs text-green-600">Upload complete</div>
                )}
                {progress.status === 'error' && (
                  <div className="text-xs text-red-600 truncate">
                    {progress.error || 'Upload failed'}
                  </div>
                )}
              </div>
            ))}
          </div>
          {uploadProgress.size > 0 && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {Array.from(uploadProgress.values()).filter(p => p.status === 'success').length} of {uploadProgress.size} files uploaded
                {Array.from(uploadProgress.values()).filter(p => p.status === 'error').length > 0 && (
                  <span className="text-red-600 ml-2">
                    ({Array.from(uploadProgress.values()).filter(p => p.status === 'error').length} failed)
                  </span>
                )}
              </div>
            </div>
          )}
          {!isUploading && uploadProgress.size > 0 && (
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUploadProgress(new Map());
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedKeys.size} object(s)?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The selected objects will be permanently removed from S3.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
