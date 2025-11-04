import { Check, X, Braces, List } from 'lucide-react';
import { formatCellValue, getValueType, copyCellToClipboard } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ResultCellProps {
  value: unknown;
}

export function ResultCell({ value }: ResultCellProps) {
  const { toast } = useToast();
  const valueType = getValueType(value);

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
