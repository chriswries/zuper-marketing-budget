/**
 * Import Fiscal Year Bundle (FY-3).
 * Supports restore (no conflicts), overwrite (admin override required), and clone (remaps IDs) modes.
 */

import type { FiscalYearBundleV1, ActualsMatchingBundle } from '@/types/fyBundle';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import type { SpendRequest } from '@/types/requests';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import type { ApprovalActorRole, ApprovalAuditEvent } from '@/types/approvalAudit';
import { validateFiscalYearBundle } from '@/lib/fyBundle';
import { hardDeleteFiscalYear } from '@/lib/fyLifecycle';
import { saveForecastForFY, clearForecastForFY } from '@/lib/forecastStore';
import { replaceActuals } from '@/lib/actualsStore';
import { replaceActualsMatchingForFY } from '@/lib/actualsMatchingStore';
import { deleteActualsRollupForFY } from '@/lib/actualsRollupStore';
import { replaceApprovalAuditForEntity, appendApprovalAudit } from '@/lib/approvalAuditStore';
import type { CostCenter, LineItem } from '@/types/budget';

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

export type ImportMode = 'restore' | 'overwrite' | 'clone';

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
 * Map UserRole to ApprovalActorRole for audit logging.
 */
function toAuditActorRole(role: UserRole): ApprovalActorRole {
  // UserRole and ApprovalActorRole have the same values
  const validRoles: ApprovalActorRole[] = ['admin', 'manager', 'cmo', 'finance'];
  if (validRoles.includes(role as ApprovalActorRole)) {
    return role as ApprovalActorRole;
  }
  // Fallback (should not happen)
  return 'admin';
}

/**
 * Generate a new unique ID.
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Clone a fiscal year bundle with remapped IDs to avoid conflicts.
 * Creates new IDs for: FY, cost centers, line items, requests.
 */
export function cloneFiscalYearBundleV1(bundle: FiscalYearBundleV1): FiscalYearBundleV1 {
  const originalFyId = bundle.fiscalYearId;
  const newFiscalYearId = generateId();
  
  // Build ID mapping tables
  const costCenterIdMap = new Map<string, string>();
  const lineItemIdMap = new Map<string, string>();
  const requestIdMap = new Map<string, string>();
  
  // Map cost center and line item IDs
  for (const cc of bundle.fiscalYear.costCenters) {
    const newCcId = generateId();
    costCenterIdMap.set(cc.id, newCcId);
    for (const li of cc.lineItems) {
      lineItemIdMap.set(li.id, generateId());
    }
  }
  
  // Map request IDs
  for (const req of bundle.requests) {
    requestIdMap.set(req.id, generateId());
  }
  
  // Helper to remap ID or return original if not in map
  const remapCcId = (id: string | undefined): string | undefined => {
    if (!id) return id;
    return costCenterIdMap.get(id) ?? id;
  };
  
  const remapLiId = (id: string | undefined): string | undefined => {
    if (!id) return id;
    return lineItemIdMap.get(id) ?? id;
  };
  
  const remapRequestId = (id: string): string => {
    return requestIdMap.get(id) ?? id;
  };
  
  // Clone cost centers with new IDs
  const clonedCostCenters: CostCenter[] = bundle.fiscalYear.costCenters.map(cc => {
    const newCcId = costCenterIdMap.get(cc.id)!;
    const clonedLineItems: LineItem[] = cc.lineItems.map(li => ({
      ...li,
      id: lineItemIdMap.get(li.id)!,
    }));
    return {
      ...cc,
      id: newCcId,
      lineItems: clonedLineItems,
    };
  });
  
  // Clone fiscal year
  const clonedFiscalYear: FiscalYearBudget = {
    ...bundle.fiscalYear,
    id: newFiscalYearId,
    name: `${bundle.fiscalYear.name} (Imported Clone)`,
    costCenters: clonedCostCenters,
  };
  
  // Clone forecast if present
  let clonedForecast: CostCenter[] | null = null;
  if (bundle.forecast) {
    clonedForecast = bundle.forecast.map(cc => {
      const newCcId = costCenterIdMap.get(cc.id) ?? cc.id;
      const clonedLineItems: LineItem[] = cc.lineItems.map(li => ({
        ...li,
        id: lineItemIdMap.get(li.id) ?? li.id,
      }));
      return {
        ...cc,
        id: newCcId,
        lineItems: clonedLineItems,
      };
    });
  }
  
  // Clone actuals matching with remapped IDs
  const clonedMatching: ActualsMatchingBundle = {
    matchesByTxnId: {},
    rulesByMerchantKey: {},
  };
  
  for (const [txnId, match] of Object.entries(bundle.actualsMatching.matchesByTxnId)) {
    clonedMatching.matchesByTxnId[txnId] = {
      ...match,
      costCenterId: remapCcId(match.costCenterId) ?? match.costCenterId,
      lineItemId: remapLiId(match.lineItemId),
    };
  }
  
  for (const [key, rule] of Object.entries(bundle.actualsMatching.rulesByMerchantKey)) {
    clonedMatching.rulesByMerchantKey[key] = {
      ...rule,
      costCenterId: remapCcId(rule.costCenterId) ?? rule.costCenterId,
      lineItemId: remapLiId(rule.lineItemId),
    };
  }
  
  // Clone requests with remapped IDs
  const clonedRequests: SpendRequest[] = bundle.requests.map(req => {
    const cloned: SpendRequest = {
      ...req,
      id: remapRequestId(req.id),
    };
    
    // Remap any cost center/line item references in the request
    if ('costCenterId' in cloned && typeof (cloned as any).costCenterId === 'string') {
      (cloned as any).costCenterId = remapCcId((cloned as any).costCenterId);
    }
    if ('originCostCenterId' in cloned && typeof (cloned as any).originCostCenterId === 'string') {
      (cloned as any).originCostCenterId = remapCcId((cloned as any).originCostCenterId);
    }
    if ('lineItemId' in cloned && typeof (cloned as any).lineItemId === 'string') {
      (cloned as any).lineItemId = remapLiId((cloned as any).lineItemId);
    }
    if ('originLineItemId' in cloned && typeof (cloned as any).originLineItemId === 'string') {
      (cloned as any).originLineItemId = remapLiId((cloned as any).originLineItemId);
    }
    if ('targetLineItemId' in cloned && typeof (cloned as any).targetLineItemId === 'string') {
      (cloned as any).targetLineItemId = remapLiId((cloned as any).targetLineItemId);
    }
    
    return cloned;
  });
  
  // Clone approval audit events with remapped request IDs
  const clonedAuditByRequestId: Record<string, ApprovalAuditEvent[]> = {};
  for (const [oldRequestId, events] of Object.entries(bundle.approvalAuditEventsByRequestId)) {
    const newRequestId = remapRequestId(oldRequestId);
    clonedAuditByRequestId[newRequestId] = events.map(evt => {
      const clonedEvt: ApprovalAuditEvent = {
        ...evt,
        entityId: newRequestId,
      };
      // Update meta if it contains IDs
      if (evt.meta) {
        const newMeta = { ...evt.meta };
        if (typeof newMeta.requestId === 'string') {
          newMeta.requestId = remapRequestId(newMeta.requestId as string);
        }
        if (typeof newMeta.costCenterId === 'string') {
          newMeta.costCenterId = remapCcId(newMeta.costCenterId as string);
        }
        if (typeof newMeta.lineItemId === 'string') {
          newMeta.lineItemId = remapLiId(newMeta.lineItemId as string);
        }
        clonedEvt.meta = newMeta;
      }
      return clonedEvt;
    });
  }
  
  // Notes
  const clonedNotes = [...(bundle.notes ?? [])];
  clonedNotes.push(`Imported as clone with remapped IDs. Original FY ID: ${originalFyId}, New FY ID: ${newFiscalYearId}`);
  
  return {
    schemaVersion: bundle.schemaVersion,
    exportedAt: bundle.exportedAt,
    exportedByRole: bundle.exportedByRole,
    fiscalYearId: newFiscalYearId,
    fiscalYearName: `${bundle.fiscalYearName} (Imported Clone)`,
    fiscalYear: clonedFiscalYear,
    forecast: clonedForecast,
    actualsTransactions: bundle.actualsTransactions, // Transaction IDs don't need remapping (stored per-FY)
    actualsMatching: clonedMatching,
    requests: clonedRequests,
    approvalAuditEventsByRequestId: clonedAuditByRequestId,
    fyAuditEvents: bundle.fyAuditEvents, // Will be stored under new FY ID
    notes: clonedNotes,
  };
}

/**
 * Import a FiscalYearBundleV1 into the app.
 * - Restore mode: only if no conflicts
 * - Overwrite mode: requires admin + override, FY must exist, no request ID conflicts
 * - Clone mode: always allowed, remaps IDs to avoid conflicts
 */
export function importFiscalYearBundleV1(args: ImportBundleArgs): ImportResult {
  const {
    bundle: originalBundle,
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
  const validation = validateFiscalYearBundle(originalBundle);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // 2. For clone mode, create cloned bundle with new IDs
  const bundle = mode === 'clone' ? cloneFiscalYearBundleV1(originalBundle) : originalBundle;

  // 3. Detect conflicts (after potential cloning)
  const conflicts = detectBundleConflicts(bundle, existingFiscalYears, existingRequests);

  // 4. Mode-specific checks
  if (mode === 'restore') {
    // Restore mode: fail if FY exists or request conflicts
    if (conflicts.fyIdExists) {
      return { 
        ok: false, 
        errors: [`Fiscal year "${bundle.fiscalYearName}" (ID: ${bundle.fiscalYearId}) already exists. Use Overwrite or Clone mode.`] 
      };
    }
    if (conflicts.requestIdConflicts.length > 0) {
      return { 
        ok: false, 
        errors: [`Request ID conflicts: ${conflicts.requestIdConflicts.join(', ')}. Use Clone mode to import with new IDs.`] 
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
      return { ok: false, errors: ['Fiscal year does not exist. Use Restore or Clone mode for new imports.'] };
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
  // Clone mode: no additional checks needed - IDs are already remapped

  const fyId = bundle.fiscalYearId;

  // 5. Perform import writes
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

    // 6. Append import audit event with correct actor role
    appendApprovalAudit('request', fyId, {
      action: 'fy_bundle_imported',
      actorRole: toAuditActorRole(currentRole),
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
