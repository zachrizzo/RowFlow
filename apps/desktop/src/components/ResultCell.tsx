import { Check, X, Braces, List, ExternalLink } from 'lucide-react';
import { formatCellValue, getValueType, copyCellToClipboard } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ResultCellProps {
  value: unknown;
  onS3UrlClick?: (url: string) => void;
}

// Detect if a string is an S3 URL
function isS3Url(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  // Match s3:// URLs
  if (value.startsWith('s3://')) return true;

  // Match https://bucket.s3.region.amazonaws.com/key
  if (/^https?:\/\/[\w.-]+\.s3[\w.-]*\.amazonaws\.com\//i.test(value)) return true;

  // Match https://s3.region.amazonaws.com/bucket/key
  if (/^https?:\/\/s3[\w.-]*\.amazonaws\.com\/[\w.-]+\//i.test(value)) return true;

  return false;
}

export function ResultCell({ value, onS3UrlClick }: ResultCellProps) {
  const { toast } = useToast();
  const valueType = getValueType(value);
  const isS3Link = isS3Url(value);

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await copyCellToClipboard(value);
      toast({
        title: 'Copied',
        description: 'Cell value copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy cell value',
        variant: 'destructive',
      });
    }
  };

  // Render based on value type
  const renderValue = () => {
    switch (valueType) {
      case 'null':
        return (
          <span className="italic text-muted-foreground/60 text-xs">NULL</span>
        );

      case 'boolean':
        return (
          <div className="flex items-center gap-1">
            {value ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-red-500" />
            )}
            <span className="text-xs">{value ? 'true' : 'false'}</span>
          </div>
        );

      case 'number':
        return (
          <span className="font-mono text-xs tabular-nums">{value as number}</span>
        );

      case 'object':
        return (
          <div className="flex items-center gap-1.5">
            <Braces className="h-3 w-3 text-blue-400" />
            <span className="text-xs truncate font-mono">
              {formatCellValue(value, 50)}
            </span>
          </div>
        );

      case 'array':
        return (
          <div className="flex items-center gap-1.5">
            <List className="h-3 w-3 text-purple-400" />
            <span className="text-xs truncate font-mono">
              {formatCellValue(value, 50)}
            </span>
          </div>
        );

      case 'date':
        return (
          <span className="text-xs text-orange-400 font-mono">
            {formatCellValue(value)}
          </span>
        );

      case 'string':
      default:
        // Check if it's an S3 URL
        if (isS3Link && onS3UrlClick) {
          return (
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs truncate flex-1 text-blue-500" title={String(value)}>
                {formatCellValue(value)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onS3UrlClick(String(value));
                }}
                title="Open in S3 Browser"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          );
        }

        return (
          <span className="text-xs truncate" title={String(value)}>
            {formatCellValue(value)}
          </span>
        );
    }
  };

  return (
    <div
      className={cn(
        'px-3 py-2 h-full flex items-center transition-colors cursor-pointer',
        'hover:bg-accent/50',
        valueType === 'number' && 'justify-end'
      )}
      onClick={handleClick}
      title="Click to copy"
    >
      {renderValue()}
    </div>
  );
}
