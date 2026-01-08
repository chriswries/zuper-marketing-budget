/**
 * Fiscal Year lifecycle operations: archive, restore, hard delete.
 * All operations now work with DB-backed stores.
 */

import { supabase } from '@/integrations/supabase/client';
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
export async function archiveFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => Promise<void>
): Promise<void> {
  const previousStatus = fiscalYear.status;

  await updateFiscalYearBudget(fiscalYear.id, (fy) => ({
    ...fy,
    status: 'archived' as FiscalYearStatus,
    archivedAt: new Date().toISOString(),
    archivedByRole: role,
    archivedJustification: justification,
    previousStatusBeforeArchive: previousStatus,
    updatedAt: new Date().toISOString(),
  }));

  // Log audit event (using 'request' entity type with FY id for consistency with FY-1)
  await appendApprovalAudit('request', fiscalYear.id, {
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
export async function restoreFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => Promise<void>
): Promise<void> {
  const restoredStatus = fiscalYear.previousStatusBeforeArchive || 'planning';

  await updateFiscalYearBudget(fiscalYear.id, (fy) => ({
    ...fy,
    status: restoredStatus,
    archivedAt: undefined,
    archivedByRole: undefined,
    archivedJustification: undefined,
    previousStatusBeforeArchive: undefined,
    updatedAt: new Date().toISOString(),
  }));

  // Log audit event
  await appendApprovalAudit('request', fiscalYear.id, {
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
export async function hardDeleteFiscalYear(
  fiscalYear: FiscalYearBudget,
  role: UserRole,
  justification: string,
  allRequests: SpendRequest[],
  deleteFiscalYearBudget: (id: string) => Promise<void>,
  adminOverrideEnabled: boolean
): Promise<HardDeleteResult | null> {
  // Defensive guard: hard delete requires Admin Override Mode AND admin role
  if (!adminOverrideEnabled || role !== 'admin') {
    return null;
  }
  const fyId = fiscalYear.id;
  const fyName = fiscalYear.name;

  // 1. Find FY-scoped requests
  const fyRequests = getFYScopedRequests(fiscalYear, allRequests);
  const deletedRequestIds = fyRequests.map(r => r.id);

  // 2. Log audit event BEFORE deleting (so it's recorded)
  await appendApprovalAudit('request', fyId, {
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
    await removeApprovalAuditForEntity('request', requestId);
    deletedAuditEntityIds.push(requestId);
  }

  // 4. Delete FY-scoped requests from DB
  if (deletedRequestIds.length > 0) {
    const { error } = await supabase
      .from('spend_requests')
      .delete()
      .in('id', deletedRequestIds);

    if (error) {
      console.error('Failed to delete FY-scoped requests:', error);
    }
  }

  // 5. Delete forecast for FY
  await clearForecastForFY(fyId);

  // 6. Delete actuals for FY
  await deleteActualsForFY(fyId);

  // 7. Delete actuals matching for FY
  await deleteActualsMatchingForFY(fyId);

  // 8. Delete actuals rollup cache for FY
  deleteActualsRollupForFY(fyId);

  // 9. Delete the FY itself from DB (this will cascade delete fy_forecasts, actuals_transactions, actuals_matching)
  await deleteFiscalYearBudget(fyId);

  return {
    deletedRequestIds,
    deletedAuditEntityIds,
  };
}
