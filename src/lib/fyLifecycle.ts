/**
 * Fiscal Year lifecycle operations: archive, restore, hard delete.
 */

import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import type { FiscalYearBudget, FiscalYearStatus } from '@/contexts/FiscalYearBudgetContext';
import type { SpendRequest } from '@/types/requests';
import { clearForecastForFY } from '@/lib/forecastStore';
import { deleteActualsForFY } from '@/lib/actualsStore';
import { deleteActualsMatchingForFY } from '@/lib/actualsMatchingStore';
import { deleteActualsRollupForFY } from '@/lib/actualsRollupStore';
import { appendApprovalAudit, removeApprovalAuditForEntity } from '@/lib/approvalAuditStore';

/**
 * Get FY-scoped requests based on the same logic as buildFiscalYearBundleV1.
 */
export function getFYScopedRequests(
  fiscalYear: FiscalYearBudget,
  allRequests: SpendRequest[]
): SpendRequest[] {
  const fyCostCenterIds = new Set(fiscalYear.costCenters.map(cc => cc.id));

  return allRequests.filter(req => {
    // Primary check: originFiscalYearId matches
    if (req.originFiscalYearId === fiscalYear.id) {
      return true;
    }
    // Fallback for older requests: check if costCenterId or originCostCenterId matches FY's cost centers
    if (req.costCenterId && fyCostCenterIds.has(req.costCenterId)) {
      return true;
    }
    if (req.originCostCenterId && fyCostCenterIds.has(req.originCostCenterId)) {
      return true;
    }
    return false;
  });
}

/**
 * Archive a fiscal year (reversible).
 */
export function archiveFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => void
): void {
  const previousStatus = fiscalYear.status;

  updateFiscalYearBudget(fiscalYear.id, (fy) => ({
    ...fy,
    status: 'archived' as FiscalYearStatus,
    archivedAt: new Date().toISOString(),
    archivedByRole: role,
    archivedJustification: justification,
    previousStatusBeforeArchive: previousStatus,
    updatedAt: new Date().toISOString(),
  }));

  // Log audit event (using 'request' entity type with FY id for consistency with FY-1)
  appendApprovalAudit('request', fiscalYear.id, {
    action: 'fy_archived',
    actorRole: role === 'admin' ? 'admin' : 'manager',
    note: justification,
    meta: {
      fyId: fiscalYear.id,
      fyName: fiscalYear.name,
      previousStatus,
    },
  });
}

/**
 * Restore an archived fiscal year.
 */
export function restoreFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => void
): void {
  const restoredStatus = fiscalYear.previousStatusBeforeArchive || 'planning';

  updateFiscalYearBudget(fiscalYear.id, (fy) => ({
    ...fy,
    status: restoredStatus,
    archivedAt: undefined,
    archivedByRole: undefined,
    archivedJustification: undefined,
    previousStatusBeforeArchive: undefined,
    updatedAt: new Date().toISOString(),
  }));

  // Log audit event
  appendApprovalAudit('request', fiscalYear.id, {
    action: 'fy_restored',
    actorRole: role === 'admin' ? 'admin' : 'manager',
    note: justification,
    meta: {
      fyId: fiscalYear.id,
      fyName: fiscalYear.name,
      restoredStatus,
    },
  });
}

export interface HardDeleteResult {
  deletedRequestIds: string[];
  deletedAuditEntityIds: string[];
}

/**
 * Hard delete a fiscal year and all associated data (destructive).
 * Returns null if adminOverrideEnabled is false (guard).
 */
export function hardDeleteFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  allRequests: SpendRequest[],
  deleteFiscalYearBudget: (id: string) => void,
  setRequests: (updater: (prev: SpendRequest[]) => SpendRequest[]) => void,
  adminOverrideEnabled: boolean
): HardDeleteResult | null {
  // Defensive guard: hard delete requires Admin Override Mode
  if (!adminOverrideEnabled) {
    return null;
  }
  const fyId = fiscalYear.id;
  const fyName = fiscalYear.name;

  // 1. Find FY-scoped requests
  const fyRequests = getFYScopedRequests(fiscalYear, allRequests);
  const deletedRequestIds = fyRequests.map(r => r.id);

  // 2. Log audit event BEFORE deleting (so it's recorded)
  appendApprovalAudit('request', fyId, {
    action: 'fy_hard_deleted',
    actorRole: role === 'admin' ? 'admin' : 'manager',
    note: justification,
    meta: {
      fyId,
      fyName,
      deletedRequestCount: deletedRequestIds.length,
      deletedRequestIds,
    },
  });

  // 3. Remove audit events for each request
  const deletedAuditEntityIds: string[] = [];
  for (const requestId of deletedRequestIds) {
    removeApprovalAuditForEntity('request', requestId);
    deletedAuditEntityIds.push(requestId);
  }

  // 4. Remove FY-level audit events (but keep the hard_deleted event for history)
  // Actually, we should NOT remove FY-level audit to preserve the deletion record
  // So we skip: removeApprovalAuditForEntity('request', fyId);

  // 5. Remove requests from store
  const deletedRequestIdSet = new Set(deletedRequestIds);
  setRequests((prev) => prev.filter(r => !deletedRequestIdSet.has(r.id)));

  // 6. Delete forecast for FY
  clearForecastForFY(fyId);

  // 7. Delete actuals for FY
  deleteActualsForFY(fyId);

  // 8. Delete actuals matching for FY
  deleteActualsMatchingForFY(fyId);

  // 9. Delete actuals rollup cache for FY
  deleteActualsRollupForFY(fyId);

  // 10. Delete the FY itself from the FY store (this also clears selection if needed)
  deleteFiscalYearBudget(fyId);

  return {
    deletedRequestIds,
    deletedAuditEntityIds,
  };
}
