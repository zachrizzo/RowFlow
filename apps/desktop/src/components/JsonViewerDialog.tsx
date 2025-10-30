import { useState } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface JsonViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: any;
  title?: string;
}

export function JsonViewerDialog({
  open,
  onOpenChange,
  value,
  title = 'JSON Viewer',
}: JsonViewerDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const formattedJson = JSON.stringify(value, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied',
        description: 'JSON copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy JSON',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Pretty-printed JSON value
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <CheckCheck className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <pre className="bg-muted/30 rounded-md p-4 text-xs font-mono overflow-x-auto">
            <code className="language-json">
              <JsonHighlight json={value} />
            </code>
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Simple JSON syntax highlighter
function JsonHighlight({ json }: { json: any }) {
  const formatted = JSON.stringify(json, null, 2);

  // Simple regex-based syntax highlighting
  const highlighted = formatted
    .replace(
      /"([^"]+)":/g,
      '<span class="text-blue-400">"$1"</span>:'
    )
    .replace(
      /: "([^"]*)"/g,
      ': <span class="text-green-400">"$1"</span>'
    )
    .replace(
      /: (\d+)/g,
      ': <span class="text-orange-400">$1</span>'
    )
    .replace(
      /: (true|false)/g,
      ': <span class="text-purple-400">$1</span>'
    )
    .replace(
      /: null/g,
      ': <span class="text-muted-foreground italic">null</span>'
    );

  return <div dangerouslySetInnerHTML={{ __html: highlighted }} />;
}
