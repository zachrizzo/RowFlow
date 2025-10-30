import { useState } from 'react';
import { Check, X, Braces, List } from 'lucide-react';
import { formatCellValue, getValueType, copyCellToClipboard } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ResultCellProps {
  value: any;
  onExpand?: (value: any) => void;
}

export function ResultCell({ value, onExpand }: ResultCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();
  const valueType = getValueType(value);

  const handleClick = async () => {
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

  const handleDoubleClick = () => {
    if ((valueType === 'object' || valueType === 'array') && onExpand) {
      onExpand(value);
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
          <span className="font-mono text-xs tabular-nums">{value}</span>
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
        'px-3 py-2 h-full flex items-center cursor-pointer transition-colors',
        'hover:bg-accent/50',
        valueType === 'number' && 'justify-end',
        isHovered && 'ring-1 ring-primary/50 ring-inset'
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={
        valueType === 'object' || valueType === 'array'
          ? 'Click to copy, double-click to expand'
          : 'Click to copy'
      }
    >
      {renderValue()}
    </div>
  );
}
