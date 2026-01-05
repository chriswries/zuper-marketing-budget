import type { Month } from './budget';

export interface RawImportedRow {
  rowIndex: number;
  raw: Record<string, string>;
}

export interface ParsedImportData {
  headers: string[];
  rows: RawImportedRow[];
  errors: string[];
}

export type ImportWizardStep = 'upload' | 'preview' | 'mapping' | 'confirm' | 'vendors';

export interface ColumnMapping {
  dateColumn: string;
  amountColumn: string;
  vendorColumn: string;
  memoColumn?: string;
  amountSignMode: 'expenses_negative' | 'expenses_positive';
}

export interface ImportedTransactionDraft {
  rowIndex: number;
  transactionDate: string;
  amount: number;
  rawVendorName: string;
  memo?: string;
  recognizedMonth: Month;
}

export interface ImportedTransactionWithVendor extends ImportedTransactionDraft {
  canonicalVendorId: string;
  canonicalVendorName: string;
}

export interface CanonicalVendor {
  id: string;
  name: string;
}

export interface VendorMapping {
  rawVendorName: string;
  canonicalVendorId: string;
}

export interface MappingValidationError {
  rowIndex: number;
  message: string;
}

export interface MappingResult {
  mapping: ColumnMapping;
  transactions: ImportedTransactionDraft[];
  errors: MappingValidationError[];
}
