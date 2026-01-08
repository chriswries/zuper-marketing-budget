/**
 * Build and validate Fiscal Year Bundle for export.
 */

import type { FiscalYearBundleV1, BundleValidationResult, ActualsMatchingBundle } from '@/types/fyBundle';
import type { SpendRequest } from '@/types/requests';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadActualsAsync } from '@/lib/actualsStore';
import { loadActualsMatchingAsync } from '@/lib/actualsMatchingStore';
import { loadForecastForFYAsync } from '@/lib/forecastStore';
import { loadApprovalAudit } from '@/lib/approvalAuditStore';

interface BuildBundleArgs {
  fiscalYear: FiscalYearBudget;
  currentRole: UserRole;
  requests: SpendRequest[];
}

/**
 * Build a complete FY bundle for export.
 * Uses async DB loaders to ensure data is fully loaded regardless of cache state.
 */
export async function buildFiscalYearBundleV1(args: BuildBundleArgs): Promise<FiscalYearBundleV1> {
  const { fiscalYear, currentRole, requests } = args;
  const fiscalYearId = fiscalYear.id;

  // Load forecast for this FY (may be null) - ASYNC to ensure data is loaded from DB
  const forecast = await loadForecastForFYAsync(fiscalYearId);

  // Load actuals transactions - ASYNC to ensure data is loaded from DB
  const actualsTransactions = await loadActualsAsync(fiscalYearId);

  // Load actuals matching data - ASYNC to ensure data is loaded from DB
  const actualsMatchingRaw = await loadActualsMatchingAsync(fiscalYearId);
  const actualsMatching: ActualsMatchingBundle = {
    matchesByTxnId: actualsMatchingRaw.matchesByTxnId,
    rulesByMerchantKey: actualsMatchingRaw.rulesByMerchantKey,
  };

  // Get all cost center IDs from this FY
  const fyCostCenterIds = new Set(fiscalYear.costCenters.map(cc => cc.id));

  // Filter requests that belong to this FY
  const fyRequests = requests.filter(req => {
    // Primary check: originFiscalYearId matches
    if (req.originFiscalYearId === fiscalYearId) {
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

  // Load audit events for each included request
  const approvalAuditEventsByRequestId: Record<string, Awaited<ReturnType<typeof loadApprovalAudit>>> = {};
  for (const req of fyRequests) {
    const events = await loadApprovalAudit('request', req.id);
    if (events.length > 0) {
      approvalAuditEventsByRequestId[req.id] = events;
    }
  }

  // Check if there are FY-level audit events (keyed by FY id)
  const fyAuditEventsRaw = await loadApprovalAudit('request', fiscalYearId);
  const fyAuditEvents = fyAuditEventsRaw.length > 0 ? fyAuditEventsRaw : undefined;

  const bundle: FiscalYearBundleV1 = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedByRole: currentRole,
    fiscalYearId,
    fiscalYearName: fiscalYear.name,
    fiscalYear,
    forecast,
    actualsTransactions,
    actualsMatching,
    requests: fyRequests,
    approvalAuditEventsByRequestId,
    fyAuditEvents,
  };

  return bundle;
}

/**
 * Validate a FY bundle structure.
 */
export function validateFiscalYearBundle(bundle: unknown): BundleValidationResult {
  const errors: string[] = [];

  if (!bundle || typeof bundle !== 'object') {
    errors.push('Bundle is not an object');
    return { ok: false, errors };
  }

  const b = bundle as Record<string, unknown>;

  // Check schema version
  if (b.schemaVersion !== 1) {
    errors.push(`Invalid schemaVersion: expected 1, got ${b.schemaVersion}`);
  }

  // Check required string fields
  const requiredStrings = ['exportedAt', 'exportedByRole', 'fiscalYearId', 'fiscalYearName'];
  for (const field of requiredStrings) {
    if (typeof b[field] !== 'string' || !b[field]) {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }

  // Check fiscalYear object
  if (!b.fiscalYear || typeof b.fiscalYear !== 'object') {
    errors.push('Missing or invalid fiscalYear object');
  } else {
    const fy = b.fiscalYear as Record<string, unknown>;
    if (!fy.id) errors.push('fiscalYear.id is missing');
    if (!Array.isArray(fy.costCenters)) {
      errors.push('fiscalYear.costCenters is not an array');
    } else {
      // Validate each cost center has lineItems array
      for (let i = 0; i < fy.costCenters.length; i++) {
        const cc = fy.costCenters[i] as Record<string, unknown>;
        if (!cc.id) errors.push(`fiscalYear.costCenters[${i}].id is missing`);
        if (!Array.isArray(cc.lineItems)) {
          errors.push(`fiscalYear.costCenters[${i}].lineItems is not an array`);
        }
      }
    }
  }

  // Check forecast (can be null or array)
  if (b.forecast !== null && !Array.isArray(b.forecast)) {
    errors.push('forecast must be null or an array of CostCenters');
  }

  // Check actualsTransactions is an array
  if (!Array.isArray(b.actualsTransactions)) {
    errors.push('actualsTransactions must be an array');
  }

  // Check actualsMatching
  if (!b.actualsMatching || typeof b.actualsMatching !== 'object') {
    errors.push('Missing or invalid actualsMatching object');
  } else {
    const am = b.actualsMatching as Record<string, unknown>;
    if (typeof am.matchesByTxnId !== 'object') {
      errors.push('actualsMatching.matchesByTxnId is not an object');
    }
    if (typeof am.rulesByMerchantKey !== 'object') {
      errors.push('actualsMatching.rulesByMerchantKey is not an object');
    }
  }

  // Check requests is an array with unique IDs
  if (!Array.isArray(b.requests)) {
    errors.push('requests must be an array');
  } else {
    const seenIds = new Set<string>();
    for (const req of b.requests) {
      if (req && typeof req === 'object') {
        const r = req as { id?: string };
        if (r.id) {
          if (seenIds.has(r.id)) {
            errors.push(`Duplicate request id: ${r.id}`);
          }
          seenIds.add(r.id);
        }
      }
    }
  }

  // Check approvalAuditEventsByRequestId is an object
  if (typeof b.approvalAuditEventsByRequestId !== 'object') {
    errors.push('approvalAuditEventsByRequestId must be an object');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
