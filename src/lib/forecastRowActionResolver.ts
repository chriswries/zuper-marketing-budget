/**
 * Central resolver for cancel_request and delete_line_item SpendRequests.
 * This runs when these request types reach approved/rejected status,
 * applying side effects to forecast storage even when Forecast page is closed.
 */

import { SpendRequest, RequestStatus } from '@/types/requests';
import { CostCenter, LineItem } from '@/types/budget';
import { loadForecastForFY, saveForecastForFY } from '@/lib/forecastStore';
import { appendApprovalAudit } from '@/lib/approvalAuditStore';

const LEGACY_FORECAST_KEY = 'forecast_cost_centers_v1';

function loadLegacyForecast(): CostCenter[] | null {
  try {
    const stored = localStorage.getItem(LEGACY_FORECAST_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore
  }
  return null;
}

function saveLegacyForecast(costCenters: CostCenter[]): void {
  try {
    localStorage.setItem(LEGACY_FORECAST_KEY, JSON.stringify(costCenters));
  } catch {
    // Ignore
  }
}

/**
 * Load forecast data for the given request's origin.
 */
function loadForecastForRequest(request: SpendRequest): CostCenter[] | null {
  if (request.originFiscalYearId) {
    return loadForecastForFY(request.originFiscalYearId);
  }
  // Legacy mode (null FY ID)
  return loadLegacyForecast();
}

/**
 * Save forecast data for the given request's origin.
 */
function saveForecastForRequest(request: SpendRequest, costCenters: CostCenter[]): void {
  if (request.originFiscalYearId) {
    saveForecastForFY(request.originFiscalYearId, costCenters);
  } else {
    saveLegacyForecast(costCenters);
  }
}

/**
 * Find a line item in forecast data.
 */
function findLineItem(
  costCenters: CostCenter[],
  costCenterId: string,
  lineItemId: string
): { cc: CostCenter; item: LineItem; ccIndex: number; itemIndex: number } | null {
  for (let ccIndex = 0; ccIndex < costCenters.length; ccIndex++) {
    const cc = costCenters[ccIndex];
    if (cc.id !== costCenterId) continue;
    for (let itemIndex = 0; itemIndex < cc.lineItems.length; itemIndex++) {
      const item = cc.lineItems[itemIndex];
      if (item.id === lineItemId) {
        return { cc, item, ccIndex, itemIndex };
      }
    }
  }
  return null;
}

/**
 * Result of resolution attempt
 */
export interface ResolutionResult {
  resolved: boolean;
  action?: 'removed' | 'reverted' | 'cleared_flags';
  error?: string;
}

/**
 * Resolve a cancel_request when APPROVED.
 * - Marks target request as cancelled
 * - Removes new pending line items OR reverts pending adjustments
 */
export function resolveCancelRequestApproved(
  cancelRequest: SpendRequest,
  updateTargetRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => void
): ResolutionResult {
  const { targetRequestId, originCostCenterId, originLineItemId } = cancelRequest;

  // 1. Cancel the target request if specified
  if (targetRequestId) {
    updateTargetRequest(targetRequestId, (r) => ({
      ...r,
      status: 'cancelled' as RequestStatus,
      approvalSteps: r.approvalSteps.map((step) =>
        step.status === 'pending'
          ? { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() }
          : step
      ),
    }));

    // Log audit event on target request
    appendApprovalAudit('request', targetRequestId, {
      action: 'rejected_step',
      actorRole: 'admin', // System action
      meta: { cancelledBy: cancelRequest.id, reason: 'cancel_request approved' },
    });
  }

  // 2. Apply side effects to forecast line item
  if (!originCostCenterId || !originLineItemId) {
    return { resolved: true, action: 'cleared_flags' };
  }

  const costCenters = loadForecastForRequest(cancelRequest);
  if (!costCenters) {
    return { resolved: false, error: 'Forecast data not found' };
  }

  const found = findLineItem(costCenters, originCostCenterId, originLineItemId);
  if (!found) {
    // Line item already removed - that's fine
    return { resolved: true, action: 'removed' };
  }

  const { item, ccIndex, itemIndex } = found;

  // Check what state the line item is in
  if (item.approvalStatus === 'pending') {
    // NEW line item awaiting approval -> remove it
    costCenters[ccIndex].lineItems.splice(itemIndex, 1);
    saveForecastForRequest(cancelRequest, costCenters);
    return { resolved: true, action: 'removed' };
  }

  if (item.adjustmentStatus === 'pending' && item.adjustmentBeforeValues) {
    // Adjustment pending -> revert to before values
    const updatedItem: LineItem = {
      ...item,
      forecastValues: item.adjustmentBeforeValues,
      adjustmentStatus: undefined,
      adjustmentRequestId: undefined,
      adjustmentBeforeValues: undefined,
      adjustmentSheet: undefined,
      cancellationStatus: undefined,
      cancellationRequestId: undefined,
    };
    costCenters[ccIndex].lineItems[itemIndex] = updatedItem;
    saveForecastForRequest(cancelRequest, costCenters);
    return { resolved: true, action: 'reverted' };
  }

  // Clear cancellation flags if still present
  if (item.cancellationStatus || item.cancellationRequestId) {
    const updatedItem: LineItem = {
      ...item,
      cancellationStatus: undefined,
      cancellationRequestId: undefined,
    };
    costCenters[ccIndex].lineItems[itemIndex] = updatedItem;
    saveForecastForRequest(cancelRequest, costCenters);
  }

  return { resolved: true, action: 'cleared_flags' };
}

/**
 * Resolve a cancel_request when REJECTED or CANCELLED.
 * - Clear cancellation flags on line item
 * - Restore the target request from snapshot if available
 */
export function resolveCancelRequestRejected(
  cancelRequest: SpendRequest,
  updateTargetRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => void
): ResolutionResult {
  const { originCostCenterId, originLineItemId, targetRequestId, targetRequestSnapshot } = cancelRequest;

  // Restore the target request if we have snapshot
  if (targetRequestId && targetRequestSnapshot) {
    updateTargetRequest(targetRequestId, (r) => ({
      ...r,
      status: targetRequestSnapshot.status,
      approvalSteps: targetRequestSnapshot.approvalSteps,
    }));
    
    // Log audit event
    appendApprovalAudit('request', targetRequestId, {
      action: 'approved_step', // Using existing action type
      actorRole: 'admin', // System action
      meta: { restoredBy: cancelRequest.id, reason: 'cancel_request was rejected/cancelled' },
    });
  } else if (targetRequestId) {
    // No snapshot - restore to pending with default steps
    updateTargetRequest(targetRequestId, (r) => ({
      ...r,
      status: 'pending' as const,
      approvalSteps: r.approvalSteps.map((step) => ({
        ...step,
        status: 'pending' as const,
        updatedAt: undefined,
      })),
    }));
  }

  if (!originCostCenterId || !originLineItemId) {
    return { resolved: true };
  }

  const costCenters = loadForecastForRequest(cancelRequest);
  if (!costCenters) {
    return { resolved: false, error: 'Forecast data not found' };
  }

  const found = findLineItem(costCenters, originCostCenterId, originLineItemId);
  if (!found) {
    return { resolved: true };
  }

  const { item, ccIndex, itemIndex } = found;

  // Clear cancellation flags
  if (item.cancellationStatus || item.cancellationRequestId) {
    const updatedItem: LineItem = {
      ...item,
      cancellationStatus: undefined,
      cancellationRequestId: undefined,
    };
    costCenters[ccIndex].lineItems[itemIndex] = updatedItem;
    saveForecastForRequest(cancelRequest, costCenters);
  }

  return { resolved: true };
}

/**
 * Resolve a delete_line_item request when APPROVED.
 * - Remove the line item from forecast
 */
export function resolveDeleteLineItemApproved(deleteRequest: SpendRequest): ResolutionResult {
  const { originCostCenterId, originLineItemId } = deleteRequest;

  if (!originCostCenterId || !originLineItemId) {
    return { resolved: true };
  }

  const costCenters = loadForecastForRequest(deleteRequest);
  if (!costCenters) {
    return { resolved: false, error: 'Forecast data not found' };
  }

  const found = findLineItem(costCenters, originCostCenterId, originLineItemId);
  if (!found) {
    // Already removed - that's fine
    return { resolved: true, action: 'removed' };
  }

  const { ccIndex, itemIndex } = found;

  // Remove the line item
  costCenters[ccIndex].lineItems.splice(itemIndex, 1);
  saveForecastForRequest(deleteRequest, costCenters);

  return { resolved: true, action: 'removed' };
}

/**
 * Resolve a delete_line_item request when REJECTED.
 * - Clear deletion flags, line item remains
 */
export function resolveDeleteLineItemRejected(deleteRequest: SpendRequest): ResolutionResult {
  const { originCostCenterId, originLineItemId } = deleteRequest;

  if (!originCostCenterId || !originLineItemId) {
    return { resolved: true };
  }

  const costCenters = loadForecastForRequest(deleteRequest);
  if (!costCenters) {
    return { resolved: false, error: 'Forecast data not found' };
  }

  const found = findLineItem(costCenters, originCostCenterId, originLineItemId);
  if (!found) {
    return { resolved: true };
  }

  const { item, ccIndex, itemIndex } = found;

  // Clear deletion flags
  if (item.deletionStatus || item.deletionRequestId) {
    const updatedItem: LineItem = {
      ...item,
      deletionStatus: undefined,
      deletionRequestId: undefined,
    };
    costCenters[ccIndex].lineItems[itemIndex] = updatedItem;
    saveForecastForRequest(deleteRequest, costCenters);
  }

  return { resolved: true };
}

/**
 * Main resolver - call this when a request's status changes.
 * Returns true if it handled resolution for this request type.
 */
export function resolveForecastRowActionRequest(
  request: SpendRequest,
  previousStatus: RequestStatus,
  updateRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => void
): boolean {
  // Only handle these specific kinds
  if (request.originKind !== 'cancel_request' && request.originKind !== 'delete_line_item') {
    return false;
  }

  // Only resolve on status transition to approved, rejected, or cancelled
  const finalStatuses: RequestStatus[] = ['approved', 'rejected', 'cancelled'];
  if (previousStatus === request.status) return false;
  if (!finalStatuses.includes(request.status)) return false;

  const isApproved = request.status === 'approved';
  const isRejected = request.status === 'rejected' || request.status === 'cancelled';

  if (request.originKind === 'cancel_request') {
    if (isApproved) {
      resolveCancelRequestApproved(request, updateRequest);
      return true;
    }
    if (isRejected) {
      resolveCancelRequestRejected(request, updateRequest);
      return true;
    }
  }

  if (request.originKind === 'delete_line_item') {
    if (isApproved) {
      resolveDeleteLineItemApproved(request);
      return true;
    }
    if (isRejected) {
      resolveDeleteLineItemRejected(request);
      return true;
    }
  }

  return false;
}
