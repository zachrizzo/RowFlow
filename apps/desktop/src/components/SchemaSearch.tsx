import { useState, useEffect, useCallback } from 'react';
import { Search, X, Table, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FilterType } from '@/types/schema';

interface SchemaSearchProps {
  value: string;
  onChange: (value: string) => void;
  filterType: FilterType;
  onFilterChange: (filter: FilterType) => void;
  disabled?: boolean;
}

const DEBOUNCE_MS = 300;

export function SchemaSearch({
  value,
  onChange,
  filterType,
  onFilterChange,
  disabled = false,
}: SchemaSearchProps) {
  const [localValue, setLocalValue] = useState(value);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  // Sync external changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  const filters: { type: FilterType; label: string; icon: typeof Table }[] = [
    { type: 'all', label: 'All', icon: Search },
    { type: 'tables', label: 'Tables', icon: Table },
    { type: 'views', label: 'Views', icon: Eye },
  ];

  return (
    <div className="p-3 space-y-2 border-b bg-background">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search schemas, tables, columns..."
          className="pl-8 pr-8 h-9"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          disabled={disabled}
        />
        {localValue && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-9 w-9"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filter badges */}
      <div className="flex items-center gap-2">
        {filters.map((filter) => {
          const Icon = filter.icon;
          const isActive = filterType === filter.type;

          return (
            <Badge
              key={filter.type}
              variant={isActive ? 'default' : 'outline'}
              className={`cursor-pointer select-none hover:bg-primary/10 transition-colors ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={() => !disabled && onFilterChange(filter.type)}
            >
              <Icon className="h-3 w-3 mr-1" />
              {filter.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
