import { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useS3 } from '@/hooks/useS3';
import { useToast } from '@/hooks/use-toast';
import { getFileTypeInfo, formatFileSize } from '@/lib/fileTypes';
import type { S3Object } from '@/types/s3';

interface FilePreviewDialogProps {
  connectionId: string;
  object: S3Object;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewDialog({
  connectionId,
  object,
  open,
  onOpenChange,
}: FilePreviewDialogProps) {
  const { getS3Object } = useS3();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Uint8Array | null>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);

  const typeInfo = getFileTypeInfo(object.key, object.contentType);
  const fileName = object.key.split('/').pop() || object.key;

  useEffect(() => {
    if (!open) {
      setContent(null);
      if (contentUrl) {
        URL.revokeObjectURL(contentUrl);
        setContentUrl(null);
      }
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      try {
        const result = await getS3Object(connectionId, { key: object.key });
        const bytes = new Uint8Array(result.content);
        setContent(bytes);

        // Create object URL for certain file types
        if (['image', 'video', 'audio', 'pdf'].includes(typeInfo.type)) {
          const blob = new Blob([bytes], {
            type: result.contentType || 'application/octet-stream',
          });
          const url = URL.createObjectURL(blob);
          setContentUrl(url);
        }
      } catch (error) {
        console.error('Failed to load object:', error);
        toast({
          title: 'Error',
          description: 'Failed to load file content',
          variant: 'destructive',
        });
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    };

    loadContent();

    return () => {
      if (contentUrl) {
        URL.revokeObjectURL(contentUrl);
      }
    };
  }, [open, object.key, connectionId]);

  const handleDownload = () => {
    if (!content) return;

    const blob = new Blob([content as BlobPart], {
      type: object.contentType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Success',
      description: `Downloaded ${fileName}`,
    });
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!content) {
      return <div className="text-center py-8 text-muted-foreground">No content</div>;
    }

    switch (typeInfo.type) {
      case 'image':
        return (
          <div className="flex items-center justify-center max-h-[70vh] overflow-auto bg-muted/20 rounded">
            <img
              src={contentUrl || ''}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center bg-black rounded">
            <video
              src={contentUrl || ''}
              controls
              className="max-w-full max-h-[70vh]"
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center justify-center py-8">
            <audio src={contentUrl || ''} controls className="w-full max-w-md">
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case 'pdf':
        return (
          <div className="w-full h-[70vh] bg-muted/20 rounded">
            <iframe
              src={contentUrl || ''}
              className="w-full h-full border-0"
              title={fileName}
            />
          </div>
        );

      case 'text':
      case 'markdown':
      case 'csv':
      case 'code':
      case 'json':
      case 'xml':
        const text = new TextDecoder().decode(content);
        return (
          <div className="bg-muted/20 rounded p-4 max-h-[70vh] overflow-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {text}
            </pre>
          </div>
        );

      default:
        return (
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">
              Preview not available for this file type
            </p>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-12">
            <div className="flex flex-col gap-1">
              <span className="truncate">{fileName}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatFileSize(object.size)} • {typeInfo.type}
              </span>
            </div>
          </DialogTitle>
          <div className="absolute right-12 top-4">
            <Button variant="outline" size="icon" onClick={handleDownload} disabled={!content}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  );
}
