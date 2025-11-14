import { useMemo, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FolderTree,
  AlertCircle,
  Layers,
  ChevronRight,
  List,
  Minimize2,
  Maximize2,
  Maximize,
  Loader2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDatabase } from '@/hooks/useDatabase';
import { useSchema } from '@/hooks/useSchema';
import { SchemaSearch } from '@/components/SchemaSearch';
import { SchemaTree } from '@/components/SchemaTree';
import { SchemaGraph } from '@/components/SchemaGraph';
import { useToast } from '@/hooks/use-toast';
import { GenerateTestDataDialog } from '@/components/GenerateTestDataDialog';
import type { EmbeddingJobRequest, EmbeddingJobResult } from '@/types/ai';
import type {
  AddTableColumnRequest,
  Column,
  CreateSchemaRequest,
  CreateTableRequest,
  DeleteRowRequest,
  DropSchemaRequest,
  DropTableColumnRequest,
  DropTableRequest,
  InsertRowRequest,
  RenameSchemaRequest,
  TableColumnDefinition,
  ForeignKeySearchResult,
} from '@/types/connection';

const DATA_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'TEXT', label: 'TEXT' },
  { value: 'VARCHAR(255)', label: 'VARCHAR(255)' },
  { value: 'INTEGER', label: 'INTEGER' },
  { value: 'BIGINT', label: 'BIGINT' },
  { value: 'SMALLINT', label: 'SMALLINT' },
  { value: 'NUMERIC', label: 'NUMERIC' },
  { value: 'DECIMAL', label: 'DECIMAL' },
  { value: 'BOOLEAN', label: 'BOOLEAN' },
  { value: 'DATE', label: 'DATE' },
  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
  { value: 'TIMESTAMPTZ', label: 'TIMESTAMPTZ' },
  { value: 'TIME', label: 'TIME' },
  { value: 'UUID', label: 'UUID' },
  { value: 'JSONB', label: 'JSONB' },
  { value: 'custom', label: 'Custom…' },
];

const FK_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'NO ACTION', label: 'No Action (default)' },
  { value: 'CASCADE', label: 'Cascade' },
  { value: 'SET NULL', label: 'Set NULL' },
  { value: 'SET DEFAULT', label: 'Set DEFAULT' },
  { value: 'RESTRICT', label: 'Restrict' },
];

const SAME_SCHEMA_SENTINEL = '__same_schema__';
const NO_TABLES_SENTINEL = '__no_tables__';
const NO_COLUMNS_SENTINEL = '__no_columns__';
const INSERT_ROW_JSON_TEMPLATE = '{\n  "column": "value"\n}';

type ColumnOption = {
  name: string;
  dataType: string;
};

type ForeignKeyInfo = {
  schema?: string;
  table: string;
  column: string;
};

type ColumnDetail = ColumnOption & {
  isNullable: boolean;
  columnDefault?: string;
  hasDefault: boolean;
  foreignKey?: ForeignKeyInfo;
};

const sanitizeIdentifier = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_');

const isBooleanType = (dataType: string): boolean => dataType.toLowerCase().includes('bool');

const isNumericType = (dataType: string): boolean => {
  const normalized = dataType.toLowerCase();
  return (
    normalized.includes('int') ||
    normalized.includes('numeric') ||
    normalized.includes('decimal') ||
    normalized.includes('real') ||
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('money')
  );
};

const isJsonType = (dataType: string): boolean => dataType.toLowerCase().includes('json');

const formatPreviewValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > 40 ? `${value.slice(0, 37)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  }
  if (typeof value === 'object') {
    return '{…}';
  }
  return String(value ?? '');
};

const summarizeRow = (row: Record<string, unknown>): string => {
  const entries = Object.entries(row);
  if (entries.length === 0) {
    return '{}';
  }
  const summary = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatPreviewValue(value)}`)
    .join(', ');
  return entries.length > 3 ? `${summary}, …` : summary;
};

const getPlaceholderForType = (dataType: string): string | undefined => {
  const normalized = dataType.toLowerCase();
  if (normalized.includes('timestamp')) {
    return 'YYYY-MM-DD HH:MM:SS';
  }
  if (normalized.includes('date')) {
    return 'YYYY-MM-DD';
  }
  if (normalized.includes('time')) {
    return 'HH:MM:SS';
  }
  if (normalized.includes('uuid')) {
    return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  }
  return undefined;
};

type ColumnFormState = {
  name: string;
  dataType: string;
  useCustomType: boolean;
  customDataType: string;
  isNullable: boolean;
  defaultExpression: string;
  isPrimaryKey: boolean;
  referencesEnabled: boolean;
  referenceSchema: string;
  referenceTable: string;
  referenceColumn: string;
  referenceOnDelete: string;
  referenceOnUpdate: string;
  lockedTypeByReference: boolean;
};

const createEmptyColumn = (): ColumnFormState => ({
  name: '',
  dataType: 'TEXT',
  useCustomType: false,
  customDataType: '',
  isNullable: true,
  defaultExpression: '',
  isPrimaryKey: false,
  referencesEnabled: false,
  referenceSchema: '',
  referenceTable: '',
  referenceColumn: '',
  referenceOnDelete: 'NO ACTION',
  referenceOnUpdate: 'NO ACTION',
  lockedTypeByReference: false,
});

type AddColumnFormState = {
  name: string;
  dataType: string;
  useCustomType: boolean;
  customDataType: string;
  isNullable: boolean;
  defaultExpression: string;
  ifNotExists: boolean;
  referencesEnabled: boolean;
  referenceSchema: string;
  referenceTable: string;
  referenceColumn: string;
  referenceOnDelete: string;
  referenceOnUpdate: string;
  lockedTypeByReference: boolean;
};

type DeleteRowsFormState = {
  criteriaJson: string;
  limit: string;
};

type InsertRowFieldState = {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  include: boolean;
  mode: 'value' | 'null';
  value: string;
  foreignKey?: ForeignKeyInfo;
  lookupPreview?: string;
};

type ForeignKeySearchState = {
  fieldName: string;
  fieldLabel: string;
  schema: string;
  table: string;
  column: string;
  searchTerm: string;
  results: { key: string; row: Record<string, unknown> }[];
  loading: boolean;
  error: string | null;
};

type InsertRowFormState = {
  mode: 'form' | 'json';
  json: string;
  fields: InsertRowFieldState[];
};

type CreateSchemaFormState = {
  name: string;
  ifNotExists: boolean;
};

type RenameSchemaFormState = {
  currentName: string;
  newName: string;
};

type DropSchemaFormState = {
  name: string;
  cascade: boolean;
  ifExists: boolean;
};

export type PanelSize = 'minimized' | 'normal' | 'expanded';

interface SchemaPanelProps {
  onTableSelect?: (schema: string, table: string) => void;
  selectedTable?: { schema: string; table: string } | null;
  panelSize?: PanelSize;
  onPanelSizeChange?: (size: PanelSize) => void;
  onOpenSettings?: () => void;
}

export function SchemaPanel({
  onTableSelect,
  selectedTable,
  panelSize = 'normal',
  onPanelSizeChange,
  onOpenSettings,
}: SchemaPanelProps) {
  const { getActiveConnection } = useDatabase();
  const activeConnection = getActiveConnection();
  const { toast } = useToast();
  const connectionId = activeConnection?.connectionId || null;
  const [activeTab, setActiveTab] = useState<'tree' | 'graph'>('tree');
  const [createTableSchema, setCreateTableSchema] = useState<string | null>(null);
  const [createTableForm, setCreateTableForm] = useState<{
    tableName: string;
    ifNotExists: boolean;
    columns: ColumnFormState[];
  }>({
    tableName: '',
    ifNotExists: true,
    columns: [createEmptyColumn()],
  });
  const [dropTableTarget, setDropTableTarget] = useState<{ schema: string; table: string } | null>(null);
  const [dropTableOptions, setDropTableOptions] = useState<{ cascade: boolean; ifExists: boolean }>({
    cascade: false,
    ifExists: true,
  });
  const [addColumnTarget, setAddColumnTarget] = useState<{ schema: string; table: string } | null>(null);
  const [addColumnForm, setAddColumnForm] = useState<AddColumnFormState>({
    name: '',
    dataType: 'TEXT',
    useCustomType: false,
    customDataType: '',
    isNullable: true,
    defaultExpression: '',
    ifNotExists: true,
    referencesEnabled: false,
    referenceSchema: '',
    referenceTable: '',
    referenceColumn: '',
    referenceOnDelete: 'NO ACTION',
    referenceOnUpdate: 'NO ACTION',
    lockedTypeByReference: false,
  });
  const [dropColumnTarget, setDropColumnTarget] = useState<{ schema: string; table: string; column: string } | null>(null);
  const [dropColumnOptions, setDropColumnOptions] = useState<{ cascade: boolean; ifExists: boolean }>({
    cascade: false,
    ifExists: true,
  });
  const [insertRowTarget, setInsertRowTarget] = useState<{ schema: string; table: string } | null>(null);
  const [insertRowForm, setInsertRowForm] = useState<InsertRowFormState>({
    mode: 'form',
    json: INSERT_ROW_JSON_TEMPLATE,
    fields: [],
  });
  const [foreignKeySearch, setForeignKeySearch] = useState<ForeignKeySearchState | null>(null);
  const [deleteRowsTarget, setDeleteRowsTarget] = useState<{ schema: string; table: string } | null>(null);
  const [deleteRowsForm, setDeleteRowsForm] = useState<DeleteRowsFormState>({
    criteriaJson: '{\n  "id": 1\n}',
    limit: '1',
  });
  const [createSchemaOpen, setCreateSchemaOpen] = useState(false);
  const [createSchemaForm, setCreateSchemaForm] = useState<CreateSchemaFormState>({
    name: '',
    ifNotExists: true,
  });
  const [renameSchemaTarget, setRenameSchemaTarget] = useState<RenameSchemaFormState | null>(null);
  const [dropSchemaTarget, setDropSchemaTarget] = useState<DropSchemaFormState | null>(null);
  const [generateTestDataTarget, setGenerateTestDataTarget] = useState<{ schema: string; table: string } | null>(null);

  const {
    nodes,
    filteredNodes,
    loading,
    error,
    searchQuery,
    filterType,
    expandedNodes,
    setSearchQuery,
    setFilterType,
    toggleNode,
    refreshSchema,
    fetchTables,
    fetchColumns,
  } = useSchema({
    connectionId: activeConnection?.connectionId || null,
    autoLoad: true,
  });

  const schemaNames = useMemo(() => {
    const unique = new Set<string>();
    nodes.forEach((node) => {
      if (node.type === 'schema' && node.schema) {
        unique.add(node.schema);
      }
    });
    return Array.from(unique).sort();
  }, [nodes]);

  const tableOptionsBySchema = useMemo(() => {
    const map = new Map<string, string[]>();

    nodes.forEach((node) => {
      if (node.type !== 'schema' || !node.schema || node.schema.trim().length === 0) {
        return;
      }

      const tables = (node.children ?? []).reduce<string[]>((acc, child) => {
        if (child.type !== 'table' && child.type !== 'view') {
          return acc;
        }

        const rawName = child.table ?? child.name ?? '';
        if (rawName.trim().length === 0) {
          return acc;
        }

        acc.push(rawName);
        return acc;
      }, []).sort((a, b) => a.localeCompare(b));

      map.set(node.schema, tables);
    });

    return map;
  }, [nodes]);

  const columnDetailsByTable = useMemo(() => {
    const map = new Map<string, ColumnDetail[]>();

    nodes.forEach((node) => {
      if (node.type !== 'schema' || !node.schema || node.schema.trim().length === 0) {
        return;
      }

      (node.children ?? []).forEach((child) => {
        if ((child.type !== 'table' && child.type !== 'view') || !child.table || child.table.trim().length === 0) {
          return;
        }

        const key = `${node.schema}.${child.table}`;
        const columns = (child.children ?? [])
          .filter((grandChild) => grandChild.type === 'column')
          .map((grandChild): ColumnDetail | null => {
            const rawName = grandChild.name ?? '';
            if (rawName.trim().length === 0) {
              return null;
            }

            const dataType = grandChild.metadata?.dataType ?? 'TEXT';
            const defaultValue = grandChild.metadata?.columnDefault ?? undefined;
            const hasDefault =
              typeof defaultValue === 'string' && defaultValue.trim().length > 0;
            const isNullable = grandChild.metadata?.isNullable ?? true;
            const foreignKeyTable = grandChild.metadata?.foreignKeyTable?.trim();
            const foreignKeyColumn = grandChild.metadata?.foreignKeyColumn?.trim();
            const foreignKeySchema = grandChild.metadata?.foreignKeySchema?.trim();
            const foreignKey =
              foreignKeyTable && foreignKeyColumn
                ? {
                    schema:
                      foreignKeySchema && foreignKeySchema.length > 0
                        ? foreignKeySchema
                        : undefined,
                    table: foreignKeyTable,
                    column: foreignKeyColumn,
                  }
                : undefined;

            return {
              name: rawName,
              dataType,
              isNullable,
              columnDefault: defaultValue,
              hasDefault,
              foreignKey,
            };
          })
          .filter((column): column is ColumnDetail => column !== null)
          .sort((a, b) => a.name.localeCompare(b.name));

        map.set(key, columns);
      });
    });

    return map;
  }, [nodes]);

  const columnOptionsByTable = useMemo(() => {
    const map = new Map<string, ColumnOption[]>();
    columnDetailsByTable.forEach((columns, key) => {
      map.set(
        key,
        columns.map(({ name, dataType }) => ({
          name,
          dataType,
        }))
      );
    });
    return map;
  }, [columnDetailsByTable]);

  useEffect(() => {
    if (createTableSchema) {
      fetchTables(createTableSchema).catch((error) =>
        console.error('[SchemaPanel] Failed to preload tables for schema', createTableSchema, error)
      );
    }
  }, [createTableSchema, fetchTables]);

  useEffect(() => {
    if (!createTableSchema) return;

    createTableForm.columns.forEach((col) => {
      if (!col.referencesEnabled) return;

      const schemaName = (col.referenceSchema.trim() || createTableSchema).trim();
      if (schemaName) {
        fetchTables(schemaName).catch((error) =>
          console.error('[SchemaPanel] Failed to load tables for schema', schemaName, error)
        );

        const tableName = col.referenceTable.trim();
        if (tableName) {
          fetchColumns(schemaName, tableName).catch((error) =>
            console.error('[SchemaPanel] Failed to load columns for', `${schemaName}.${tableName}`, error)
          );
        }
      }
    });
  }, [createTableForm.columns, createTableSchema, fetchTables, fetchColumns]);

  useEffect(() => {
    if (addColumnTarget) {
      fetchTables(addColumnTarget.schema).catch((error) =>
        console.error('[SchemaPanel] Failed to load tables for schema', addColumnTarget.schema, error)
      );
    }
  }, [addColumnTarget, fetchTables]);

  useEffect(() => {
    if (!addColumnTarget || !addColumnForm.referencesEnabled) return;

    const schemaName = (addColumnForm.referenceSchema.trim() || addColumnTarget.schema).trim();
    if (schemaName) {
      fetchTables(schemaName).catch((error) =>
        console.error('[SchemaPanel] Failed to load tables for schema', schemaName, error)
      );

      const tableName = addColumnForm.referenceTable.trim();
      if (tableName) {
        fetchColumns(schemaName, tableName).catch((error) =>
          console.error('[SchemaPanel] Failed to load columns for', `${schemaName}.${tableName}`, error)
        );
      }
    }
  }, [
    addColumnForm.referencesEnabled,
    addColumnForm.referenceSchema,
    addColumnForm.referenceTable,
    addColumnTarget,
    fetchTables,
    fetchColumns,
  ]);

  useEffect(() => {
    if (!insertRowTarget) return;

    const key = `${insertRowTarget.schema}.${insertRowTarget.table}`;
    const details = columnDetailsByTable.get(key);
    if (!details || details.length === 0) {
      return;
    }

    setInsertRowForm((prev) => {
      const existing = new Map(prev.fields.map((field) => [field.name, field]));
      const nextFields = details.map((column) => {
        const current = existing.get(column.name);
        const isBoolean = column.dataType.toLowerCase().includes('bool');
        const includeByDefault = !column.isNullable && !column.hasDefault;

        if (current) {
          return {
            ...current,
            dataType: column.dataType,
            isNullable: column.isNullable,
            hasDefault: column.hasDefault,
            defaultValue: column.columnDefault,
            foreignKey: column.foreignKey,
            mode: current.mode,
          } as InsertRowFieldState;
        }

        return {
          name: column.name,
          dataType: column.dataType,
          isNullable: column.isNullable,
          hasDefault: column.hasDefault,
          defaultValue: column.columnDefault,
          include: includeByDefault,
          mode: 'value' as const,
          value: isBoolean ? 'true' : '',
          foreignKey: column.foreignKey,
          lookupPreview: undefined,
        };
      });

      return {
        ...prev,
        fields: nextFields,
      };
    });
  }, [columnDetailsByTable, insertRowTarget]);

  const addColumnDefaultSchema = addColumnTarget?.schema ?? '';
  const addColumnEffectiveSchema = (addColumnForm.referenceSchema.trim() || addColumnDefaultSchema).trim();
  const addColumnTableOptions = addColumnEffectiveSchema
    ? tableOptionsBySchema.get(addColumnEffectiveSchema) ?? []
    : [];
  const addColumnColumnKey = addColumnEffectiveSchema && addColumnForm.referenceTable.trim()
    ? `${addColumnEffectiveSchema}.${addColumnForm.referenceTable.trim()}`
    : null;
  const addColumnColumnOptions = addColumnColumnKey
    ? columnOptionsByTable.get(addColumnColumnKey) ?? []
    : [];
  const addColumnSchemaSelectValue = addColumnForm.referenceSchema
    ? addColumnForm.referenceSchema
    : SAME_SCHEMA_SENTINEL;

  const openCreateTableDialog = useCallback((schema: string) => {
    setCreateTableSchema(schema);
    setCreateTableForm({
      tableName: '',
      ifNotExists: true,
      columns: [createEmptyColumn()],
    });
  }, []);

  const handleCreateTableSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before creating tables.',
        variant: 'destructive',
      });
      return;
    }

    if (!createTableSchema) {
      return;
    }

    const tableName = createTableForm.tableName.trim();
    if (!tableName) {
      toast({
        title: 'Table name required',
        description: 'Provide a name for the new table.',
        variant: 'destructive',
      });
      return;
    }

    const preparedColumns: TableColumnDefinition[] = [];
    let sanitizedColumnRenamed = false;

    for (const col of createTableForm.columns) {
      const columnName = col.name.trim();
      if (!columnName) {
        continue;
      }

       const sanitizedName = sanitizeIdentifier(columnName);
       if (!sanitizedName) {
         toast({
           title: 'Invalid column name',
           description: `Could not derive a valid identifier for column "${columnName}"`,
           variant: 'destructive',
         });
         return;
       }
       if (sanitizedName !== columnName) {
         sanitizedColumnRenamed = true;
       }

      let resolvedDataType: string;
      if (col.useCustomType) {
        const customType = col.customDataType.trim();
        if (!customType) {
          toast({
            title: 'Custom type required',
            description: `Provide a custom data type for column "${columnName}"`,
            variant: 'destructive',
          });
          return;
        }
        resolvedDataType = customType;
      } else {
        resolvedDataType = col.dataType.trim();
      }

      if (!resolvedDataType) {
        toast({
          title: 'Column type required',
          description: `Select a data type for column "${columnName}"`,
          variant: 'destructive',
        });
        return;
      }

      let references: TableColumnDefinition['references'] = undefined;
      if (col.referencesEnabled) {
        const targetTable = col.referenceTable.trim();
        const targetColumn = col.referenceColumn.trim();
        if (!targetTable || !targetColumn) {
          toast({
            title: 'Foreign key incomplete',
            description: `Provide table and column for the foreign key on "${columnName}"`,
            variant: 'destructive',
          });
          return;
        }

        const schemaForReference = (col.referenceSchema.trim() || createTableSchema || '').trim();

        references = {
          schema: schemaForReference || undefined,
          table: targetTable,
          column: targetColumn,
          onDelete: col.referenceOnDelete === 'NO ACTION' ? undefined : col.referenceOnDelete,
          onUpdate: col.referenceOnUpdate === 'NO ACTION' ? undefined : col.referenceOnUpdate,
        };
      }

      preparedColumns.push({
        name: sanitizedName,
        dataType: resolvedDataType,
        isNullable: col.isNullable,
        isPrimaryKey: col.isPrimaryKey,
        defaultExpression: col.defaultExpression.trim() ? col.defaultExpression.trim() : undefined,
        references,
      });
    }

    if (preparedColumns.length === 0) {
      toast({
        title: 'Define at least one column',
        description: 'Add at least one column with a name for the table.',
        variant: 'destructive',
      });
      return;
    }

    const duplicateCheck = new Set<string>();
    for (const column of preparedColumns) {
      const lowered = column.name.toLowerCase();
      if (duplicateCheck.has(lowered)) {
        toast({
          title: 'Duplicate columns',
          description: `Column "${column.name}" is defined more than once.`,
          variant: 'destructive',
        });
        return;
      }
      duplicateCheck.add(lowered);
    }

    const request: CreateTableRequest = {
      schema: createTableSchema,
      tableName,
      ifNotExists: createTableForm.ifNotExists,
      columns: preparedColumns,
    };

    try {
      await invoke<void>('create_table', {
        connectionId,
        request,
      });
      toast({
        title: 'Table created',
        description: `${createTableSchema}.${tableName} was created successfully.`,
      });
      if (sanitizedColumnRenamed) {
        toast({
          title: 'Column names adjusted',
          description: 'Column names were converted to safe SQL identifiers (e.g. spaces → underscores).',
        });
      }
      setCreateTableSchema(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to create table:', error);
      toast({
        title: 'Create table failed',
        description: error instanceof Error ? error.message : 'Unable to create table',
        variant: 'destructive',
      });
    }
  }, [connectionId, createTableForm, createTableSchema, refreshSchema, toast]);

  const updateCreateTableColumn = useCallback(
    (index: number, field: keyof ColumnFormState, value: boolean | string) => {
      setCreateTableForm((prev) => {
        const nextColumns = prev.columns.map((column, idx) =>
          idx === index ? { ...column, [field]: value } : column
        );
        return { ...prev, columns: nextColumns };
      });
    },
    []
  );

  const addCreateTableColumn = useCallback(() => {
    setCreateTableForm((prev) => ({
      ...prev,
      columns: [...prev.columns, createEmptyColumn()],
    }));
  }, []);

  const removeCreateTableColumn = useCallback((index: number) => {
    setCreateTableForm((prev) => {
      if (prev.columns.length === 1) {
        return prev;
      }
      const nextColumns = prev.columns.filter((_, idx) => idx !== index);
      return { ...prev, columns: nextColumns };
    });
  }, []);

  const handleDropTable = useCallback((schema: string, table: string) => {
    setDropTableTarget({ schema, table });
    setDropTableOptions({ cascade: false, ifExists: true });
  }, []);

  const handleDropTableSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before dropping tables.',
        variant: 'destructive',
      });
      return;
    }

    if (!dropTableTarget) return;

    const request: DropTableRequest = {
      schema: dropTableTarget.schema,
      tableName: dropTableTarget.table,
      cascade: dropTableOptions.cascade,
      ifExists: dropTableOptions.ifExists,
    };

    try {
      await invoke<void>('drop_table', {
        connectionId,
        request,
      });
      toast({
        title: 'Table dropped',
        description: `${dropTableTarget.schema}.${dropTableTarget.table} was removed.`,
      });
      setDropTableTarget(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to drop table:', error);
      toast({
        title: 'Drop table failed',
        description: error instanceof Error ? error.message : 'Unable to drop table',
        variant: 'destructive',
      });
    }
  }, [connectionId, dropTableOptions, dropTableTarget, refreshSchema, toast]);

  const handleAddColumn = useCallback((schema: string, table: string) => {
    setAddColumnTarget({ schema, table });
    setAddColumnForm({
      name: '',
      dataType: 'TEXT',
      useCustomType: false,
      customDataType: '',
      isNullable: true,
      defaultExpression: '',
      ifNotExists: true,
      referencesEnabled: false,
      referenceSchema: '',
      referenceTable: '',
      referenceColumn: '',
      referenceOnDelete: 'NO ACTION',
      referenceOnUpdate: 'NO ACTION',
      lockedTypeByReference: false,
    });
  }, []);

  const handleAddColumnSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before adding columns.',
        variant: 'destructive',
      });
      return;
    }

    if (!addColumnTarget) return;

    const name = addColumnForm.name.trim();
    if (!name) {
      toast({
        title: 'Column name required',
        description: 'Provide a name for the new column.',
        variant: 'destructive',
      });
      return;
    }

    const sanitizedName = sanitizeIdentifier(name);
    if (!sanitizedName) {
      toast({
        title: 'Invalid column name',
        description: 'Could not derive a valid identifier for the new column.',
        variant: 'destructive',
      });
      return;
    }

    const nameChanged = sanitizedName !== name;

    let resolvedType: string;
    if (addColumnForm.useCustomType) {
      const customType = addColumnForm.customDataType.trim();
      if (!customType) {
        toast({
          title: 'Custom type required',
          description: 'Provide a custom data type for the new column.',
          variant: 'destructive',
        });
        return;
      }
      resolvedType = customType;
    } else {
      resolvedType = addColumnForm.dataType.trim();
    }

    if (!resolvedType) {
      toast({
        title: 'Column type required',
        description: 'Select a data type for the new column.',
        variant: 'destructive',
      });
      return;
    }

    let references: TableColumnDefinition['references'] = undefined;
    if (addColumnForm.referencesEnabled) {
      const targetTable = addColumnForm.referenceTable.trim();
      const targetColumn = addColumnForm.referenceColumn.trim();
      if (!targetTable || !targetColumn) {
        toast({
          title: 'Foreign key incomplete',
          description: 'Provide table and column for the foreign key.',
          variant: 'destructive',
        });
        return;
      }
      const schemaForReference = (addColumnForm.referenceSchema.trim() || addColumnTarget.schema || '').trim();

      references = {
        schema: schemaForReference || undefined,
        table: targetTable,
        column: targetColumn,
        onDelete:
          addColumnForm.referenceOnDelete === 'NO ACTION'
            ? undefined
            : addColumnForm.referenceOnDelete,
        onUpdate:
          addColumnForm.referenceOnUpdate === 'NO ACTION'
            ? undefined
            : addColumnForm.referenceOnUpdate,
      };
    }

    const request: AddTableColumnRequest = {
      schema: addColumnTarget.schema,
      tableName: addColumnTarget.table,
      ifNotExists: addColumnForm.ifNotExists,
      column: {
        name: sanitizedName,
        dataType: resolvedType,
        isNullable: addColumnForm.isNullable,
        defaultExpression: addColumnForm.defaultExpression.trim()
          ? addColumnForm.defaultExpression.trim()
          : undefined,
        isPrimaryKey: false,
        references,
      },
    };

    try {
      await invoke<void>('add_table_column', {
        connectionId,
        request,
      });
      toast({
        title: 'Column added',
        description: `${sanitizedName} was added to ${addColumnTarget.schema}.${addColumnTarget.table}.`,
      });
      if (nameChanged) {
        toast({
          title: 'Column name adjusted',
          description: 'The column name was converted to a safe SQL identifier (e.g. spaces → underscores).',
        });
      }
      setAddColumnTarget(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to add column:', error);
      toast({
        title: 'Add column failed',
        description: error instanceof Error ? error.message : 'Unable to add column',
        variant: 'destructive',
      });
    }
  }, [addColumnForm, addColumnTarget, connectionId, refreshSchema, toast]);

  const handleDropColumn = useCallback((schema: string, table: string, column: string) => {
    setDropColumnTarget({ schema, table, column });
    setDropColumnOptions({ cascade: false, ifExists: true });
  }, []);

  const handleDropColumnSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before dropping columns.',
        variant: 'destructive',
      });
      return;
    }

    if (!dropColumnTarget) return;

    const request: DropTableColumnRequest = {
      schema: dropColumnTarget.schema,
      tableName: dropColumnTarget.table,
      columnName: dropColumnTarget.column,
      cascade: dropColumnOptions.cascade,
      ifExists: dropColumnOptions.ifExists,
    };

    try {
      await invoke<void>('drop_table_column', {
        connectionId,
        request,
      });
      toast({
        title: 'Column dropped',
        description: `${dropColumnTarget.column} was removed from ${dropColumnTarget.schema}.${dropColumnTarget.table}.`,
      });
      setDropColumnTarget(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to drop column:', error);
      toast({
        title: 'Drop column failed',
        description: error instanceof Error ? error.message : 'Unable to drop column',
        variant: 'destructive',
      });
    }
  }, [connectionId, dropColumnOptions, dropColumnTarget, refreshSchema, toast]);

  const updateInsertRowField = useCallback(
    (columnName: string, updater: (field: InsertRowFieldState) => InsertRowFieldState) => {
      setInsertRowForm((prev) => ({
        ...prev,
        fields: prev.fields.map((field) => (field.name === columnName ? updater(field) : field)),
      }));
    },
    [setInsertRowForm]
  );

  const toggleInsertRowMode = useCallback(() => {
    setInsertRowForm((prev) => {
      if (prev.mode === 'form') {
        const preview: Record<string, unknown> = {};
        prev.fields.forEach((field) => {
          if (!field.include || field.mode === 'null') {
            return;
          }
          if (!field.value) {
            return;
          }

          if (isBooleanType(field.dataType)) {
            preview[field.name] = field.value === 'true';
          } else if (isNumericType(field.dataType)) {
            const numeric = Number(field.value);
            if (Number.isFinite(numeric)) {
              preview[field.name] = numeric;
            }
          } else if (isJsonType(field.dataType)) {
            try {
              preview[field.name] = JSON.parse(field.value);
            } catch {
              // ignore invalid JSON while switching modes
            }
          } else {
            preview[field.name] = field.value;
          }
        });

        const fallbackJson =
          Object.keys(preview).length > 0
            ? JSON.stringify(preview, null, 2)
            : prev.json;

        return {
          ...prev,
          mode: 'json',
          json: fallbackJson,
        };
      }

      return {
        ...prev,
        mode: 'form',
      };
    });
  }, [setInsertRowForm]);

  useEffect(() => {
    if (!foreignKeySearch || !connectionId) {
      return;
    }

    const state = foreignKeySearch;
    const trimmedTerm = state.searchTerm.trim();

    setForeignKeySearch((prev) =>
      prev && prev.fieldName === state.fieldName ? { ...prev, loading: true, error: null } : prev
    );

    let cancelled = false;
    const delay = setTimeout(() => {
      (async () => {
        try {
          const results = await invoke<ForeignKeySearchResult[]>(
            'search_foreign_key_targets',
            {
              connectionId,
              request: {
                schema: state.schema,
                table: state.table,
                column: state.column,
                search: trimmedTerm.length > 0 ? trimmedTerm : undefined,
                limit: 25,
              },
            }
          );

          if (cancelled) {
            return;
          }

          setForeignKeySearch((prev) =>
            prev && prev.fieldName === state.fieldName
              ? {
                  ...prev,
                  results,
                  loading: false,
                  error: null,
                }
              : prev
          );
        } catch (error) {
          if (cancelled) {
            return;
          }
          console.error('[SchemaPanel] Foreign key search failed:', error);
          setForeignKeySearch((prev) =>
            prev && prev.fieldName === state.fieldName
              ? {
                  ...prev,
                  loading: false,
                  error:
                    error instanceof Error ? error.message : 'Unable to search referenced rows',
                }
              : prev
          );
        }
      })();
    }, trimmedTerm.length > 0 ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(delay);
    };
  }, [foreignKeySearch?.schema, foreignKeySearch?.table, foreignKeySearch?.column, foreignKeySearch?.searchTerm, foreignKeySearch?.fieldName, connectionId]);

  const handleInsertRow = useCallback((schema: string, table: string) => {
    setInsertRowTarget({ schema, table });
    setInsertRowForm({
      mode: 'form',
      json: INSERT_ROW_JSON_TEMPLATE,
      fields: [],
    });
    setForeignKeySearch(null);
    fetchColumns(schema, table).catch((error) =>
      console.error('[SchemaPanel] Failed to load columns for insert dialog', `${schema}.${table}`, error)
    );
  }, [fetchColumns]);

  const openForeignKeySearch = useCallback(
    (field: InsertRowFieldState) => {
      if (!connectionId) {
        toast({
          title: 'No connection',
          description: 'Connect to a database before searching for referenced rows.',
          variant: 'destructive',
        });
        return;
      }

      if (!field.foreignKey) {
        return;
      }

      const targetSchema = field.foreignKey.schema ?? insertRowTarget?.schema;
      if (!targetSchema) {
        toast({
          title: 'Schema unavailable',
          description: 'Expand the referenced table in the schema tree to load schema metadata.',
          variant: 'destructive',
        });
        return;
      }

      setForeignKeySearch({
        fieldName: field.name,
        fieldLabel: `${targetSchema}.${field.foreignKey.table}.${field.foreignKey.column}`,
        schema: targetSchema,
        table: field.foreignKey.table,
        column: field.foreignKey.column,
        searchTerm: '',
        results: [],
        loading: false,
        error: null,
      });
    },
    [connectionId, insertRowTarget, toast]
  );

  const handleForeignKeyCandidateSelect = useCallback(
    (candidate: ForeignKeySearchResult) => {
      if (!foreignKeySearch) {
        return;
      }

      updateInsertRowField(foreignKeySearch.fieldName, (current) => ({
        ...current,
        include: true,
        mode: 'value',
        value: candidate.key,
        lookupPreview: summarizeRow(candidate.row),
      }));
      setForeignKeySearch(null);
    },
    [foreignKeySearch, updateInsertRowField]
  );

  const handleInsertRowSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before inserting rows.',
        variant: 'destructive',
      });
      return;
    }

    if (!insertRowTarget) return;

    let rowValues: Record<string, unknown> | null = null;

    if (insertRowForm.mode === 'json') {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(insertRowForm.json);
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Enter a valid JSON object representing the row to insert.',
          variant: 'destructive',
        });
        return;
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length === 0
      ) {
        toast({
          title: 'Row data required',
          description: 'Provide a JSON object with at least one column/value pair.',
          variant: 'destructive',
        });
        return;
      }

      rowValues = parsed;
    } else {
      if (insertRowForm.fields.length === 0) {
        toast({
          title: 'Columns unavailable',
          description: 'Expand the table in the schema tree to load its columns before inserting.',
          variant: 'destructive',
        });
        return;
      }

      const missingRequired = insertRowForm.fields.filter((field) => {
        const required = !field.isNullable && !field.hasDefault;
        return required && !field.include;
      });

      if (missingRequired.length > 0) {
        const columnsList = missingRequired.map((field) => field.name).join(', ');
        toast({
          title: 'Required columns missing',
          description: `Provide values for: ${columnsList}.`,
          variant: 'destructive',
        });
        return;
      }

      const includedFields = insertRowForm.fields.filter((field) => field.include);
      if (includedFields.length === 0) {
        toast({
          title: 'No columns selected',
          description: 'Select at least one column to insert or switch to JSON mode.',
          variant: 'destructive',
        });
        return;
      }

      const values: Record<string, unknown> = {};

      for (const field of includedFields) {
        if (field.mode === 'null') {
          if (!field.isNullable) {
            toast({
              title: 'Invalid NULL value',
              description: `${field.name} cannot be NULL.`,
              variant: 'destructive',
            });
            return;
          }
          values[field.name] = null;
          continue;
        }

        const rawValue = field.value;
        const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

        if (isBooleanType(field.dataType)) {
          if (!rawValue) {
            toast({
              title: 'Select a value',
              description: `Choose TRUE or FALSE for ${field.name} or set it to NULL.`,
              variant: 'destructive',
            });
            return;
          }
          values[field.name] = rawValue === 'true';
          continue;
        }

        if (isNumericType(field.dataType)) {
          if (trimmed === '') {
            toast({
              title: 'Number required',
              description: `Provide a number for ${field.name} or set it to NULL.`,
              variant: 'destructive',
            });
            return;
          }

          const numeric = Number(trimmed);
          if (!Number.isFinite(numeric)) {
            toast({
              title: 'Invalid number',
              description: `${field.name} must be a valid number.`,
              variant: 'destructive',
            });
            return;
          }
          values[field.name] = numeric;
          continue;
        }

        if (isJsonType(field.dataType)) {
          if (trimmed === '') {
            toast({
              title: 'JSON required',
              description: `Enter JSON for ${field.name} or set it to NULL.`,
              variant: 'destructive',
            });
            return;
          }

          try {
            values[field.name] = JSON.parse(rawValue);
          } catch (error) {
            toast({
              title: 'Invalid JSON',
              description: `Could not parse the JSON value for ${field.name}.`,
              variant: 'destructive',
            });
            return;
          }
          continue;
        }

        values[field.name] = rawValue;
      }

      rowValues = values;
    }

    if (!rowValues || Object.keys(rowValues).length === 0) {
      toast({
        title: 'Row data required',
        description: 'Provide at least one column/value pair before inserting.',
        variant: 'destructive',
      });
      return;
    }

    const request: InsertRowRequest = {
      schema: insertRowTarget.schema,
      tableName: insertRowTarget.table,
      row: {
        values: rowValues,
      },
    };

    try {
      const affected = await invoke<number>('insert_table_row', {
        connectionId,
        request,
      });
      toast({
        title: 'Row inserted',
        description: `${affected} row${affected === 1 ? '' : 's'} inserted. Refresh the table view to see changes.`,
      });
      setInsertRowTarget(null);
      setInsertRowForm({
        mode: 'form',
        json: INSERT_ROW_JSON_TEMPLATE,
        fields: [],
      });
    } catch (error) {
      console.error('[SchemaPanel] Failed to insert row:', error);
      toast({
        title: 'Insert row failed',
        description: error instanceof Error ? error.message : 'Unable to insert row',
        variant: 'destructive',
      });
    }
  }, [connectionId, insertRowForm, insertRowTarget, toast]);

  const handleDeleteRows = useCallback((schema: string, table: string) => {
    setDeleteRowsTarget({ schema, table });
    setDeleteRowsForm({ criteriaJson: '{\n  "id": 1\n}', limit: '1' });
  }, []);

  const handleEmbedTable = useCallback(async (schema: string, table: string) => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before embedding tables.',
        variant: 'destructive',
      });
      return;
    }

    // Get columns for the table
    try {
      const columns = await invoke<Column[]>('get_table_columns', {
        connectionId,
        schema,
        table,
      });

      if (columns.length === 0) {
        toast({
          title: 'No columns',
          description: 'This table has no columns to embed.',
          variant: 'destructive',
        });
        return;
      }

      // Use all columns for embedding
      const columnNames = columns.map((col) => col.name);

      const request: EmbeddingJobRequest = {
        connectionId,
        schema,
        table,
        columns: columnNames,
        model: 'nomic-embed-text:latest',
      };

      toast({
        title: 'Embedding started',
        description: `Generating embeddings for ${schema}.${table}...`,
      });

      const result = await invoke<EmbeddingJobResult>('embed_table', { request });

      toast({
        title: 'Embedding complete',
        description: `Embedded ${result.embeddedRows} rows from ${schema}.${table}. You can now ask questions about this data in AI Chat!`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to embed table';
      toast({
        title: 'Embedding failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [connectionId, toast]);

  const handleGenerateTestData = useCallback((schema: string, table: string) => {
    setGenerateTestDataTarget({ schema, table });
  }, []);

  const handleDeleteRowsSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before deleting rows.',
        variant: 'destructive',
      });
      return;
    }

    if (!deleteRowsTarget) return;

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(deleteRowsForm.criteriaJson);
    } catch (error) {
      toast({
        title: 'Invalid JSON',
        description: 'Enter valid JSON for the delete criteria.',
        variant: 'destructive',
      });
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
      toast({
        title: 'Criteria required',
        description: 'Provide at least one column/value pair to delete rows.',
        variant: 'destructive',
      });
      return;
    }

    let limit: number | undefined;
    if (deleteRowsForm.limit.trim() !== '') {
      const parsedLimit = Number(deleteRowsForm.limit.trim());
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        toast({
          title: 'Invalid limit',
          description: 'Provide a positive number for the limit or leave empty.',
          variant: 'destructive',
        });
        return;
      }
      limit = parsedLimit;
    }

    const request: DeleteRowRequest = {
      schema: deleteRowsTarget.schema,
      tableName: deleteRowsTarget.table,
      criteria: {
        values: parsed,
      },
      limit,
    };

    try {
      const affected = await invoke<number>('delete_table_rows', {
        connectionId,
        request,
      });
      toast({
        title: 'Rows deleted',
        description: `${affected} row${affected === 1 ? '' : 's'} deleted. Refresh the table view to see changes.`,
      });
      setDeleteRowsTarget(null);
    } catch (error) {
      console.error('[SchemaPanel] Failed to delete rows:', error);
      toast({
        title: 'Delete rows failed',
        description: error instanceof Error ? error.message : 'Unable to delete rows',
        variant: 'destructive',
      });
    }
  }, [connectionId, deleteRowsForm, deleteRowsTarget, toast]);

  const handleCreateSchemaSubmit = useCallback(async () => {
    if (!connectionId) {
      toast({
        title: 'No connection',
        description: 'Connect to a database before creating schemas.',
        variant: 'destructive',
      });
      return;
    }

    const schemaName = createSchemaForm.name.trim();
    if (!schemaName) {
      toast({
        title: 'Schema name required',
        description: 'Provide a name for the new schema.',
        variant: 'destructive',
      });
      return;
    }

    const request: CreateSchemaRequest = {
      name: schemaName,
      ifNotExists: createSchemaForm.ifNotExists,
    };

    try {
      await invoke<void>('create_schema', {
        connectionId,
        request,
      });
      toast({
        title: 'Schema created',
        description: `${schemaName} is now available.`,
      });
      setCreateSchemaOpen(false);
      setCreateSchemaForm({ name: '', ifNotExists: true });
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to create schema:', error);
      toast({
        title: 'Create schema failed',
        description: error instanceof Error ? error.message : 'Unable to create schema',
        variant: 'destructive',
      });
    }
  }, [connectionId, createSchemaForm, refreshSchema, toast]);

  const openRenameSchemaDialog = useCallback((schema: string) => {
    setRenameSchemaTarget({ currentName: schema, newName: schema });
  }, []);

  const openDropSchemaDialog = useCallback((schema: string) => {
    setDropSchemaTarget({ name: schema, cascade: false, ifExists: true });
  }, []);

  const handleRenameSchemaSubmit = useCallback(async () => {
    if (!connectionId || !renameSchemaTarget) {
      if (!connectionId) {
        toast({
          title: 'No connection',
          description: 'Connect to a database before renaming schemas.',
          variant: 'destructive',
        });
      }
      return;
    }

    const newName = renameSchemaTarget.newName.trim();
    if (!newName) {
      toast({
        title: 'New schema name required',
        description: 'Provide a new schema name.',
        variant: 'destructive',
      });
      return;
    }

    const request: RenameSchemaRequest = {
      currentName: renameSchemaTarget.currentName,
      newName,
    };

    try {
      await invoke<void>('rename_schema', {
        connectionId,
        request,
      });
      toast({
        title: 'Schema renamed',
        description: `${renameSchemaTarget.currentName} is now ${newName}.`,
      });
      setRenameSchemaTarget(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to rename schema:', error);
      toast({
        title: 'Rename schema failed',
        description: error instanceof Error ? error.message : 'Unable to rename schema',
        variant: 'destructive',
      });
    }
  }, [connectionId, renameSchemaTarget, refreshSchema, toast]);

  const handleDropSchemaSubmit = useCallback(async () => {
    if (!connectionId || !dropSchemaTarget) {
      if (!connectionId) {
        toast({
          title: 'No connection',
          description: 'Connect to a database before dropping schemas.',
          variant: 'destructive',
        });
      }
      return;
    }

    const request: DropSchemaRequest = {
      name: dropSchemaTarget.name,
      cascade: dropSchemaTarget.cascade,
      ifExists: dropSchemaTarget.ifExists,
    };

    try {
      await invoke<void>('drop_schema', {
        connectionId,
        request,
      });
      toast({
        title: 'Schema dropped',
        description: `${dropSchemaTarget.name} was removed.`,
      });
      setDropSchemaTarget(null);
      await refreshSchema();
    } catch (error) {
      console.error('[SchemaPanel] Failed to drop schema:', error);
      toast({
        title: 'Drop schema failed',
        description: error instanceof Error ? error.message : 'Unable to drop schema',
        variant: 'destructive',
      });
    }
  }, [connectionId, dropSchemaTarget, refreshSchema, toast]);

  const handleMinimize = () => onPanelSizeChange?.('minimized');
  const handleNormal = () => onPanelSizeChange?.('normal');
  const handleExpand = () => onPanelSizeChange?.('expanded');


  // Minimized state - show vertical bar
  if (panelSize === 'minimized') {
    return (
      <div className="flex h-full flex-col bg-card border-x w-12">
        <div className="flex flex-col items-center gap-2 p-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNormal}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Restore Schema Browser</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <FolderTree className="h-5 w-5 text-muted-foreground mt-2" />
        </div>
      </div>
    );
  }

  // Not connected state
  if (!activeConnection || activeConnection.status !== 'connected') {
    return (
      <div className="flex h-full flex-col bg-card border-x">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <h2 className="font-semibold">Schema Browser</h2>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMinimize}
                    className="h-8 w-8"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimize Panel</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <FolderTree className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Connect to a database</p>
            <p className="text-xs mt-2">to browse its schema</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col bg-card border-x">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <h2 className="font-semibold">Schema Browser</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateSchemaForm({ name: '', ifNotExists: true });
                setCreateSchemaOpen(true);
              }}
            >
              New Schema
            </Button>
            <TooltipProvider>
              {/* Minimize Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMinimize}
                    className="h-8 w-8"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimize Panel</p>
                </TooltipContent>
              </Tooltip>

              {/* Expand/Normal Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={panelSize === 'expanded' ? handleNormal : handleExpand}
                    className="h-8 w-8"
                  >
                    {panelSize === 'expanded' ? (
                      <Maximize2 className="h-4 w-4" />
                    ) : (
                      <Maximize className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{panelSize === 'expanded' ? 'Restore Size' : 'Expand Panel'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'tree' | 'graph')}
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-2">
            <TabsTrigger value="tree" className="gap-2">
              <List className="h-4 w-4" />
              Tree View
            </TabsTrigger>
            <TabsTrigger value="graph" className="gap-2">
              <Layers className="h-4 w-4" />
              Graph View
            </TabsTrigger>
          </TabsList>

          {/* Tree View Tab */}
          <TabsContent value="tree" className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden">
            {/* Search and filters */}
            <SchemaSearch
              value={searchQuery}
              onChange={setSearchQuery}
              filterType={filterType}
              onFilterChange={setFilterType}
              disabled={loading}
            />

            {/* Error state */}
            {error && (
              <div className="p-3">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span className="text-sm">{error}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshSchema}
                      className="ml-2"
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Tree */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SchemaTree
                nodes={filteredNodes}
                expandedNodes={expandedNodes}
                onToggleNode={toggleNode}
                onTableSelect={onTableSelect}
                selectedTable={selectedTable}
                loading={loading}
                onCreateTable={openCreateTableDialog}
                onDropTable={handleDropTable}
                onAddColumn={handleAddColumn}
                onDropColumn={handleDropColumn}
                onInsertRow={handleInsertRow}
                onDeleteRows={handleDeleteRows}
                onDropSchema={openDropSchemaDialog}
                onRenameSchema={openRenameSchemaDialog}
                onEmbedTable={handleEmbedTable}
                onGenerateTestData={handleGenerateTestData}
              />
            </div>
          </TabsContent>

          {/* Graph View Tab */}
          <TabsContent value="graph" className="flex-1 mt-0 data-[state=inactive]:hidden">
            <div className="h-full p-4">
              <SchemaGraph
                connectionId={activeConnection?.connectionId || null}
                schemas={schemaNames}
                defaultSchema={selectedTable?.schema ?? schemaNames[0] ?? null}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={createSchemaOpen}
        onOpenChange={(open) => {
          setCreateSchemaOpen(open);
          if (!open) {
            setCreateSchemaForm({ name: '', ifNotExists: true });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Schema</DialogTitle>
            <DialogDescription>
              Provide a schema name. Optionally include an `IF NOT EXISTS` safeguard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="create-schema-name">Schema Name</Label>
              <Input
                id="create-schema-name"
                value={createSchemaForm.name}
                onChange={(event) =>
                  setCreateSchemaForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="analytics"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-schema-if-not-exists"
                checked={createSchemaForm.ifNotExists}
                onCheckedChange={(checked) =>
                  setCreateSchemaForm((prev) => ({ ...prev, ifNotExists: checked === true }))
                }
              />
              <Label htmlFor="create-schema-if-not-exists" className="text-sm">
                Include IF NOT EXISTS
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateSchemaOpen(false);
                setCreateSchemaForm({ name: '', ifNotExists: true });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSchemaSubmit}>Create Schema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameSchemaTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameSchemaTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Schema</DialogTitle>
            {renameSchemaTarget && (
              <DialogDescription>
                Rename <span className="font-mono">{renameSchemaTarget.currentName}</span> to a new identifier.
              </DialogDescription>
            )}
          </DialogHeader>
          {renameSchemaTarget && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="rename-schema-new-name">New Name</Label>
                <Input
                  id="rename-schema-new-name"
                  value={renameSchemaTarget.newName}
                  onChange={(event) =>
                    setRenameSchemaTarget((prev) =>
                      prev ? { ...prev, newName: event.target.value } : prev
                    )
                  }
                  placeholder="reporting"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSchemaTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSchemaSubmit}>Rename Schema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dropSchemaTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDropSchemaTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Drop Schema</DialogTitle>
            {dropSchemaTarget && (
              <DialogDescription>
                This will remove <span className="font-mono">{dropSchemaTarget.name}</span> from the database.
              </DialogDescription>
            )}
          </DialogHeader>
          {dropSchemaTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Dropping a schema deletes all contained objects. Proceed with caution.
              </p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="drop-schema-cascade"
                  checked={dropSchemaTarget.cascade}
                  onCheckedChange={(checked) =>
                    setDropSchemaTarget((prev) =>
                      prev ? { ...prev, cascade: checked === true } : prev
                    )
                  }
                />
                <Label htmlFor="drop-schema-cascade" className="text-sm">
                  Cascade (drop dependent objects)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="drop-schema-if-exists"
                  checked={dropSchemaTarget.ifExists}
                  onCheckedChange={(checked) =>
                    setDropSchemaTarget((prev) =>
                      prev ? { ...prev, ifExists: checked === true } : prev
                    )
                  }
                />
                <Label htmlFor="drop-schema-if-exists" className="text-sm">
                  Include IF EXISTS safeguard
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropSchemaTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDropSchemaSubmit}>
              Drop Schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generateTestDataTarget && (
        <GenerateTestDataDialog
          open={!!generateTestDataTarget}
          schema={generateTestDataTarget.schema}
          table={generateTestDataTarget.table}
          connectionId={connectionId}
          onOpenSettings={onOpenSettings}
          onOpenChange={(open) => {
            if (!open) {
              setGenerateTestDataTarget(null);
            }
          }}
        />
      )}

      <Dialog
        open={createTableSchema !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateTableSchema(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Table</DialogTitle>
            {createTableSchema && (
              <DialogDescription>
                Define the structure for a new table in <span className="font-mono">{createTableSchema}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="table-name">Table Name</Label>
              <Input
                id="table-name"
                placeholder="users"
                value={createTableForm.tableName}
                onChange={(event) =>
                  setCreateTableForm((prev) => ({ ...prev, tableName: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="table-if-not-exists"
                checked={createTableForm.ifNotExists}
                onCheckedChange={(checked) =>
                  setCreateTableForm((prev) => ({ ...prev, ifNotExists: checked === true }))
                }
              />
              <Label htmlFor="table-if-not-exists" className="text-sm">
                Include IF NOT EXISTS
              </Label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Columns</h4>
                <Button size="sm" variant="outline" onClick={addCreateTableColumn}>
                  Add Column
                </Button>
              </div>
              <div className="space-y-3">
                {createTableForm.columns.map((column, index) => {
                  const columnId = `column-${index}`;
                  const defaultFkSchema = createTableSchema ?? '';
                  const resolvedSchemaForFk = (column.referenceSchema.trim() || defaultFkSchema).trim();
                  const fkTableOptions = resolvedSchemaForFk
                    ? tableOptionsBySchema.get(resolvedSchemaForFk) ?? []
                    : [];
                  const fkColumnKey = resolvedSchemaForFk && column.referenceTable.trim()
                    ? `${resolvedSchemaForFk}.${column.referenceTable.trim()}`
                    : null;
                  const fkColumnOptions = fkColumnKey
                    ? columnOptionsByTable.get(fkColumnKey) ?? []
                    : [];
                  const fkSchemaSelectValue = column.referenceSchema
                    ? column.referenceSchema
                    : SAME_SCHEMA_SENTINEL;
                  return (
                    <div
                      key={columnId}
                      className="space-y-3 rounded-md border border-border/70 p-4 shadow-sm"
                    >
                      <div className="grid gap-3 md:grid-cols-6">
                        <div className="md:col-span-2">
                          <Label htmlFor={`${columnId}-name`}>Name</Label>
                          <Input
                            id={`${columnId}-name`}
                            value={column.name}
                            onChange={(event) =>
                              updateCreateTableColumn(index, 'name', event.target.value)
                            }
                            placeholder="id"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor={`${columnId}-type`}>Data Type</Label>
                          <Select
                            value={column.useCustomType ? 'custom' : column.dataType}
                            onValueChange={(value) => {
                              if (value === 'custom') {
                                setCreateTableForm((prev) => {
                                  const next = [...prev.columns];
                                  const current = next[index];
                                  if (!current) {
                                    return prev;
                                  }
                                  next[index] = {
                                    ...current,
                                    useCustomType: true,
                                    lockedTypeByReference: false,
                                  };
                                  return { ...prev, columns: next };
                                });
                              } else {
                                setCreateTableForm((prev) => {
                                  const next = [...prev.columns];
                                  const current = next[index];
                                  if (!current) {
                                    return prev;
                                  }
                                  next[index] = {
                                    ...current,
                                    useCustomType: false,
                                    dataType: value,
                                    lockedTypeByReference: current.referencesEnabled
                                      ? current.lockedTypeByReference
                                      : false,
                                  };
                                  return { ...prev, columns: next };
                                });
                              }
                            }}
                            disabled={column.lockedTypeByReference}
                          >
                            <SelectTrigger id={`${columnId}-type`}>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {DATA_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {column.useCustomType && (
                            <Input
                              value={column.customDataType}
                              disabled={column.lockedTypeByReference}
                              onChange={(event) =>
                                updateCreateTableColumn(index, 'customDataType', event.target.value)
                              }
                              placeholder="citext"
                            />
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor={`${columnId}-default`}>Default (expression)</Label>
                          <Input
                            id={`${columnId}-default`}
                            value={column.defaultExpression}
                            placeholder="NULL"
                            onChange={(event) =>
                              updateCreateTableColumn(index, 'defaultExpression', event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`${columnId}-not-null`}
                            checked={!column.isNullable}
                            onCheckedChange={(checked) =>
                              updateCreateTableColumn(index, 'isNullable', !(checked === true))
                            }
                          />
                          <Label htmlFor={`${columnId}-not-null`} className="text-sm">
                            NOT NULL
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`${columnId}-pk`}
                            checked={column.isPrimaryKey}
                            onCheckedChange={(checked) =>
                              updateCreateTableColumn(index, 'isPrimaryKey', checked === true)
                            }
                          />
                          <Label htmlFor={`${columnId}-pk`} className="text-sm">
                            Primary Key
                          </Label>
                        </div>
                        <div className="ml-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCreateTableColumn(index)}
                            disabled={createTableForm.columns.length === 1}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                        <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
                          <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`${columnId}-fk-enabled`}
                            checked={column.referencesEnabled}
                            onCheckedChange={(checked) => {
                              setCreateTableForm((prev) => {
                                const next = [...prev.columns];
                                const current = next[index];
                                if (!current) {
                                  return prev;
                                }
                                next[index] = {
                                  ...current,
                                  referencesEnabled: checked === true,
                                  lockedTypeByReference: false,
                                  ...(checked
                                    ? {}
                                    : {
                                        referenceSchema: '',
                                        referenceTable: '',
                                        referenceColumn: '',
                                        referenceOnDelete: 'NO ACTION',
                                        referenceOnUpdate: 'NO ACTION',
                                      }),
                                };
                                return { ...prev, columns: next };
                              });

                              if (checked === true) {
                                const schemaToLoad = (column.referenceSchema.trim() || createTableSchema || '').trim();
                                if (schemaToLoad) {
                                  fetchTables(schemaToLoad).catch((error) =>
                                    console.error('[SchemaPanel] Failed to load tables for schema', schemaToLoad, error)
                                  );

                                  const tableName = column.referenceTable.trim();
                                  if (tableName) {
                                    fetchColumns(schemaToLoad, tableName).catch((error) =>
                                      console.error('[SchemaPanel] Failed to load columns for', `${schemaToLoad}.${tableName}`, error)
                                    );
                                  }
                                }
                              }
                            }}
                          />
                          <Label htmlFor={`${columnId}-fk-enabled`} className="text-sm">
                            Foreign Key
                          </Label>
                        </div>

                        {column.referencesEnabled && (
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="grid gap-1">
                                <Label htmlFor={`${columnId}-fk-schema`}>Target Schema</Label>
                                <Select
                                  value={fkSchemaSelectValue}
                                  onValueChange={(value) => {
                                    const nextSchema = value === SAME_SCHEMA_SENTINEL ? '' : value;
                                    setCreateTableForm((prev) => {
                                      const next = [...prev.columns];
                                      const current = next[index];
                                      if (!current) {
                                        return prev;
                                      }
                                      next[index] = {
                                        ...current,
                                        referenceSchema: nextSchema,
                                        referenceTable: '',
                                        referenceColumn: '',
                                      };
                                      return { ...prev, columns: next };
                                    });

                                    const schemaToLoad = (nextSchema || createTableSchema || '').trim();
                                    if (schemaToLoad) {
                                      fetchTables(schemaToLoad).catch((error) =>
                                        console.error('[SchemaPanel] Failed to load tables for schema', schemaToLoad, error)
                                      );
                                    }
                                  }}
                                >
                                  <SelectTrigger id={`${columnId}-fk-schema`}>
                                    <SelectValue
                                      placeholder={
                                        createTableSchema
                                          ? `Same as ${createTableSchema}`
                                          : 'Select schema'
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SAME_SCHEMA_SENTINEL}>
                                      {createTableSchema
                                        ? `Same as ${createTableSchema}`
                                        : 'Current schema'}
                                    </SelectItem>
                                    {schemaNames.map((schemaName) => (
                                      <SelectItem key={schemaName} value={schemaName}>
                                        {schemaName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-1">
                                <Label htmlFor={`${columnId}-fk-table`}>Target Table</Label>
                                <Select
                                  value={column.referenceTable || NO_TABLES_SENTINEL}
                                  onValueChange={(value) => {
                                    if (value === NO_TABLES_SENTINEL) {
                                      return;
                                    }
                                    setCreateTableForm((prev) => {
                                      const next = [...prev.columns];
                                      const current = next[index];
                                      if (!current) {
                                        return prev;
                                      }
                                      next[index] = {
                                        ...current,
                                        referenceTable: value,
                                        referenceColumn: '',
                                      };
                                      return { ...prev, columns: next };
                                    });

                                    const schemaForLoad = (column.referenceSchema.trim() || createTableSchema || '').trim();
                                    if (schemaForLoad && value) {
                                      fetchColumns(schemaForLoad, value).catch((error) =>
                                        console.error('[SchemaPanel] Failed to load columns for', `${schemaForLoad}.${value}`, error)
                                      );
                                    }
                                  }}
                                  disabled={fkTableOptions.length === 0}
                                >
                                  <SelectTrigger id={`${columnId}-fk-table`}>
                                    <SelectValue
                                      placeholder={
                                        fkTableOptions.length === 0
                                          ? 'No tables available'
                                          : 'Select table'
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fkTableOptions.length === 0 ? (
                                      <SelectItem value={NO_TABLES_SENTINEL} disabled>
                                        No tables available
                                      </SelectItem>
                                    ) : (
                                      fkTableOptions.map((tableName) => (
                                        <SelectItem key={tableName} value={tableName}>
                                          {tableName}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-1">
                                <Label htmlFor={`${columnId}-fk-column`}>Target Column</Label>
                                <Select
                                  value={column.referenceColumn || NO_COLUMNS_SENTINEL}
                                  onValueChange={(value) => {
                                    if (value === NO_COLUMNS_SENTINEL) {
                                      return;
                                    }
                                    updateCreateTableColumn(index, 'referenceColumn', value);
                                    const selectedOption = fkColumnOptions.find((option) => option.name === value);
                                    if (selectedOption) {
                                      setCreateTableForm((prev) => {
                                        const next = [...prev.columns];
                                        const current = next[index];
                                        if (!current) {
                                          return prev;
                                        }
                                        const rawType = selectedOption.dataType ?? '';
                                        const typeValue = rawType.trim();
                                        const matchedPreset = typeValue
                                          ? DATA_TYPE_OPTIONS.find(
                                              (option) => option.value.toLowerCase() === typeValue.toLowerCase()
                                            )
                                          : undefined;
                                        next[index] = {
                                          ...current,
                                          dataType: matchedPreset
                                            ? matchedPreset.value
                                            : typeValue || current.dataType,
                                          useCustomType: matchedPreset ? false : typeValue ? true : current.useCustomType,
                                          customDataType: matchedPreset
                                            ? ''
                                            : typeValue
                                              ? typeValue
                                              : current.customDataType,
                                          lockedTypeByReference: true,
                                        };
                                        return { ...prev, columns: next };
                                      });
                                    }
                                  }}
                                  disabled={fkColumnOptions.length === 0}
                                >
                                  <SelectTrigger id={`${columnId}-fk-column`}>
                                    <SelectValue
                                      placeholder={
                                        fkColumnOptions.length === 0
                                          ? 'Select table first'
                                          : 'Select column'
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fkColumnOptions.length === 0 ? (
                                      <SelectItem value={NO_COLUMNS_SENTINEL} disabled>
                                        {column.referenceTable
                                          ? 'Load columns for selected table'
                                          : 'Select table first'}
                                      </SelectItem>
                                    ) : (
                                      fkColumnOptions.map((columnOption) => (
                                        <SelectItem key={columnOption.name} value={columnOption.name}>
                                          {columnOption.name}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label>On Delete</Label>
                                <Select
                                  value={column.referenceOnDelete}
                                  onValueChange={(value) =>
                                    updateCreateTableColumn(index, 'referenceOnDelete', value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FK_ACTION_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label>On Update</Label>
                                <Select
                                  value={column.referenceOnUpdate}
                                  onValueChange={(value) =>
                                    updateCreateTableColumn(index, 'referenceOnUpdate', value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FK_ACTION_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTableSchema(null)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTableSubmit}>Create Table</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dropTableTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDropTableTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop Table</DialogTitle>
            {dropTableTarget && (
              <DialogDescription>
                This will permanently remove <span className="font-mono">{dropTableTarget.schema}.{dropTableTarget.table}</span>.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to drop this table? This action cannot be undone.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="drop-table-cascade"
                checked={dropTableOptions.cascade}
                onCheckedChange={(checked) =>
                  setDropTableOptions((prev) => ({ ...prev, cascade: checked === true }))
                }
              />
              <Label htmlFor="drop-table-cascade" className="text-sm">
                Cascade (drops dependent objects)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="drop-table-if-exists"
                checked={dropTableOptions.ifExists}
                onCheckedChange={(checked) =>
                  setDropTableOptions((prev) => ({ ...prev, ifExists: checked === true }))
                }
              />
              <Label htmlFor="drop-table-if-exists" className="text-sm">
                Include IF EXISTS safeguard
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropTableTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDropTableSubmit}>
              Drop Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addColumnTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddColumnTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            {addColumnTarget && (
              <DialogDescription>
                Add a new column to <span className="font-mono">{addColumnTarget.schema}.{addColumnTarget.table}</span>.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="add-column-name">Column Name</Label>
                <Input
                  id="add-column-name"
                  value={addColumnForm.name}
                  onChange={(event) =>
                    setAddColumnForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="created_at"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-column-type">Data Type</Label>
                <Select
                  value={addColumnForm.useCustomType ? 'custom' : addColumnForm.dataType}
                  onValueChange={(value) => {
                    if (value === 'custom') {
                      setAddColumnForm((prev) => ({ ...prev, useCustomType: true, lockedTypeByReference: false }));
                    } else {
                      setAddColumnForm((prev) => ({
                        ...prev,
                        useCustomType: false,
                        dataType: value,
                        lockedTypeByReference: prev.referencesEnabled ? prev.lockedTypeByReference : false,
                      }));
                    }
                  }}
                  disabled={addColumnForm.lockedTypeByReference}
                >
                  <SelectTrigger id="add-column-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {addColumnForm.useCustomType && (
                  <Input
                    value={addColumnForm.customDataType}
                    disabled={addColumnForm.lockedTypeByReference}
                    onChange={(event) =>
                      setAddColumnForm((prev) => ({ ...prev, customDataType: event.target.value }))
                    }
                    placeholder="citext"
                  />
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-column-default">Default (expression)</Label>
                <Input
                  id="add-column-default"
                  value={addColumnForm.defaultExpression}
                  onChange={(event) =>
                    setAddColumnForm((prev) => ({ ...prev, defaultExpression: event.target.value }))
                  }
                  placeholder="NOW()"
                />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-column-not-null"
                  checked={!addColumnForm.isNullable}
                  onCheckedChange={(checked) =>
                    setAddColumnForm((prev) => ({ ...prev, isNullable: !(checked === true) }))
                  }
                />
                <Label htmlFor="add-column-not-null" className="text-sm">
                  NOT NULL
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-column-if-not-exists"
                  checked={addColumnForm.ifNotExists}
                  onCheckedChange={(checked) =>
                    setAddColumnForm((prev) => ({ ...prev, ifNotExists: checked === true }))
                  }
                />
                <Label htmlFor="add-column-if-not-exists" className="text-sm">
                  Include IF NOT EXISTS
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-column-fk-enabled"
                  checked={addColumnForm.referencesEnabled}
                  onCheckedChange={(checked) => {
                    setAddColumnForm((prev) => ({
                      ...prev,
                      referencesEnabled: checked === true,
                      lockedTypeByReference: false,
                      ...(checked
                        ? {}
                        : {
                            referenceSchema: '',
                            referenceTable: '',
                            referenceColumn: '',
                            referenceOnDelete: 'NO ACTION',
                            referenceOnUpdate: 'NO ACTION',
                          }),
                    }));

                    if (checked === true) {
                      const schemaToLoad = (addColumnForm.referenceSchema.trim() || addColumnTarget?.schema || '').trim();
                      if (schemaToLoad) {
                        fetchTables(schemaToLoad).catch((error) =>
                          console.error('[SchemaPanel] Failed to load tables for schema', schemaToLoad, error)
                        );

                        const tableName = addColumnForm.referenceTable.trim();
                        if (schemaToLoad && tableName) {
                          fetchColumns(schemaToLoad, tableName).catch((error) =>
                            console.error('[SchemaPanel] Failed to load columns for', `${schemaToLoad}.${tableName}`, error)
                          );
                        }
                      }
                    }
                  }}
                />
                <Label htmlFor="add-column-fk-enabled" className="text-sm">
                  Foreign Key
                </Label>
              </div>
            </div>
            {addColumnForm.referencesEnabled && (
              <div className="space-y-3 rounded-md bg-muted/40 p-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1">
                    <Label htmlFor="add-column-fk-schema">Target Schema</Label>
                    <Select
                      value={addColumnSchemaSelectValue}
                      onValueChange={(value) => {
                        const nextSchema = value === SAME_SCHEMA_SENTINEL ? '' : value;
                        setAddColumnForm((prev) => ({
                          ...prev,
                          referenceSchema: nextSchema,
                          referenceTable: '',
                          referenceColumn: '',
                          lockedTypeByReference: false,
                        }));

                        const schemaToLoad = (nextSchema || addColumnTarget?.schema || '').trim();
                        if (schemaToLoad) {
                          fetchTables(schemaToLoad).catch((error) =>
                            console.error('[SchemaPanel] Failed to load tables for schema', schemaToLoad, error)
                          );
                        }
                      }}
                    >
                      <SelectTrigger id="add-column-fk-schema">
                        <SelectValue
                          placeholder={
                            addColumnTarget?.schema
                              ? `Same as ${addColumnTarget.schema}`
                              : 'Select schema'
                          }
                        />
                      </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SAME_SCHEMA_SENTINEL}>
                        {addColumnTarget?.schema
                          ? `Same as ${addColumnTarget.schema}`
                          : 'Current schema'}
                      </SelectItem>
                        {schemaNames.map((schemaName) => (
                          <SelectItem key={schemaName} value={schemaName}>
                            {schemaName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="add-column-fk-table">Target Table</Label>
                    <Select
                      value={addColumnForm.referenceTable || NO_TABLES_SENTINEL}
                      onValueChange={(value) => {
                        if (value === NO_TABLES_SENTINEL) {
                          return;
                        }
                        const schemaForLoad = (addColumnForm.referenceSchema.trim() || addColumnTarget?.schema || '').trim();
                        setAddColumnForm((prev) => ({
                          ...prev,
                          referenceTable: value,
                          referenceColumn: '',
                          lockedTypeByReference: false,
                        }));

                        if (schemaForLoad && value) {
                          fetchColumns(schemaForLoad, value).catch((error) =>
                            console.error('[SchemaPanel] Failed to load columns for', `${schemaForLoad}.${value}`, error)
                          );
                        }
                      }}
                      disabled={addColumnTableOptions.length === 0}
                    >
                      <SelectTrigger id="add-column-fk-table">
                        <SelectValue
                          placeholder={
                            addColumnTableOptions.length === 0
                              ? 'No tables available'
                              : 'Select table'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {addColumnTableOptions.length === 0 ? (
                          <SelectItem value={NO_TABLES_SENTINEL} disabled>
                            No tables available
                          </SelectItem>
                        ) : (
                          addColumnTableOptions.map((tableName) => (
                            <SelectItem key={tableName} value={tableName}>
                              {tableName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="add-column-fk-column">Target Column</Label>
                    <Select
                      value={addColumnForm.referenceColumn || NO_COLUMNS_SENTINEL}
                      onValueChange={(value) => {
                        if (value === NO_COLUMNS_SENTINEL) {
                          return;
                        }
                        const selectedOption = addColumnColumnOptions.find((option) => option.name === value);
                        const typeValue = selectedOption?.dataType?.trim() ?? '';
                        const matchedPreset = typeValue
                          ? DATA_TYPE_OPTIONS.find(
                              (option) => option.value.toLowerCase() === typeValue.toLowerCase()
                            )
                          : null;
                        setAddColumnForm((prev) => ({
                          ...prev,
                          referenceColumn: value,
                          dataType: selectedOption
                            ? matchedPreset
                              ? matchedPreset.value
                              : typeValue || prev.dataType
                            : prev.dataType,
                          useCustomType: selectedOption ? !matchedPreset : prev.useCustomType,
                          customDataType: selectedOption
                            ? matchedPreset
                              ? ''
                              : typeValue
                            : prev.customDataType,
                          lockedTypeByReference: Boolean(selectedOption),
                        }));
                      }}
                      disabled={addColumnColumnOptions.length === 0}
                    >
                      <SelectTrigger id="add-column-fk-column">
                        <SelectValue
                          placeholder={
                            addColumnColumnOptions.length === 0
                              ? 'Select table first'
                              : 'Select column'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {addColumnColumnOptions.length === 0 ? (
                          <SelectItem value={NO_COLUMNS_SENTINEL} disabled>
                            {addColumnForm.referenceTable
                              ? 'Load columns for selected table'
                              : 'Select table first'}
                          </SelectItem>
                        ) : (
                          addColumnColumnOptions.map((columnOption) => (
                            <SelectItem key={columnOption.name} value={columnOption.name}>
                              {columnOption.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>On Delete</Label>
                    <Select
                      value={addColumnForm.referenceOnDelete}
                      onValueChange={(value) =>
                        setAddColumnForm((prev) => ({ ...prev, referenceOnDelete: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FK_ACTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>On Update</Label>
                    <Select
                      value={addColumnForm.referenceOnUpdate}
                      onValueChange={(value) =>
                        setAddColumnForm((prev) => ({ ...prev, referenceOnUpdate: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FK_ACTION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumnSubmit}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dropColumnTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDropColumnTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop Column</DialogTitle>
            {dropColumnTarget && (
              <DialogDescription>
                Remove column <span className="font-mono">{dropColumnTarget.column}</span> from{' '}
                <span className="font-mono">{dropColumnTarget.schema}.{dropColumnTarget.table}</span>.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dropping a column permanently removes its data. Proceed with caution.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="drop-column-cascade"
                checked={dropColumnOptions.cascade}
                onCheckedChange={(checked) =>
                  setDropColumnOptions((prev) => ({ ...prev, cascade: checked === true }))
                }
              />
              <Label htmlFor="drop-column-cascade" className="text-sm">
                Cascade (drop dependent objects)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="drop-column-if-exists"
                checked={dropColumnOptions.ifExists}
                onCheckedChange={(checked) =>
                  setDropColumnOptions((prev) => ({ ...prev, ifExists: checked === true }))
                }
              />
              <Label htmlFor="drop-column-if-exists" className="text-sm">
                Include IF EXISTS safeguard
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropColumnTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDropColumnSubmit}>
              Drop Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={insertRowTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInsertRowTarget(null);
            setInsertRowForm({
              mode: 'form',
              json: INSERT_ROW_JSON_TEMPLATE,
              fields: [],
            });
            setForeignKeySearch(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Insert Row</DialogTitle>
            {insertRowTarget && (
              <DialogDescription>
                {insertRowForm.mode === 'form' ? (
                  <>
                    Choose values for columns in{' '}
                    <span className="font-mono">
                      {insertRowTarget.schema}.{insertRowTarget.table}
                    </span>. Unchecked columns are omitted so defaults can apply.
                  </>
                ) : (
                  <>
                    Provide a JSON object representing the row to insert into{' '}
                    <span className="font-mono">
                      {insertRowTarget.schema}.{insertRowTarget.table}
                    </span>.
                  </>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {insertRowForm.mode === 'form'
                  ? 'Values are coerced to the proper PostgreSQL types. Use NULL for nullable columns or switch to JSON for expressions and complex structures.'
                  : 'Paste or edit the JSON payload directly. Switch back to the guided form if you prefer column inputs.'}
              </p>
              <Button variant="ghost" size="sm" onClick={toggleInsertRowMode}>
                {insertRowForm.mode === 'form' ? 'Switch to JSON input' : 'Switch to guided form'}
              </Button>
            </div>
            {insertRowForm.mode === 'form' ? (
              insertRowForm.fields.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                  Column metadata is loading. Expand this table in the schema tree if the list stays empty.
                </div>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {insertRowForm.fields.map((field) => {
                    const isRequired = !field.isNullable && !field.hasDefault;
                    const disabledInput = !field.include || field.mode === 'null';
                    const placeholder = getPlaceholderForType(field.dataType);
                    const defaultPreview =
                      field.defaultValue && field.defaultValue.length > 80
                        ? `${field.defaultValue.slice(0, 80)}…`
                        : field.defaultValue ?? '';

                    return (
                      <div
                        key={field.name}
                        className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Checkbox
                            id={`insert-${field.name}-include`}
                            checked={field.include}
                            disabled={isRequired}
                            onCheckedChange={(checked) => {
                              const include = checked === true;
                              updateInsertRowField(field.name, (current) => {
                                if (!include) {
                                  return {
                                    ...current,
                                    include: false,
                                    mode: 'value',
                                    lookupPreview: undefined,
                                  };
                                }
                                const nextValue =
                                  isBooleanType(current.dataType) && current.value === ''
                                    ? 'true'
                                    : current.value;
                                return {
                                  ...current,
                                  include: true,
                                  value: nextValue,
                                  mode: 'value',
                                };
                              });
                            }}
                          />
                          <Label
                            htmlFor={`insert-${field.name}-include`}
                            className="text-sm font-mono"
                          >
                            {field.name}
                          </Label>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {field.dataType}
                          </Badge>
                          {isRequired ? (
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              Required
                            </Badge>
                          ) : field.isNullable ? (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              Nullable
                            </Badge>
                          ) : null}
                          {field.hasDefault && (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              Default
                            </Badge>
                          )}
                        </div>
                        {field.hasDefault && defaultPreview && (
                          <p className="text-xs text-muted-foreground">
                            Default:&nbsp;
                            <span className="font-mono break-all">{defaultPreview}</span>
                          </p>
                        )}
                        {field.include && (
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                            {isBooleanType(field.dataType) ? (
                              <Select
                                value={field.value}
                                onValueChange={(value) =>
                                  updateInsertRowField(field.name, (current) => ({
                                    ...current,
                                    value,
                                    mode: 'value',
                                    lookupPreview: undefined,
                                  }))
                                }
                                disabled={disabledInput}
                              >
                                <SelectTrigger id={`insert-${field.name}-value`}>
                                  <SelectValue placeholder="Select value" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">true</SelectItem>
                                  <SelectItem value="false">false</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : isJsonType(field.dataType) ? (
                              <textarea
                                className="w-full min-h-[96px] rounded-md border border-border bg-background/80 p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                value={field.value}
                                onChange={(event) =>
                                  updateInsertRowField(field.name, (current) => ({
                                    ...current,
                                    value: event.target.value,
                                    mode: 'value',
                                    lookupPreview: undefined,
                                  }))
                                }
                                placeholder='{"key": "value"}'
                                disabled={disabledInput}
                              />
                            ) : (
                              <Input
                                value={field.value}
                                onChange={(event) =>
                                  updateInsertRowField(field.name, (current) => ({
                                    ...current,
                                    value: event.target.value,
                                    mode: 'value',
                                    lookupPreview: undefined,
                                  }))
                                }
                                placeholder={placeholder}
                                disabled={disabledInput}
                                inputMode={isNumericType(field.dataType) ? 'decimal' : undefined}
                              />
                            )}
                            <div className="flex items-center justify-end gap-2 md:justify-start">
                              <Button
                                type="button"
                                variant={field.mode === 'null' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() =>
                                  updateInsertRowField(field.name, (current) => ({
                                    ...current,
                                    mode: current.mode === 'null' ? 'value' : 'null',
                                    lookupPreview:
                                      current.mode === 'null' ? current.lookupPreview : undefined,
                                  }))
                                }
                                disabled={!field.isNullable || !field.include}
                              >
                                {field.mode === 'null' ? 'Will insert NULL' : 'Set NULL'}
                              </Button>
                            </div>
                          </div>
                        )}
                        {!field.include && !isRequired && (
                          <p className="text-xs text-muted-foreground">
                            {field.hasDefault
                              ? 'Column will use its default value.'
                              : 'Column will be omitted from the insert.'}
                          </p>
                        )}
                        {field.lookupPreview && (
                          <p className="text-xs text-muted-foreground">
                            Selected row: <span className="font-mono break-all">{field.lookupPreview}</span>
                          </p>
                        )}
                        {field.foreignKey && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              References{' '}
                              <span className="font-mono">
                                {(field.foreignKey.schema ?? insertRowTarget?.schema ?? '?')}.
                                {field.foreignKey.table}.{field.foreignKey.column}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openForeignKeySearch(field)}
                            >
                              Search rows
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <textarea
                  className="w-full min-h-[220px] rounded-md border border-border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  value={insertRowForm.json}
                  onChange={(event) =>
                    setInsertRowForm((prev) => ({
                      ...prev,
                      json: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Example: {'{ "name": "Alice", "age": 42 }'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setInsertRowTarget(null);
                setInsertRowForm({
                  mode: 'form',
                  json: INSERT_ROW_JSON_TEMPLATE,
                  fields: [],
                });
                setForeignKeySearch(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleInsertRowSubmit}>Insert Row</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={foreignKeySearch !== null}
        onOpenChange={(open) => {
          if (!open) {
            setForeignKeySearch(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Select Referenced Row</DialogTitle>
            {foreignKeySearch && (
              <DialogDescription>
                The <span className="font-mono">{foreignKeySearch.column}</span> value from
                {' '}
                <span className="font-mono">
                  {foreignKeySearch.schema}.{foreignKeySearch.table}
                </span>{' '}
                will populate <span className="font-mono">{foreignKeySearch.fieldName}</span>.
              </DialogDescription>
            )}
          </DialogHeader>
          {foreignKeySearch && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Search by referenced value"
                value={foreignKeySearch.searchTerm}
                onChange={(event) =>
                  setForeignKeySearch((prev) =>
                    prev
                      ? {
                          ...prev,
                          searchTerm: event.target.value,
                        }
                      : prev
                  )
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing results for{' '}
                  <span className="font-mono">
                    {foreignKeySearch.schema}.{foreignKeySearch.table}.{foreignKeySearch.column}
                  </span>
                </span>
                {foreignKeySearch.loading && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Searching…
                  </span>
                )}
              </div>
              {foreignKeySearch.error && (
                <Alert variant="destructive">
                  <AlertDescription>{foreignKeySearch.error}</AlertDescription>
                </Alert>
              )}
              <ScrollArea className="h-[260px] rounded-md border border-border/60">
                <div className="divide-y divide-border/70">
                  {foreignKeySearch.results.length === 0 && !foreignKeySearch.loading ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      No rows match the current search.
                    </div>
                  ) : (
                    foreignKeySearch.results.map((candidate) => (
                      <button
                        key={candidate.key}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                        onClick={() => handleForeignKeyCandidateSelect(candidate)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm">{candidate.key}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {summarizeRow(candidate.row)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteRowsTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRowsTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete Rows</DialogTitle>
            {deleteRowsTarget && (
              <DialogDescription>
                Provide criteria for deleting rows from{' '}
                <span className="font-mono">{deleteRowsTarget.schema}.{deleteRowsTarget.table}</span>.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="delete-rows-criteria">Criteria (JSON)</Label>
            <textarea
              id="delete-rows-criteria"
              className="w-full min-h-[160px] rounded-md border border-border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              value={deleteRowsForm.criteriaJson}
              onChange={(event) =>
                setDeleteRowsForm((prev) => ({ ...prev, criteriaJson: event.target.value }))
              }
            />
            <div className="grid gap-2">
              <Label htmlFor="delete-rows-limit">Limit (optional)</Label>
              <Input
                id="delete-rows-limit"
                value={deleteRowsForm.limit}
                onChange={(event) =>
                  setDeleteRowsForm((prev) => ({ ...prev, limit: event.target.value }))
                }
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                When provided, restricts the delete to a maximum number of rows.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRowsTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRowsSubmit}>
              Delete Rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
