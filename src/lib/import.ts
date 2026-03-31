import type { Month } from '@/types/budget';
import type { 
  ColumnMapping, 
  ImportedTransactionDraft, 
  MappingValidationError, 
  RawImportedRow 
} from '@/types/import';

/**
 * Parse a date string into a Date object
 */
export function parseDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  
  const trimmed = value.trim();
  const date = new Date(trimmed);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

/**
 * Parse an amount string into a number
 * Handles: $1,234.56, (1,234.56), -1234.56, etc.
 */
export function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null;
  
  let trimmed = value.trim();
  
  // Check for parentheses notation (negative)
  const isParenthesesNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  if (isParenthesesNegative) {
    trimmed = trimmed.slice(1, -1);
  }
  
  // Remove currency symbols and commas
  trimmed = trimmed.replace(/[$,\s]/g, '');
  
  // Parse as float
  const amount = parseFloat(trimmed);
  
  if (isNaN(amount)) {
    return null;
  }
  
  return isParenthesesNegative ? -amount : amount;
}

/**
 * Get the fiscal month from a date
 */
export function getMonthFromDate(date: Date): Month {
  const monthIndex = date.getMonth(); // 0-11
  const monthMap: Record<number, Month> = {
    0: 'jan',
    1: 'feb',
    2: 'mar',
    3: 'apr',
    4: 'may',
    5: 'jun',
    6: 'jul',
    7: 'aug',
    8: 'sep',
    9: 'oct',
    10: 'nov',
    11: 'dec',
  };
  return monthMap[monthIndex];
}

/**
 * Auto-detect column mapping based on header names
 */
export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {
    amountSignMode: 'expenses_positive', // Default assumption: expenses come in as positive values
  };
  
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  // Date detection
  const datePatterns = ['date', 'transaction date', 'posted', 'post date', 'trans date'];
  const dateIndex = lowerHeaders.findIndex(h => 
    datePatterns.some(p => h.includes(p))
  );
  if (dateIndex !== -1) {
    mapping.dateColumn = headers[dateIndex];
  }
  
  // Amount detection
  const amountPatterns = ['amount', 'amt', 'transaction amount', 'charge', 'debit'];
  const amountIndex = lowerHeaders.findIndex(h => 
    amountPatterns.some(p => h.includes(p))
  );
  if (amountIndex !== -1) {
    mapping.amountColumn = headers[amountIndex];
  }
  
  // Vendor detection (exclude description if we'll use it for memo)
  const vendorPatterns = ['vendor', 'merchant', 'payee', 'name'];
  let vendorIndex = lowerHeaders.findIndex(h => 
    vendorPatterns.some(p => h.includes(p))
  );
  // Fallback to description if no vendor found
  if (vendorIndex === -1) {
    vendorIndex = lowerHeaders.findIndex(h => h.includes('description'));
  }
  if (vendorIndex !== -1) {
    mapping.vendorColumn = headers[vendorIndex];
  }
  
  // Memo detection
  const memoPatterns = ['memo', 'note', 'notes', 'details'];
  let memoIndex = lowerHeaders.findIndex(h => 
    memoPatterns.some(p => h.includes(p))
  );
  // Use description for memo if not already used for vendor
  if (memoIndex === -1 && vendorIndex !== lowerHeaders.findIndex(h => h.includes('description'))) {
    memoIndex = lowerHeaders.findIndex(h => h.includes('description'));
  }
  if (memoIndex !== -1 && headers[memoIndex] !== mapping.vendorColumn) {
    mapping.memoColumn = headers[memoIndex];
  }
  
  return mapping;
}

/**
 * Normalize and validate rows based on column mapping
 */
export function normalizeTransactions(
  rows: RawImportedRow[],
  mapping: ColumnMapping
): { transactions: ImportedTransactionDraft[]; errors: MappingValidationError[] } {
  const transactions: ImportedTransactionDraft[] = [];
  const errors: MappingValidationError[] = [];
  
  for (const row of rows) {
    const dateValue = row.raw[mapping.dateColumn] || '';
    const amountValue = row.raw[mapping.amountColumn] || '';
    const vendorValue = row.raw[mapping.vendorColumn] || '';
    const memoValue = mapping.memoColumn ? row.raw[mapping.memoColumn] || '' : '';
    
    // Validate date
    const parsedDate = parseDate(dateValue);
    if (!parsedDate) {
      errors.push({
        rowIndex: row.rowIndex,
        message: `Invalid date: "${dateValue}"`,
      });
      continue;
    }
    
    // Validate amount
    const parsedAmount = parseAmount(amountValue);
    if (parsedAmount === null) {
      errors.push({
        rowIndex: row.rowIndex,
        message: `Invalid amount: "${amountValue}"`,
      });
      continue;
    }
    
    // Validate vendor
    const trimmedVendor = vendorValue.trim();
    if (!trimmedVendor) {
      errors.push({
        rowIndex: row.rowIndex,
        message: 'Missing vendor name',
      });
      continue;
    }
    
    // Normalize amount based on sign mode
    // expenses_negative: expenses come in as negative, we flip to positive
    // expenses_positive: expenses come in as positive, keep as is
    const normalizedAmount = mapping.amountSignMode === 'expenses_negative' 
      ? -parsedAmount 
      : parsedAmount;
    
    transactions.push({
      rowIndex: row.rowIndex,
      transactionDate: parsedDate.toISOString().split('T')[0],
      amount: normalizedAmount,
      rawVendorName: trimmedVendor,
      memo: memoValue.trim() || undefined,
      recognizedMonth: getMonthFromDate(parsedDate),
    });
  }
  
  return { transactions, errors };
}

