import { useState } from 'react';
import { Folder, ArrowUp, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getFileTypeInfo, formatFileSize, getFileIcon } from '@/lib/fileTypes';
import { useS3 } from '@/hooks/useS3';
import { useToast } from '@/hooks/use-toast';
import { FilePreviewDialog } from './FilePreviewDialog';
import type { S3Object } from '@/types/s3';

interface S3ObjectListProps {
  connectionId: string;
  objects: S3Object[];
  directories: string[];
  selectedKeys: Set<string>;
  viewMode: 'grid' | 'list';
  onObjectClick: (object: S3Object) => void;
  onDirectoryClick: (prefix: string) => void;
  onNavigateUp?: () => void;
}

export function S3ObjectList({
  connectionId,
  objects,
  directories,
  selectedKeys,
  viewMode,
  onObjectClick,
  onDirectoryClick,
  onNavigateUp,
}: S3ObjectListProps) {
  const { getS3Object } = useS3();
  const { toast } = useToast();
  const [previewObject, setPreviewObject] = useState<S3Object | null>(null);

  const handleDownload = async (object: S3Object, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const result = await getS3Object(connectionId, { key: object.key });

      // Convert byte array to blob
      const blob = new Blob([new Uint8Array(result.content)], {
        type: result.contentType || 'application/octet-stream',
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = object.key.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: `Downloaded ${object.key}`,
      });
    } catch (error) {
      console.error('Failed to download object:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const handlePreview = (object: S3Object, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewObject(object);
  };

  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
          {/* Navigate Up */}
          {onNavigateUp && (
            <div
              className="flex flex-col items-center justify-center p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={onNavigateUp}
            >
              <ArrowUp className="h-12 w-12 text-muted-foreground mb-2" />
              <span className="text-xs text-muted-foreground">Up</span>
            </div>
          )}

          {/* Directories */}
          {directories.map((dir) => (
            <div
              key={dir}
              className="flex flex-col items-center justify-center p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onDirectoryClick(dir)}
            >
              <Folder className="h-12 w-12 text-blue-500 mb-2" />
              <span className="text-xs text-center truncate w-full">
                {dir.split('/').filter(Boolean).pop()}
              </span>
            </div>
          ))}

          {/* Objects */}
          {objects.map((object) => {
            const typeInfo = getFileTypeInfo(object.key, object.contentType);
            const Icon = getFileIcon(typeInfo.type);
            const isSelected = selectedKeys.has(object.key);
            const fileName = object.key.split('/').pop() || object.key;

            return (
              <div
                key={object.key}
                className={cn(
                  'relative flex flex-col items-center justify-center p-4 border rounded-lg cursor-pointer transition-colors',
                  isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                )}
                onClick={() => onObjectClick(object)}
              >
                <Checkbox
                  checked={isSelected}
                  className="absolute top-2 left-2"
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => onObjectClick(object)}
                />

                {typeInfo.canPreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={(e) => handlePreview(object, e)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                )}

                <Icon className="h-12 w-12 text-muted-foreground mb-2" />
                <span className="text-xs text-center truncate w-full" title={fileName}>
                  {fileName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(object.size)}
                </span>
              </div>
            );
          })}
        </div>

        {previewObject && (
          <FilePreviewDialog
            connectionId={connectionId}
            object={previewObject}
            open={!!previewObject}
            onOpenChange={(open) => !open && setPreviewObject(null)}
          />
        )}
      </>
    );
  }

  // List view
  return (
    <>
      <div className="divide-y">
        {/* Navigate Up */}
        {onNavigateUp && (
          <div
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={onNavigateUp}
          >
            <ArrowUp className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm">..</span>
          </div>
        )}

        {/* Directories */}
        {directories.map((dir) => (
          <div
            key={dir}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onDirectoryClick(dir)}
          >
            <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <span className="flex-1 text-sm truncate">
              {dir.split('/').filter(Boolean).pop()}
            </span>
          </div>
        ))}

        {/* Objects */}
        {objects.map((object) => {
          const typeInfo = getFileTypeInfo(object.key, object.contentType);
          const Icon = getFileIcon(typeInfo.type);
          const isSelected = selectedKeys.has(object.key);
          const fileName = object.key.split('/').pop() || object.key;

          return (
            <div
              key={object.key}
              className={cn(
                'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
              )}
              onClick={() => onObjectClick(object)}
            >
              <Checkbox
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => onObjectClick(object)}
              />
              <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm truncate" title={fileName}>
                {fileName}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(object.size)}
              </span>
              <span className="text-xs text-muted-foreground w-32 text-right">
                {new Date(object.lastModified).toLocaleDateString()}
              </span>

              <div className="flex gap-1">
                {typeInfo.canPreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => handlePreview(object, e)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => handleDownload(object, e)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {previewObject && (
        <FilePreviewDialog
          connectionId={connectionId}
          object={previewObject}
          open={!!previewObject}
          onOpenChange={(open) => !open && setPreviewObject(null)}
        />
      )}
    </>
  );
}
