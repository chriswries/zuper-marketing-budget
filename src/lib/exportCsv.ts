/**
 * CSV Export Utility
 * Properly escapes commas, quotes, and newlines for RFC 4180 compliance.
 */

export type CsvRow = Record<string, unknown>;

export interface CsvColumn {
  key: string;
  header: string;
}

/**
 * Escape a value for CSV:
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any existing quotes
 */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // Check if escaping is needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  return str;
}

/**
 * Build CSV content from rows and columns
 */
function buildCsvContent(rows: CsvRow[], columns: CsvColumn[]): string {
  // Header row
  const headerRow = columns.map(col => escapeCsvValue(col.header)).join(',');
  
  // Data rows
  const dataRows = rows.map(row => {
    return columns.map(col => escapeCsvValue(row[col.key])).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Trigger download of a CSV file
 */
export function downloadCsv(
  filename: string,
  rows: CsvRow[],
  columns: CsvColumn[]
): void {
  const csvContent = buildCsvContent(rows, columns);
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object after a delay to ensure download starts
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
