import { useRef } from 'react';
import Editor, { Monaco, type OnMount } from '@monaco-editor/react';

export interface SqlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onExecute?: () => void;
  onFormat?: () => void;
  readOnly?: boolean;
  height?: string;
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  onFormat,
  readOnly = false,
  height = '100%',
}: SqlEditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure SQL language features
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (_model, position) => {
        const suggestions: any[] = [
          // SQL Keywords
          ...SQL_KEYWORDS.map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          })),
          // SQL Functions
          ...SQL_FUNCTIONS.map((func) => ({
            label: func,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${func}()`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column,
              endColumn: position.column,
            },
          })),
        ];

        return { suggestions };
      },
    });

    // Add custom keyboard shortcuts
    // Cmd/Ctrl + Enter: Execute query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecute?.();
    });

    // Alt/Option + Cmd/Ctrl + F: Format SQL
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      onFormat?.();
    });

    // Cmd/Ctrl + K: Open command palette
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      editor.trigger('keyboard', 'editor.action.quickCommand', {});
    });

    // Focus the editor
    editor.focus();
  };

  function handleEditorChange(value: string | undefined) {
    onChange?.(value || '');
  }

  // Define editor options
  const editorOptions = {
    minimap: {
      enabled: true,
    },
    lineNumbers: 'on' as const,
    roundedSelection: true,
    scrollBeyondLastLine: false,
    readOnly,
    automaticLayout: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    fontLigatures: true,
    cursorStyle: 'line' as const,
    cursorBlinking: 'smooth' as const,
    renderWhitespace: 'selection' as const,
    renderLineHighlight: 'all' as const,
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
    acceptSuggestionOnEnter: 'on' as const,
    tabCompletion: 'on' as const,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    parameterHints: {
      enabled: true,
    },
    folding: true,
    foldingStrategy: 'indentation' as const,
    showFoldingControls: 'always' as const,
    bracketPairColorization: {
      enabled: true,
    },
    padding: {
      top: 16,
      bottom: 16,
    },
  };

  return (
    <div className="w-full h-full">
      <Editor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={editorOptions}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-muted-foreground">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Loading editor...</p>
            </div>
          </div>
        }
      />
    </div>
  );
}

// SQL Keywords for autocomplete
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'INDEX',
  'VIEW',
  'PROCEDURE',
  'FUNCTION',
  'TRIGGER',
  'DATABASE',
  'SCHEMA',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'ON',
  'USING',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'ALL',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WITH',
  'RECURSIVE',
  'RETURNING',
  'VALUES',
  'SET',
  'DEFAULT',
  'CONSTRAINT',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'REFERENCES',
  'UNIQUE',
  'CHECK',
  'CASCADE',
  'RESTRICT',
  'NO ACTION',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'SAVEPOINT',
  'GRANT',
  'REVOKE',
  'ANALYZE',
  'EXPLAIN',
  'VACUUM',
];

// Common PostgreSQL functions
const SQL_FUNCTIONS = [
  // Aggregate functions
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'ARRAY_AGG',
  'STRING_AGG',
  'JSON_AGG',
  'JSONB_AGG',
  // String functions
  'CONCAT',
  'SUBSTRING',
  'LENGTH',
  'LOWER',
  'UPPER',
  'TRIM',
  'LTRIM',
  'RTRIM',
  'REPLACE',
  'SPLIT_PART',
  'REGEXP_REPLACE',
  'REGEXP_MATCH',
  // Date/Time functions
  'NOW',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'DATE_TRUNC',
  'EXTRACT',
  'AGE',
  'TO_CHAR',
  'TO_DATE',
  'TO_TIMESTAMP',
  // JSON functions
  'JSON_BUILD_OBJECT',
  'JSON_BUILD_ARRAY',
  'JSONB_BUILD_OBJECT',
  'JSONB_BUILD_ARRAY',
  'JSON_EXTRACT_PATH',
  'JSONB_EXTRACT_PATH',
  'JSON_ARRAY_ELEMENTS',
  'JSONB_ARRAY_ELEMENTS',
  // Math functions
  'ABS',
  'CEIL',
  'FLOOR',
  'ROUND',
  'TRUNC',
  'POWER',
  'SQRT',
  'RANDOM',
  // Type conversion
  'CAST',
  'COALESCE',
  'NULLIF',
  'GREATEST',
  'LEAST',
  // Window functions
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'LAG',
  'LEAD',
  'FIRST_VALUE',
  'LAST_VALUE',
];
