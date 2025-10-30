import { Play, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QueryPanel() {
  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Query Editor</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default">
            <Play className="h-4 w-4 mr-1" />
            Run Query
          </Button>
          <Button size="icon" variant="ghost">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Query Editor Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 font-mono text-sm bg-muted/20">
          <div className="text-muted-foreground">
            -- Write your SQL query here
            <br />
            -- Example: SELECT * FROM users LIMIT 10;
          </div>
        </div>

        {/* Results Area */}
        <div className="h-1/2 border-t">
          <div className="flex items-center gap-2 border-b px-4 py-2 bg-muted/50">
            <span className="text-sm font-medium">Results</span>
          </div>
          <div className="flex items-center justify-center h-[calc(100%-41px)] text-muted-foreground">
            <div className="text-center">
              <Play className="h-12 w-12 mb-4 opacity-20 mx-auto" />
              <p className="text-sm">Execute a query to see results</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
