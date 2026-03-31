/**
 * Actuals transaction data model for imported bank/Ramp transactions.
 * This is separate from the old actualsImport.ts which handled a different import flow.
 */

export type ActualsSource = 'bank' | 'ramp' | 'unknown';

export interface ActualsTransaction {
  id: string;
  source: ActualsSource;
  fiscalYearId: string;
  txnDate: string; // ISO date string
  postedDate?: string; // ISO date string
  merchantName: string;
  description?: string;
  amount: number; // always positive (spend)
  currency: string; // default 'USD'
  category?: string;
  externalId?: string; // if provided by Ramp/bank
  raw: Record<string, unknown>; // original row for traceability
  createdAt: string; // ISO timestamp
  canonicalVendorId?: string | null; // Global canonical vendor reference
  importBatchId?: string | null; // Links to import_batches.id
  importFilename?: string | null; // Original CSV filename
}

export interface ActualsSummary {
  count: number;
  total: number;
  minDate?: string;
  maxDate?: string;
}

export interface ColumnMapping {
  txnDate: string;
  merchantName: string;
  amount: string;
  description?: string;
  category?: string;
  externalId?: string;
  postedDate?: string;
}

export type AmountSignMode = 'positive' | 'negative';

export interface ImportConfig {
  source: ActualsSource;
  amountSign: AmountSignMode;
  replaceExisting: boolean;
  skipInvalidRows: boolean;
}

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  txnDate?: string;
  merchantName?: string;
  amount?: number;
  description?: string;
  category?: string;
  externalId?: string;
  postedDate?: string;
  errors: string[];
}
