import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/contexts/SettingsContext';

export interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Settings({ open, onOpenChange }: SettingsProps) {
  const { theme, toggleTheme } = useTheme();
  const { settings, setQueryPreviewLimit, setEditingEnabled } = useSettings();
  const [previewLimitInput, setPreviewLimitInput] = useState(
    String(settings.queryPreviewLimit)
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    setPreviewLimitInput(String(settings.queryPreviewLimit));
  }, [settings.queryPreviewLimit]);

  const commitPreviewLimit = () => {
    const parsed = Number.parseInt(previewLimitInput, 10);
    if (Number.isNaN(parsed)) {
      setPreviewLimitInput(String(settings.queryPreviewLimit));
      return;
    }
    setQueryPreviewLimit(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="theme-toggle" className="text-base">
                Theme
              </Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isDark ? (
                  <>
                    <Moon className="h-4 w-4" />
                    <span>Dark mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4" />
                    <span>Light mode</span>
                  </>
                )}
              </div>
            </div>
            <Switch
              id="theme-toggle"
              checked={isDark}
              onCheckedChange={toggleTheme}
            />
          </div>

          {/* Editing toggle */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="editing-toggle" className="text-base">
                  Enable table editing
                </Label>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Allows inline edits to table previews. Changes are held locally until you apply them.
                </p>
              </div>
              <Switch
                id="editing-toggle"
                checked={settings.editingEnabled}
                onCheckedChange={setEditingEnabled}
              />
            </div>
            {settings.editingEnabled && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2">
                Editing runs UPDATE statements against the connected database. Review changes carefully before applying them.
              </div>
            )}
          </div>

          {/* Table preview limit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="preview-limit" className="text-base">
                Table preview row limit
              </Label>
              <Input
                id="preview-limit"
                type="number"
                min={1}
                max={10000}
                value={previewLimitInput}
                onChange={(event) => setPreviewLimitInput(event.target.value)}
                onBlur={commitPreviewLimit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitPreviewLimit();
                  }
                }}
                className="w-24 text-right"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Controls how many rows load when you sample a table. Supports pagination via “Load more”.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

