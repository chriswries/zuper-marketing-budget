/**
 * Import Fiscal Year Bundle (FY-3).
 * Supports restore (no conflicts) and overwrite (admin override required) modes.
 */

import type { FiscalYearBundleV1 } from '@/types/fyBundle';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import type { SpendRequest } from '@/types/requests';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import { validateFiscalYearBundle } from '@/lib/fyBundle';
import { hardDeleteFiscalYear } from '@/lib/fyLifecycle';
import { saveForecastForFY, clearForecastForFY } from '@/lib/forecastStore';
import { replaceActuals } from '@/lib/actualsStore';
import { replaceActualsMatchingForFY } from '@/lib/actualsMatchingStore';
import { deleteActualsRollupForFY } from '@/lib/actualsRollupStore';
import { replaceApprovalAuditForEntity, appendApprovalAudit } from '@/lib/approvalAuditStore';

/**
 * Parse a JSON file uploaded by the user.
 */
export async function parseJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        resolve(parsed);
      } catch (e) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export interface BundleConflictResult {
  schemaOk: boolean;
  validationErrors: string[];
  fyIdExists: boolean;
  requestIdConflicts: string[];
  summary: {
    costCenters: number;
    lineItems: number;
    forecastIncluded: boolean;
    actualsTxnCount: number;
    requestsCount: number;
    auditEventCount: number;
  };
}

/**
 * Detect conflicts between a bundle and existing data.
 */
export function detectBundleConflicts(
  bundle: unknown,
  existingFiscalYears: FiscalYearBudget[],
  existingRequests: SpendRequest[]
): BundleConflictResult {
  // First validate schema
  const validation = validateFiscalYearBundle(bundle);
  
  if (!validation.ok) {
    return {
      schemaOk: false,
      validationErrors: validation.errors,
      fyIdExists: false,
      requestIdConflicts: [],
      summary: {
        costCenters: 0,
        lineItems: 0,
        forecastIncluded: false,
        actualsTxnCount: 0,
        requestsCount: 0,
        auditEventCount: 0,
      },
    };
  }

  const b = bundle as FiscalYearBundleV1;

  // Check if FY ID already exists
  const fyIdExists = existingFiscalYears.some(fy => fy.id === b.fiscalYearId);

  // Check for request ID conflicts
  const existingRequestIds = new Set(existingRequests.map(r => r.id));
  const bundleRequestIds = b.requests.map(r => r.id);
  const requestIdConflicts = bundleRequestIds.filter(id => existingRequestIds.has(id));

  // Compute summary
  const costCenters = b.fiscalYear.costCenters.length;
  const lineItems = b.fiscalYear.costCenters.reduce(
    (sum, cc) => sum + cc.lineItems.length,
    0
  );
  const forecastIncluded = b.forecast !== null && b.forecast.length > 0;
  const actualsTxnCount = b.actualsTransactions.length;
  const requestsCount = b.requests.length;
  const auditEventCount = 
    Object.values(b.approvalAuditEventsByRequestId).flat().length +
    (b.fyAuditEvents?.length ?? 0);

  return {
    schemaOk: true,
    validationErrors: [],
    fyIdExists,
    requestIdConflicts,
    summary: {
      costCenters,
      lineItems,
      forecastIncluded,
      actualsTxnCount,
      requestsCount,
      auditEventCount,
    },
  };
}

export type ImportMode = 'restore' | 'overwrite';

export interface ImportBundleArgs {
  bundle: FiscalYearBundleV1;
  mode: ImportMode;
  justification: string;
  currentRole: UserRole;
  adminOverrideEnabled: boolean;
  // Store operations
  existingFiscalYears: FiscalYearBudget[];
  existingRequests: SpendRequest[];
  createFiscalYearBudget: (fy: FiscalYearBudget) => void;
  deleteFiscalYearBudget: (id: string) => void;
  setRequests: (updater: (prev: SpendRequest[]) => SpendRequest[]) => void;
}

export interface ImportResult {
  ok: boolean;
  errors?: string[];
  fiscalYearId?: string;
}

/**
 * Import a FiscalYearBundleV1 into the app.
 * - Restore mode: only if no conflicts
 * - Overwrite mode: requires admin + override, FY must exist, no request ID conflicts
 */
export function importFiscalYearBundleV1(args: ImportBundleArgs): ImportResult {
  const {
    bundle,
    mode,
    justification,
    currentRole,
    adminOverrideEnabled,
    existingFiscalYears,
    existingRequests,
    createFiscalYearBudget,
    deleteFiscalYearBudget,
    setRequests,
  } = args;

  // 1. Validate bundle
  const validation = validateFiscalYearBundle(bundle);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // 2. Detect conflicts
  const conflicts = detectBundleConflicts(bundle, existingFiscalYears, existingRequests);

  // 3. Mode-specific checks
  if (mode === 'restore') {
    // Restore mode: fail if FY exists or request conflicts
    if (conflicts.fyIdExists) {
      return { 
        ok: false, 
        errors: [`Fiscal year "${bundle.fiscalYearName}" (ID: ${bundle.fiscalYearId}) already exists. Use Overwrite mode or delete it first.`] 
      };
    }
    if (conflicts.requestIdConflicts.length > 0) {
      return { 
        ok: false, 
        errors: [`Request ID conflicts: ${conflicts.requestIdConflicts.join(', ')}. Cannot restore with conflicting request IDs.`] 
      };
    }
  } else if (mode === 'overwrite') {
    // Overwrite mode: requires admin + override + FY must exist + no request conflicts
    if (currentRole !== 'admin') {
      return { ok: false, errors: ['Overwrite mode requires Admin role.'] };
    }
    if (!adminOverrideEnabled) {
      return { ok: false, errors: ['Overwrite mode requires Admin Override Mode to be enabled.'] };
    }
    if (!conflicts.fyIdExists) {
      return { ok: false, errors: ['Fiscal year does not exist. Use Restore mode for new imports.'] };
    }
    if (conflicts.requestIdConflicts.length > 0) {
      return { 
        ok: false, 
        errors: [`Request ID conflicts with unrelated requests: ${conflicts.requestIdConflicts.join(', ')}. Cannot overwrite.`] 
      };
    }

    // Hard delete the existing FY first
    const existingFY = existingFiscalYears.find(fy => fy.id === bundle.fiscalYearId);
    if (!existingFY) {
      return { ok: false, errors: ['Could not find existing fiscal year to overwrite.'] };
    }

    const deleteResult = hardDeleteFiscalYear(
      existingFY,
      currentRole,
      `Overwriting with imported bundle. Original justification: ${justification}`,
      existingRequests,
      deleteFiscalYearBudget,
      setRequests,
      adminOverrideEnabled
    );

    if (!deleteResult) {
      return { ok: false, errors: ['Failed to delete existing fiscal year. Admin Override may be disabled.'] };
    }
  }

  const fyId = bundle.fiscalYearId;

  // 4. Perform import writes
  try {
    // a) Create/insert FY into FY store
    createFiscalYearBudget(bundle.fiscalYear);

    // b) Forecast
    if (bundle.forecast === null) {
      clearForecastForFY(fyId);
    } else {
      saveForecastForFY(fyId, bundle.forecast);
    }

    // c) Actuals
    replaceActuals(fyId, bundle.actualsTransactions);

    // d) Actuals matching
    replaceActualsMatchingForFY(fyId, bundle.actualsMatching);

    // e) Requests - merge without duplicates
    setRequests((prev) => {
      const existingIds = new Set(prev.map(r => r.id));
      const newRequests = bundle.requests.filter(r => !existingIds.has(r.id));
      return [...prev, ...newRequests];
    });

    // f) Approval audit events
    for (const [requestId, events] of Object.entries(bundle.approvalAuditEventsByRequestId)) {
      replaceApprovalAuditForEntity('request', requestId, events);
    }
    if (bundle.fyAuditEvents && bundle.fyAuditEvents.length > 0) {
      replaceApprovalAuditForEntity('request', fyId, bundle.fyAuditEvents);
    }

    // g) Clear rollup cache so it rebuilds
    deleteActualsRollupForFY(fyId);

    // 5. Append import audit event
    appendApprovalAudit('request', fyId, {
      action: 'fy_bundle_imported',
      actorRole: 'admin',
      note: justification,
      meta: {
        mode,
        exportedAt: bundle.exportedAt,
        importedAt: new Date().toISOString(),
        fiscalYearId: fyId,
        fiscalYearName: bundle.fiscalYearName,
      },
    });

    return { ok: true, fiscalYearId: fyId };
  } catch (error) {
    console.error('Failed to import bundle:', error);
    return { 
      ok: false, 
      errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}
