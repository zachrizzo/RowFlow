import { Database, Table, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SchemaStats as SchemaStatsType } from '@/types/schema';

interface SchemaStatsProps {
  stats: SchemaStatsType;
  loading?: boolean;
  onRefresh?: () => void;
}

export function SchemaStats({ stats, loading = false, onRefresh }: SchemaStatsProps) {
  return (
    <div className="border-t bg-muted/30">
      <div className="p-3 space-y-2">
        {/* Header with refresh button */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Statistics</h3>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        <Separator />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Schemas */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-background/50">
            <Database className="h-4 w-4 text-blue-500" />
            <div className="flex-1 min-w-0">
              <div className="text-muted-foreground">Schemas</div>
              <div className="font-semibold">{stats.totalSchemas}</div>
            </div>
          </div>

          {/* Tables */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-background/50">
            <Table className="h-4 w-4 text-green-500" />
            <div className="flex-1 min-w-0">
              <div className="text-muted-foreground">Tables</div>
              <div className="font-semibold">{stats.totalTables}</div>
            </div>
          </div>

          {/* Views */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-background/50">
            <Eye className="h-4 w-4 text-purple-500" />
            <div className="flex-1 min-w-0">
              <div className="text-muted-foreground">Views</div>
              <div className="font-semibold">{stats.totalViews}</div>
            </div>
          </div>

          {/* Schema Types */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-background/50">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User</span>
                <Badge variant="secondary" className="h-5 text-xs">
                  {stats.userSchemas}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">System</span>
                <Badge variant="outline" className="h-5 text-xs">
                  {stats.systemSchemas}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
