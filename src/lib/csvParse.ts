/**
 * Lightweight CSV parser that handles:
 * - Quoted values with commas inside
 * - CRLF and LF line endings
 * - Empty lines (skipped)
 */

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result: string[][] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    result.push(parseCsvLine(line));
  }

  if (result.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = result[0];
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < result.length; i++) {
    const row = result[i];
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j] ?? '';
    }
    rows.push(record);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push last field
  result.push(current.trim());

  return result;
}
