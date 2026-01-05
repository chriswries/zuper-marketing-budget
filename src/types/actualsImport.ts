import type { Month } from './budget';
import type { ImportedTransactionMapped } from './import';

export interface ActualsImportBatch {
  id: string;
  createdAt: string; // ISO string
  fileName?: string;
  transactionCount: number;
  totalAmount: number;
  aggregates: Record<string, Record<Month, number>>; // lineItemId -> month -> amount
  transactions: ImportedTransactionMapped[];
}
