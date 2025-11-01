import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';

interface SettingsState {
  queryPreviewLimit: number;
  editingEnabled: boolean;
}

interface SettingsContextValue {
  settings: SettingsState;
  setQueryPreviewLimit: (limit: number) => void;
  setEditingEnabled: (enabled: boolean) => void;
}

const SETTINGS_STORAGE_KEY = 'rowflow-settings';
const DEFAULT_SETTINGS: SettingsState = {
  queryPreviewLimit: 100,
  editingEnabled: false,
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function clampPreviewLimit(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.queryPreviewLimit;
  }
  return Math.min(Math.max(Math.round(value), 1), 10000);
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<SettingsState>(() => DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        setSettings((prev) => ({
          ...prev,
          queryPreviewLimit: clampPreviewLimit(
            parsed.queryPreviewLimit ?? DEFAULT_SETTINGS.queryPreviewLimit
          ),
          editingEnabled:
            typeof parsed.editingEnabled === 'boolean'
              ? parsed.editingEnabled
              : DEFAULT_SETTINGS.editingEnabled,
        }));
      }
    } catch (error) {
      console.error('[Settings] Failed to load settings from storage:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('[Settings] Failed to persist settings:', error);
    }
  }, [settings]);

  const setQueryPreviewLimit = useCallback((limit: number) => {
    setSettings((prev) => ({
      ...prev,
      queryPreviewLimit: clampPreviewLimit(limit),
    }));
  }, []);

  const setEditingEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      editingEnabled: Boolean(enabled),
    }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      setQueryPreviewLimit,
      setEditingEnabled,
    }),
    [settings, setQueryPreviewLimit, setEditingEnabled]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
