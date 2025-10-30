import type { QueryResult } from '@/types/query';

/**
 * Convert query results to CSV format
 */
export function resultsToCsv(result: QueryResult): string {
  if (!result || result.rows.length === 0) {
    return '';
  }

  const headers = result.fields.map((f) => f.name);
  const rows = result.rows;

  // Escape CSV values
  const escapeValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  // Build CSV
  const csvLines = [
    headers.map(escapeValue).join(','),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * Convert query results to JSON format
 */
export function resultsToJson(result: QueryResult, pretty = true): string {
  if (!result || result.rows.length === 0) {
    return '[]';
  }

  return JSON.stringify(result.rows, null, pretty ? 2 : 0);
}

/**
 * Export query results to CSV file
 */
export function exportToCsv(result: QueryResult, filename = 'query_results.csv'): void {
  const csv = resultsToCsv(result);
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Export query results to JSON file
 */
export function exportToJson(result: QueryResult, filename = 'query_results.json'): void {
  const json = resultsToJson(result);
  downloadFile(json, filename, 'application/json');
}

/**
 * Copy query results to clipboard
 */
export async function copyToClipboard(
  result: QueryResult,
  format: 'csv' | 'json' | 'tsv' = 'csv'
): Promise<void> {
  let text: string;

  switch (format) {
    case 'json':
      text = resultsToJson(result);
      break;
    case 'tsv':
      text = resultsToTsv(result);
      break;
    case 'csv':
    default:
      text = resultsToCsv(result);
      break;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    throw new Error('Failed to copy to clipboard');
  }
}

/**
 * Copy a single cell value to clipboard
 */
export async function copyCellToClipboard(value: any): Promise<void> {
  let text: string;

  if (value === null || value === undefined) {
    text = 'NULL';
  } else if (typeof value === 'object') {
    text = JSON.stringify(value, null, 2);
  } else {
    text = String(value);
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    throw new Error('Failed to copy to clipboard');
  }
}

/**
 * Convert query results to TSV (Tab-Separated Values) format
 */
export function resultsToTsv(result: QueryResult): string {
  if (!result || result.rows.length === 0) {
    return '';
  }

  const headers = result.fields.map((f) => f.name);
  const rows = result.rows;

  // Convert value to string, handling nulls and objects
  const valueToString = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value).replace(/\t/g, '  '); // Replace tabs with spaces
  };

  // Build TSV
  const tsvLines = [
    headers.join('\t'),
    ...rows.map((row) => headers.map((header) => valueToString(row[header])).join('\t')),
  ];

  return tsvLines.join('\n');
}

/**
 * Download a file with the given content
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a value for display in the results grid
 */
export function formatCellValue(value: any, maxLength = 100): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > maxLength) {
      return json.substring(0, maxLength) + '...';
    }
    return json;
  }

  const stringValue = String(value);
  if (stringValue.length > maxLength) {
    return stringValue.substring(0, maxLength) + '...';
  }

  return stringValue;
}

/**
 * Get the display type of a value for styling
 */
export function getValueType(
  value: any
): 'null' | 'boolean' | 'number' | 'string' | 'object' | 'array' | 'date' {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  // Check if it looks like a date
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
    return 'date';
  }

  return 'string';
}
