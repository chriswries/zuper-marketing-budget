/**
 * Fiscal Year Bundle types for export/import functionality.
 * Schema version 1.
 */

import type { CostCenter } from '@/types/budget';
import type { ActualsTransaction } from '@/types/actuals';
import type { TransactionMatch, MerchantRule } from '@/lib/actualsMatchingStore';
import type { SpendRequest } from '@/types/requests';
import type { ApprovalAuditEvent } from '@/types/approvalAudit';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

export interface ActualsMatchingBundle {
  matchesByTxnId: Record<string, TransactionMatch>;
  rulesByMerchantKey: Record<string, MerchantRule>;
}

export interface FiscalYearBundleV1 {
  schemaVersion: 1;
  exportedAt: string; // ISO timestamp
  exportedByRole: UserRole;
  fiscalYearId: string;
  fiscalYearName: string;
  fiscalYear: FiscalYearBudget;
  forecast: CostCenter[] | null;
  actualsTransactions: ActualsTransaction[];
  actualsMatching: ActualsMatchingBundle;
  requests: SpendRequest[];
  approvalAuditEventsByRequestId: Record<string, ApprovalAuditEvent[]>;
  fyAuditEvents?: ApprovalAuditEvent[];
  notes?: string[];
}

export interface BundleValidationResult {
  ok: boolean;
  errors: string[];
}
