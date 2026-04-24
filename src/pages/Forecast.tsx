import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable, CellChangeArgs, RowActionArgs, EditTagsArgs, EditLineItemNameArgs } from '@/components/sheet/SheetTable';
import { AddLineItemDialog } from '@/components/sheet/AddLineItemDialog';
import { EditTagsDialog, EditTagsData, TagValues } from '@/components/sheet/EditTagsDialog';
import { EditLineItemDialog, EditLineItemData } from '@/components/sheet/EditLineItemDialog';
import { AdjustmentJustificationDialog, AdjustmentJustificationData } from '@/components/sheet/AdjustmentJustificationDialog';
import { RowActionDialog, RowActionData } from '@/components/sheet/RowActionDialog';
import { AdminOverrideDialog } from '@/components/AdminOverrideDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CostCenter, LineItem, Month, MONTHS, MONTH_LABELS, calculateFYTotal, MonthlyValues } from '@/types/budget';
import { AuditEntry } from '@/types/audit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Lock, History, Plus, ShieldAlert } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { createDefaultApprovalSteps, createCMOApprovalSteps, OriginKind } from '@/types/requests';
import { loadForecastForFY, loadForecastForFYAsync, saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { shouldTriggerIncreaseApproval, getIncreaseApprovalThreshold } from '@/lib/lineItemApprovalThreshold';
import { findDuplicateLineItemName } from '@/lib/lineItemNameValidation';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { formatAuditTimestamp } from '@/lib/dateTime';
import { appendApprovalAudit } from '@/lib/approvalAuditStore';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/format';
import { BulkLineItemApprovalsDrawer } from '@/components/approvals/BulkLineItemApprovalsDrawer';
import { requestNeedsApprovalByRole } from '@/lib/requestApproval';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';

// Legacy localStorage key - only used for cleanup
const LEGACY_FORECAST_STORAGE_KEY = 'forecast_cost_centers_v1';

// Clean up any legacy localStorage artifacts (one-time on mount)
function cleanupLegacyForecastStorage(): void {
  try {
    localStorage.removeItem(LEGACY_FORECAST_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// Re-export CellChangeArgs for local use with narrowed type
type ForecastCellChangeArgs = CellChangeArgs;

// formatTimestamp is now handled by formatAuditTimestamp from dateTime.ts

export default function Forecast() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { requests, addRequest, updateRequest } = useRequests();
  const { selectedFiscalYear, selectedFiscalYearId } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();
  const { currentRole } = useCurrentUserRole();
  const { user } = useAuth();
  const userId = user?.id;
  
  // Finance role is read-only for sheet editing
  const isFinance = currentRole === 'finance';
  const isEditable = !isFinance;

  // Admin override mode
  const isAdminOverride = currentRole === 'admin' && adminSettings.adminOverrideEnabled;
  
  // Read query params for focus and mode override
  const focusCostCenterId = searchParams.get('focusCostCenterId') ?? undefined;
  const focusLineItemId = searchParams.get('focusLineItemId') ?? undefined;
  // Check if we have an active FY
  const isActiveFY = selectedFiscalYear?.status === 'active';
  const fyId = selectedFiscalYearId;

  // Clean up legacy localStorage artifacts on mount
  useEffect(() => {
    cleanupLegacyForecastStorage();
  }, []);

  // Track whether the initial authoritative load is complete.
  // Prevents the persist effect from writing stale cache data back to the DB.
  const initialLoadDoneRef = useRef(false);

  // Track which forecast adjustment requests we've already processed (reverted on reject)
  // Prevents double-revert when the sync effect re-runs.
  const processedAdjustmentRequestsRef = useRef<Set<string>>(new Set());

  // Initialize cost centers - empty array until active FY loads via effect
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const [lockedMonths, setLockedMonths] = useState<Set<Month>>(() => new Set());
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [approvalsDrawerOpen, setApprovalsDrawerOpen] = useState(false);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);

  // Justification dialog state
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] = useState<AdjustmentJustificationData | null>(null);
  const [pendingUpdatedValues, setPendingUpdatedValues] = useState<MonthlyValues | null>(null);
  const [pendingOldValues, setPendingOldValues] = useState<MonthlyValues | null>(null);

  // Row action dialog state
  const [rowActionDialogOpen, setRowActionDialogOpen] = useState(false);
  const [pendingRowAction, setPendingRowAction] = useState<RowActionData | null>(null);

  // Admin override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<{
    type: 'cell_edit' | 'delete_line_item';
    costCenterId: string;
    lineItemId: string;
    month?: Month;
    oldValue?: number;
    newValue?: number;
    updatedValues?: MonthlyValues;
  } | null>(null);

  // Edit tags dialog state
  const [editTagsOpen, setEditTagsOpen] = useState(false);
  const [editTagsData, setEditTagsData] = useState<EditTagsData | null>(null);

  // Edit line item dialog state (admin only)
  const [editLineItemOpen, setEditLineItemOpen] = useState(false);
  const [editLineItemData, setEditLineItemData] = useState<EditLineItemData | null>(null);

  const handleFocusLineItemNotFound = useCallback(() => {
    toast({
      title: 'Line item not found',
      description: 'This line item no longer exists (may have been rejected or deleted).',
      variant: 'destructive',
    });
    // Clear the focus params
    setSearchParams({});
  }, [setSearchParams]);

  // Reload cost centers when FY changes
  useEffect(() => {
    if (isActiveFY && fyId) {
      initialLoadDoneRef.current = false; // Reset on FY change

      // Try cache first for instant display
      const cached = loadForecastForFY(fyId);
      if (cached) {
        setCostCenters(cached);
        initialLoadDoneRef.current = true;
        return;
      }
      // Cache miss — load from database
      loadForecastForFYAsync(fyId).then(async (forecast) => {
        if (forecast) {
          setCostCenters(forecast);
        } else if (selectedFiscalYear) {
          // Only initialize from budget if truly no forecast exists in DB
          const newForecast = await createForecastCostCentersFromBudget(selectedFiscalYear);
          setCostCenters(newForecast);
        }
        initialLoadDoneRef.current = true;
      });
    } else {
      setCostCenters([]);
      initialLoadDoneRef.current = false;
    }
  }, [isActiveFY, fyId, selectedFiscalYear]);

  // Persist costCenters to storage only when we have an active FY
  // Guarded by initialLoadDoneRef to prevent stale cache from overwriting DB
  useEffect(() => {
    if (isActiveFY && fyId && costCenters.length > 0 && initialLoadDoneRef.current) {
      saveForecastForFY(fyId, costCenters).catch((err) => {
        toast({
          title: 'Failed to save forecast',
          description: err instanceof Error ? err.message : 'An unknown error occurred. Please refresh and try again.',
          variant: 'destructive',
        });
      });
    }
  }, [costCenters, isActiveFY, fyId]);

  // Sync line item approval/adjustment status with request status
  // Also reload from storage since the resolver modifies storage directly
  useEffect(() => {
    // Skip if no active FY
    if (!isActiveFY || !fyId) return;
    
    // Reload from storage to pick up any resolution changes
    const freshData = loadForecastForFY(fyId);
    
    // Use fresh data if available, otherwise continue with current state
    const baseData = freshData ?? costCenters;
    
    // Now apply local sync logic on top of the fresh data
    let changed = false;
    const updated = baseData.map((cc) => {
      const updatedItems: LineItem[] = [];
      
      for (const item of cc.lineItems) {
        // Handle NEW line item approval (approvalRequestId)
        if (item.approvalRequestId) {
          const linkedRequest = requests.find((r) => r.id === item.approvalRequestId);
          if (linkedRequest) {
            const isRejected = 
              linkedRequest.status === 'rejected' ||
              linkedRequest.status === 'cancelled' ||
              linkedRequest.approvalSteps?.some((step) => step.status === 'rejected');

            if (isRejected) {
              changed = true;
              // Remove the line item for rejected NEW items
              continue;
            }

            const isApproved = 
              linkedRequest.status === 'approved' ||
              (linkedRequest.approvalSteps?.length > 0 && 
               linkedRequest.approvalSteps.every((step) => step.status === 'approved'));

            if (isApproved && item.approvalStatus === 'pending') {
              changed = true;
              updatedItems.push({ ...item, approvalStatus: undefined });
              continue;
            }
          }
        }

        // Handle DELETION approval (deletionRequestId)
        if (item.deletionRequestId) {
          const linkedRequest = requests.find((r) => r.id === item.deletionRequestId);
          if (linkedRequest) {
            const isApproved =
              linkedRequest.status === 'approved' ||
              (linkedRequest.approvalSteps?.length > 0 &&
               linkedRequest.approvalSteps.every((step) => step.status === 'approved'));

            if (isApproved) {
              changed = true;
              continue; // Skip adding to updatedItems — line item is deleted
            }

            const isRejected =
              linkedRequest.status === 'rejected' ||
              linkedRequest.status === 'cancelled' ||
              linkedRequest.approvalSteps?.some((step) => step.status === 'rejected');

            if (isRejected) {
              changed = true;
              updatedItems.push({
                ...item,
                deletionStatus: undefined,
                deletionRequestId: undefined,
              });
              continue;
            }
          }
        }

        // Handle ADJUSTMENT approval (adjustmentRequestId)
        if (item.adjustmentRequestId) {
          const linkedRequest = requests.find((r) => r.id === item.adjustmentRequestId);
          if (linkedRequest) {
            const isRejected = 
              linkedRequest.status === 'rejected' ||
              linkedRequest.status === 'cancelled' ||
              linkedRequest.approvalSteps?.some((step) => step.status === 'rejected');

            if (isRejected && item.adjustmentBeforeValues && item.adjustmentSheet === 'forecast') {
              changed = true;
              // Revert values and clear adjustment fields
              updatedItems.push({
                ...item,
                forecastValues: item.adjustmentBeforeValues,
                adjustmentStatus: undefined,
                adjustmentRequestId: undefined,
                adjustmentBeforeValues: undefined,
                adjustmentSheet: undefined,
              });
              continue;
            }

            const isApproved = 
              linkedRequest.status === 'approved' ||
              (linkedRequest.approvalSteps?.length > 0 && 
               linkedRequest.approvalSteps.every((step) => step.status === 'approved'));

            if (isApproved && item.adjustmentStatus === 'pending') {
              changed = true;
              // Keep values, clear adjustment fields
              updatedItems.push({
                ...item,
                adjustmentStatus: undefined,
                adjustmentRequestId: undefined,
                adjustmentBeforeValues: undefined,
                adjustmentSheet: undefined,
              });
              continue;
            }
          }
        }

        updatedItems.push(item);
      }

      if (updatedItems.length !== cc.lineItems.length) {
        return { ...cc, lineItems: updatedItems };
      }

      const hasChangedItem = updatedItems.some((item, idx) => item !== cc.lineItems[idx]);
      if (hasChangedItem) {
        return { ...cc, lineItems: updatedItems };
      }

      return cc;
    });

    // Check if we need to update state
    const needsUpdate = freshData !== null || changed || updated.some((cc, idx) => cc !== baseData[idx]);
    if (needsUpdate) {
      setCostCenters(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  // Derive per-cell pending forecast adjustment requests
  // Map: lineItemId -> Map<Month, requestId>
  // Used to lock individual cells (not entire rows) when a cell has a pending request.
  const pendingCellLocks = useMemo(() => {
    const map = new Map<string, Map<Month, string>>();
    for (const req of requests) {
      if (
        req.status === 'pending' &&
        req.originSheet === 'forecast' &&
        req.originKind === 'adjustment' &&
        req.originLineItemId &&
        req.startMonth &&
        // Only include for current FY (or legacy null FY items)
        (req.originFiscalYearId === fyId || (!req.originFiscalYearId && !isActiveFY))
      ) {
        let cellMap = map.get(req.originLineItemId);
        if (!cellMap) {
          cellMap = new Map();
          map.set(req.originLineItemId, cellMap);
        }
        cellMap.set(req.startMonth as Month, req.id);
      }
    }
    return map;
  }, [requests, fyId, isActiveFY]);

  // Handle revert for per-cell adjustment requests that were rejected/cancelled.
  // Per-cell requests don't store adjustmentBeforeValues on the line item, so we
  // revert by subtracting request.amount from the affected cell. Track processed
  // requests via ref to avoid double-revert on re-runs.
  useEffect(() => {
    if (!isActiveFY || !fyId) return;

    const toRevert: Array<{ lineItemId: string; month: Month; amount: number; requestId: string }> = [];
    for (const req of requests) {
      if (
        req.originSheet !== 'forecast' ||
        req.originKind !== 'adjustment' ||
        !req.originLineItemId ||
        !req.startMonth ||
        typeof req.amount !== 'number'
      ) {
        continue;
      }
      if (processedAdjustmentRequestsRef.current.has(req.id)) continue;

      const isApproved =
        req.status === 'approved' ||
        (req.approvalSteps?.length > 0 && req.approvalSteps.every((s) => s.status === 'approved'));
      const isRejected =
        req.status === 'rejected' ||
        req.status === 'cancelled' ||
        req.approvalSteps?.some((s) => s.status === 'rejected');

      if (isRejected && !isApproved) {
        toRevert.push({
          lineItemId: req.originLineItemId,
          month: req.startMonth as Month,
          amount: req.amount,
          requestId: req.id,
        });
      } else if (isApproved) {
        // Approved: value is already applied, just mark processed.
        processedAdjustmentRequestsRef.current.add(req.id);
      }
    }

    if (toRevert.length === 0) return;

    setCostCenters((prev) =>
      prev.map((cc) => {
        const matching = toRevert.filter((r) =>
          cc.lineItems.some((li) => li.id === r.lineItemId)
        );
        if (matching.length === 0) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.map((item) => {
            const reverts = matching.filter((r) => r.lineItemId === item.id);
            if (reverts.length === 0) return item;
            // Skip legacy items still using row-level adjustmentBeforeValues
            // (handled by the existing sync effect above).
            if (item.adjustmentBeforeValues) return item;
            const newValues = { ...item.forecastValues };
            for (const r of reverts) {
              newValues[r.month] = (newValues[r.month] ?? 0) - r.amount;
              if (newValues[r.month] < 0) newValues[r.month] = 0;
            }
            return { ...item, forecastValues: newValues };
          }),
        };
      })
    );

    for (const r of toRevert) {
      processedAdjustmentRequestsRef.current.add(r.requestId);
    }
  }, [requests, isActiveFY, fyId]);

  const handleCreateLineItem = useCallback((costCenterId: string, lineItem: LineItem) => {
    // Use current costCenters as source of truth for cost center name
    const cc = costCenters.find((c) => c.id === costCenterId);
    const costCenterName = cc?.name ?? 'Unknown Cost Center';

    // Compute request fields from line item
    const fyTotal = calculateFYTotal(lineItem.forecastValues);
    const vendorName = lineItem.vendor?.name ?? '—';
    
    // Find start/end months (first/last month with spend > 0)
    const monthsWithSpend = MONTHS.filter((m) => lineItem.forecastValues[m] > 0);
    const startMonth: Month = monthsWithSpend[0] ?? 'feb';
    const endMonth: Month = monthsWithSpend[monthsWithSpend.length - 1] ?? 'feb';

    // Create the spend request with origin metadata
    const requestId = crypto.randomUUID();
    const newRequest = {
      id: requestId,
      costCenterId,
      costCenterName,
      vendorName,
      amount: fyTotal,
      startMonth,
      endMonth,
      isContracted: lineItem.isContracted,
      justification: `New line item: ${lineItem.name}`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      approvalSteps: createDefaultApprovalSteps(),
      // Origin metadata for deep linking
      originSheet: 'forecast' as const,
      originFiscalYearId: isActiveFY ? selectedFiscalYearId : null,
      originCostCenterId: costCenterId,
      originLineItemId: lineItem.id,
      originKind: 'new_line_item' as const,
      lineItemName: lineItem.name,
      requesterId: userId,
    };
    addRequest(newRequest);

    // Add line item with approval tracking
    const lineItemWithApproval: LineItem = {
      ...lineItem,
      approvalStatus: 'pending',
      approvalRequestId: requestId,
    };

    setCostCenters((prev) =>
      prev.map((c) => {
        if (c.id !== costCenterId) return c;
        return {
          ...c,
          lineItems: [...c.lineItems, lineItemWithApproval],
        };
      })
    );
  }, [addRequest, costCenters, isActiveFY, selectedFiscalYearId]);

  const handleDeleteLineItem = useCallback(({ costCenterId, lineItemId }: { costCenterId: string; lineItemId: string }) => {
    // Admin override: prompt for justification before deleting
    if (isAdminOverride) {
      setPendingOverrideAction({
        type: 'delete_line_item',
        costCenterId,
        lineItemId,
      });
      setOverrideDialogOpen(true);
      return;
    }

    // Find the line item to check if we need to cancel a request
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);

    // If this is a pending line item with a linked request, reject the request
    if (lineItem?.approvalStatus === 'pending' && lineItem.approvalRequestId) {
      updateRequest(lineItem.approvalRequestId, (request) => ({
        ...request,
        status: 'rejected',
        approvalSteps: request.approvalSteps.map((step, idx) => {
          // Find the first pending step and reject it
          if (idx === 0 || request.approvalSteps.slice(0, idx).every((s) => s.status === 'approved')) {
            if (step.status === 'pending') {
              return { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() };
            }
          }
          return step;
        }),
      }));
    }

    setCostCenters((prev) =>
      prev.map((cc) => {
        if (cc.id !== costCenterId) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.filter((item) => item.id !== lineItemId),
        };
      })
    );
  }, [costCenters, updateRequest, isAdminOverride]);

  // Handle edit tags action
  const handleEditTags = useCallback((args: EditTagsArgs) => {
    setEditTagsData({
      costCenterId: args.costCenterId,
      costCenterName: args.costCenterName,
      lineItem: args.lineItem,
    });
    setEditTagsOpen(true);
  }, []);

  // Handle save tags
  const handleSaveTags = useCallback((costCenterId: string, lineItemId: string, tags: TagValues) => {
    setCostCenters((prev) =>
      prev.map((cc) => {
        if (cc.id !== costCenterId) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.map((item) => {
            if (item.id !== lineItemId) return item;
            return {
              ...item,
              isContracted: tags.isContracted,
              isAccrual: tags.isAccrual,
              isSoftwareSubscription: tags.isSoftwareSubscription,
            };
          }),
        };
      })
    );

    toast({
      title: 'Tags updated',
      description: 'Line item tags have been saved.',
    });
  }, []);

  // Handle edit line item (admin only)
  const handleEditLineItemName = useCallback((args: EditLineItemNameArgs) => {
    setEditLineItemData({
      costCenterId: args.costCenterId,
      costCenterName: args.costCenterName,
      lineItem: args.lineItem,
    });
    setEditLineItemOpen(true);
  }, []);

  // Handle save line item (full edit)
  const handleSaveLineItem = useCallback((
    originalCostCenterId: string,
    updatedLineItem: LineItem,
    newCostCenterId?: string
  ) => {
    // Find original line item for audit comparison
    const originalCostCenter = costCenters.find((cc) => cc.id === originalCostCenterId);
    const originalLineItem = originalCostCenter?.lineItems.find((item) => item.id === updatedLineItem.id);
    const targetCostCenterId = newCostCenterId ?? originalCostCenterId;
    const targetCostCenter = costCenters.find((cc) => cc.id === targetCostCenterId);

    setCostCenters((prev) => {
      if (newCostCenterId && newCostCenterId !== originalCostCenterId) {
        // Move line item to a different cost center
        return prev.map((cc) => {
          if (cc.id === originalCostCenterId) {
            return {
              ...cc,
              lineItems: cc.lineItems.filter((item) => item.id !== updatedLineItem.id),
            };
          }
          if (cc.id === newCostCenterId) {
            return {
              ...cc,
              lineItems: [...cc.lineItems, { ...updatedLineItem, costCenterId: newCostCenterId }],
            };
          }
          return cc;
        });
      } else {
        // Update in place
        return prev.map((cc) => {
          if (cc.id !== originalCostCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.map((item) =>
              item.id === updatedLineItem.id ? updatedLineItem : item
            ),
          };
        });
      }
    });

    // Audit log for admin edit (only if we have an active FY)
    if (currentRole === 'admin' && originalLineItem && fyId) {
      const formatCurrencyLocal = (value: number): string =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

      const changes: string[] = [];
      if (originalLineItem.name !== updatedLineItem.name) {
        changes.push(`name: "${originalLineItem.name}" → "${updatedLineItem.name}"`);
      }
      if (originalLineItem.vendor?.name !== updatedLineItem.vendor?.name) {
        changes.push(`vendor: "${originalLineItem.vendor?.name ?? '—'}" → "${updatedLineItem.vendor?.name ?? '—'}"`);
      }
      if (newCostCenterId && newCostCenterId !== originalCostCenterId) {
        changes.push(`cost center: "${originalCostCenter?.name}" → "${targetCostCenter?.name}"`);
      }
      const oldTotal = calculateFYTotal(originalLineItem.forecastValues);
      const newTotal = calculateFYTotal(updatedLineItem.forecastValues);
      if (oldTotal !== newTotal) {
        changes.push(`FY total: ${formatCurrencyLocal(oldTotal)} → ${formatCurrencyLocal(newTotal)}`);
      }
      if (originalLineItem.isContracted !== updatedLineItem.isContracted) {
        changes.push(`contracted: ${originalLineItem.isContracted ? 'Yes' : 'No'} → ${updatedLineItem.isContracted ? 'Yes' : 'No'}`);
      }
      if (originalLineItem.isAccrual !== updatedLineItem.isAccrual) {
        changes.push(`accrual: ${originalLineItem.isAccrual ? 'Yes' : 'No'} → ${updatedLineItem.isAccrual ? 'Yes' : 'No'}`);
      }
      if (originalLineItem.isSoftwareSubscription !== updatedLineItem.isSoftwareSubscription) {
        changes.push(`software subscription: ${originalLineItem.isSoftwareSubscription ? 'Yes' : 'No'} → ${updatedLineItem.isSoftwareSubscription ? 'Yes' : 'No'}`);
      }

      if (changes.length > 0) {
        appendApprovalAudit('budget', fyId, {
          action: 'admin_override_cell_edit',
          actorRole: 'admin',
          note: `Edited line item "${updatedLineItem.name}": ${changes.join('; ')}`,
          meta: {
            lineItemId: updatedLineItem.id,
            costCenterId: targetCostCenterId,
            sheet: 'forecast',
          },
        });
      }
    }

    // Sync pending requests linked to this line item
    const linkedRequestIds = [
      updatedLineItem.approvalRequestId,
      updatedLineItem.adjustmentRequestId,
    ].filter(Boolean) as string[];

    for (const requestId of linkedRequestIds) {
      updateRequest(requestId, (request) => {
        // Only update pending requests
        if (request.status !== 'pending') return request;

        const vendorName = updatedLineItem.vendor?.name ?? '—';
        const fyTotal = calculateFYTotal(updatedLineItem.forecastValues);
        const monthsWithSpend = MONTHS.filter((m) => updatedLineItem.forecastValues[m] > 0);
        const startMonth: Month = monthsWithSpend[0] ?? request.startMonth;
        const endMonth: Month = monthsWithSpend[monthsWithSpend.length - 1] ?? request.endMonth;

        return {
          ...request,
          costCenterId: targetCostCenterId,
          costCenterName: targetCostCenter?.name ?? request.costCenterName,
          vendorName,
          lineItemName: updatedLineItem.name,
          isContracted: updatedLineItem.isContracted,
          // For new_line_item requests, update amount to current FY total
          // For adjustment requests, update revisedAmount
          ...(request.originKind === 'new_line_item' ? { amount: Math.round(fyTotal) } : {}),
          ...(request.originKind === 'adjustment' ? { revisedAmount: Math.round(fyTotal) } : {}),
          startMonth,
          endMonth,
        };
      });
    }

    setEditLineItemOpen(false);
    toast({
      title: 'Line item updated',
      description: `"${updatedLineItem.name}" has been saved.`,
    });
  }, [costCenters, currentRole, fyId, updateRequest]);

  // Row action handler - opens dialog for justification
  const handleRowAction = useCallback(({ costCenterId, lineItem, actionType, targetRequestId }: RowActionArgs) => {
    setPendingRowAction({
      type: actionType,
      costCenterId,
      lineItem,
      targetRequestId,
    });
    setRowActionDialogOpen(true);
  }, []);

  // Handle row action cancel
  const handleRowActionCancel = useCallback(() => {
    setRowActionDialogOpen(false);
    setPendingRowAction(null);
  }, []);

  // Handle row action submit
  const handleRowActionSubmit = useCallback((justification: string) => {
    if (!pendingRowAction) return;

    const { type, costCenterId, lineItem, targetRequestId } = pendingRowAction;
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const costCenterName = costCenter?.name ?? '';

    if (currentRole === 'cmo') {
      // CMO: immediate action
      if (type === 'cancel_request' && targetRequestId) {
        // Cancel the original request
        updateRequest(targetRequestId, (request) => ({
          ...request,
          status: 'cancelled' as const,
        }));
        // Remove or revert the line item
        setCostCenters((prev) =>
          prev.map((cc) => {
            if (cc.id !== costCenterId) return cc;
            if (lineItem.approvalStatus === 'pending') {
              return { ...cc, lineItems: cc.lineItems.filter((item) => item.id !== lineItem.id) };
            }
            if (lineItem.adjustmentStatus === 'pending' && lineItem.adjustmentBeforeValues) {
              return {
                ...cc,
                lineItems: cc.lineItems.map((item) =>
                  item.id === lineItem.id
                    ? { ...item, forecastValues: lineItem.adjustmentBeforeValues!, adjustmentStatus: undefined, adjustmentRequestId: undefined, adjustmentBeforeValues: undefined }
                    : item
                ),
              };
            }
            return cc;
          })
        );
        toast({ title: 'Cancelled', description: 'Request cancelled; manager notified.' });
      } else if (type === 'delete_line_item') {
        // Immediately delete
        setCostCenters((prev) =>
          prev.map((cc) => {
            if (cc.id !== costCenterId) return cc;
            return { ...cc, lineItems: cc.lineItems.filter((item) => item.id !== lineItem.id) };
          })
        );
        toast({ title: 'Deleted', description: 'Line item deleted; manager notified.' });
      }
    } else if (currentRole === 'manager') {
      // Handle withdraw_request action - for pending approval/adjustment/deletion/cancellation
      if (type === 'withdraw_request' && targetRequestId) {
        // Immediately cancel the pending request
        updateRequest(targetRequestId, (request) => ({
          ...request,
          status: 'cancelled' as const,
          approvalSteps: request.approvalSteps.map((step) =>
            step.status === 'pending'
              ? { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() }
              : step
          ),
        }));
        
        // Handle line item side effects based on what was pending
        setCostCenters((prev) =>
          prev.map((cc) => {
            if (cc.id !== costCenterId) return cc;
            
            // If approvalStatus pending (new line item), remove the line item
            if (lineItem.approvalStatus === 'pending') {
              return { ...cc, lineItems: cc.lineItems.filter((item) => item.id !== lineItem.id) };
            }
            
            // If adjustmentStatus pending, revert to before values
            if (lineItem.adjustmentStatus === 'pending' && lineItem.adjustmentBeforeValues) {
              return {
                ...cc,
                lineItems: cc.lineItems.map((item) =>
                  item.id === lineItem.id
                    ? {
                        ...item,
                        forecastValues: lineItem.adjustmentBeforeValues!,
                        adjustmentStatus: undefined,
                        adjustmentRequestId: undefined,
                        adjustmentBeforeValues: undefined,
                      }
                    : item
                ),
              };
            }
            
            // Otherwise clear deletion/cancellation flags only
            return {
              ...cc,
              lineItems: cc.lineItems.map((item) => {
                if (item.id !== lineItem.id) return item;
                return {
                  ...item,
                  deletionStatus: undefined,
                  deletionRequestId: undefined,
                  cancellationStatus: undefined,
                  cancellationRequestId: undefined,
                };
              }),
            };
          })
        );
        
        toast({ title: 'Withdrawn', description: 'Request has been withdrawn.' });
        setRowActionDialogOpen(false);
        setPendingRowAction(null);
        return;
      }
      
      // Safety guard: if cancel_request is called on a pending item, treat as withdraw
      if (type === 'cancel_request' && (lineItem.approvalStatus === 'pending' || lineItem.adjustmentStatus === 'pending') && targetRequestId) {
        // Perform withdraw behavior instead
        updateRequest(targetRequestId, (request) => ({
          ...request,
          status: 'cancelled' as const,
          approvalSteps: request.approvalSteps.map((step) =>
            step.status === 'pending'
              ? { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() }
              : step
          ),
        }));
        
        setCostCenters((prev) =>
          prev.map((cc) => {
            if (cc.id !== costCenterId) return cc;
            if (lineItem.approvalStatus === 'pending') {
              return { ...cc, lineItems: cc.lineItems.filter((item) => item.id !== lineItem.id) };
            }
            if (lineItem.adjustmentStatus === 'pending' && lineItem.adjustmentBeforeValues) {
              return {
                ...cc,
                lineItems: cc.lineItems.map((item) =>
                  item.id === lineItem.id
                    ? {
                        ...item,
                        forecastValues: lineItem.adjustmentBeforeValues!,
                        adjustmentStatus: undefined,
                        adjustmentRequestId: undefined,
                        adjustmentBeforeValues: undefined,
                      }
                    : item
                ),
              };
            }
            return cc;
          })
        );
        
        toast({ title: 'Withdrawn', description: 'Request has been withdrawn.' });
        setRowActionDialogOpen(false);
        setPendingRowAction(null);
        return;
      }
      
      // Manager: create request with CMO+Finance steps
      const requestId = crypto.randomUUID();
      const vendorName = lineItem.vendor?.name ?? '—';
      const fyTotal = calculateFYTotal(lineItem.forecastValues);

      // For cancel_request, snapshot and immediately cancel the target request
      let targetRequestSnapshot: { status: 'pending' | 'approved' | 'rejected' | 'cancelled'; approvalSteps: typeof createCMOApprovalSteps extends () => infer R ? R : never } | undefined;
      if (type === 'cancel_request' && targetRequestId) {
        // Find the target request and snapshot it
        const targetRequest = requests.find((r) => r.id === targetRequestId);
        if (targetRequest) {
          targetRequestSnapshot = {
            status: targetRequest.status,
            approvalSteps: JSON.parse(JSON.stringify(targetRequest.approvalSteps)),
          };
          // Immediately cancel the target request (removes from Pending queue)
          updateRequest(targetRequestId, (request) => ({
            ...request,
            status: 'cancelled' as const,
            approvalSteps: request.approvalSteps.map((step) =>
              step.status === 'pending'
                ? { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() }
                : step
            ),
          }));
        }
      }

      addRequest({
        id: requestId,
        costCenterId,
        costCenterName,
        vendorName,
        amount: fyTotal,
        startMonth: 'feb',
        endMonth: 'jan',
        isContracted: lineItem.isContracted,
        justification: type === 'cancel_request' ? `Cancellation: ${justification}` : `Deletion: ${justification}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
        approvalSteps: createCMOApprovalSteps(),
        originSheet: 'forecast',
        originFiscalYearId: isActiveFY ? selectedFiscalYearId : null,
        originCostCenterId: costCenterId,
        originLineItemId: lineItem.id,
        originKind: type as 'cancel_request' | 'delete_line_item',
        lineItemName: lineItem.name,
        targetRequestId: type === 'cancel_request' ? targetRequestId : undefined,
        targetRequestSnapshot,
        requesterId: userId,
      });

      // Mark line item with pending status
      setCostCenters((prev) =>
        prev.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.map((item) => {
              if (item.id !== lineItem.id) return item;
              if (type === 'cancel_request') {
                return { ...item, cancellationStatus: 'pending' as const, cancellationRequestId: requestId };
              }
              return { ...item, deletionStatus: 'pending' as const, deletionRequestId: requestId };
            }),
          };
        })
      );

      toast({ title: 'Request created', description: `${type === 'cancel_request' ? 'Cancellation' : 'Deletion'} request submitted for approval.` });
    }

    setRowActionDialogOpen(false);
    setPendingRowAction(null);
  }, [pendingRowAction, costCenters, currentRole, updateRequest, addRequest, isActiveFY, selectedFiscalYearId, requests]);

  const handleCellChange = useCallback(({ costCenterId, lineItemId, month, newValue }: ForecastCellChangeArgs) => {
    // Find the line item
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const lineItemName = lineItem?.name ?? '';

    // Block edits if line item is pending creation, OR if this specific cell has a
    // pending adjustment request (unless admin override). Other months on the same
    // line item remain editable so multiple per-cell requests can coexist.
    const cellHasPendingRequest = !!pendingCellLocks.get(lineItemId)?.has(month);
    // Legacy row-level adjustment lock: only applies to items still using
    // adjustmentBeforeValues (pre-per-cell era). New adjustments don't set this.
    const hasLegacyRowAdjustmentLock = lineItem.adjustmentStatus === 'pending' && !pendingCellLocks.has(lineItemId);
    if (!isAdminOverride && (lineItem.approvalStatus === 'pending' || hasLegacyRowAdjustmentLock || cellHasPendingRequest)) {
      toast({
        title: 'Edit locked',
        description: cellHasPendingRequest
          ? 'This cell has a pending approval request. Wait for it to be resolved before editing again.'
          : 'This line item has a pending approval request. Changes are locked until approved/rejected.',
        variant: 'destructive',
      });
      return;
    }

    const oldForecastValues = lineItem.forecastValues;
    const oldValue = oldForecastValues[month] ?? 0;
    const updatedForecastValues = { ...oldForecastValues, [month]: newValue };

    const oldTotal = calculateFYTotal(oldForecastValues);
    const newTotal = calculateFYTotal(updatedForecastValues);

    // Admin override: skip approval workflow, but require justification
    if (isAdminOverride) {
      setPendingOverrideAction({
        type: 'cell_edit',
        costCenterId,
        lineItemId,
        month,
        oldValue,
        newValue,
        updatedValues: updatedForecastValues,
      });
      setOverrideDialogOpen(true);
      return;
    }

    // Check if this triggers an approval workflow
    if (shouldTriggerIncreaseApproval(oldTotal, newTotal, adminSettings)) {
      const delta = newTotal - oldTotal;
      const threshold = getIncreaseApprovalThreshold(oldTotal, adminSettings);

      // Open justification dialog instead of immediately creating request
      setPendingAdjustment({
        costCenterId,
        lineItemId,
        lineItemName,
        month,
        oldValue,
        newValue,
        delta,
        threshold,
        sheet: 'forecast',
      });
      setPendingUpdatedValues(updatedForecastValues);
      setPendingOldValues(oldForecastValues);
      setJustificationDialogOpen(true);
    } else {
      // Normal edit without approval
      setCostCenters((prev) =>
        prev.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.map((item) => {
              if (item.id !== lineItemId) return item;
              return {
                ...item,
                forecastValues: updatedForecastValues,
              };
            }),
          };
        })
      );

      // Add audit entry (only if value actually changed)
      if (oldValue !== newValue) {
        const costCenterName = costCenter?.name ?? '';
        const entry: AuditEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          userName: 'Marketing Admin',
          sheet: 'forecast',
          costCenterId,
          costCenterName,
          lineItemId,
          lineItemName,
          month,
          oldValue,
          newValue,
        };

        setAuditLog((prev) => [entry, ...prev].slice(0, 50));
      }
    }
  }, [costCenters, adminSettings, isAdminOverride]);

  // Handle justification dialog cancel
  const handleJustificationCancel = useCallback(() => {
    setJustificationDialogOpen(false);
    setPendingAdjustment(null);
    setPendingUpdatedValues(null);
    setPendingOldValues(null);
  }, []);

  // Handle justification dialog submit
  const handleJustificationSubmit = useCallback((userJustification: string) => {
    if (!pendingAdjustment || !pendingUpdatedValues || !pendingOldValues) return;

    const { costCenterId, lineItemId, lineItemName, month, delta, oldValue, newValue } = pendingAdjustment;
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const costCenterName = costCenter?.name ?? '';
    const vendorName = lineItem.vendor?.name ?? '—';

    // Find changed months (where delta != 0) for adjustment requests
    const changedMonths = MONTHS.filter((m) => pendingUpdatedValues[m] !== pendingOldValues[m]);
    const startMonth: Month = changedMonths[0] ?? 'feb';
    const endMonth: Month = changedMonths[changedMonths.length - 1] ?? 'feb';

    // Calculate old and new FY totals for adjustment display
    const oldTotal = calculateFYTotal(pendingOldValues);
    const newTotal = calculateFYTotal(pendingUpdatedValues);

    // Create the spend request with origin metadata
    const requestId = crypto.randomUUID();
    const newRequest = {
      id: requestId,
      costCenterId,
      costCenterName,
      vendorName,
      amount: Math.round(delta),
      startMonth,
      endMonth,
      isContracted: lineItem.isContracted,
      justification: userJustification,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      approvalSteps: createDefaultApprovalSteps(),
      // Origin metadata for deep linking
      originSheet: 'forecast' as const,
      originFiscalYearId: isActiveFY ? selectedFiscalYearId : null,
      originCostCenterId: costCenterId,
      originLineItemId: lineItemId,
      originKind: 'adjustment' as const,
      lineItemName,
      // Adjustment amounts for display
      currentAmount: Math.round(oldTotal),
      revisedAmount: Math.round(newTotal),
      requesterId: userId,
    };
    addRequest(newRequest);

    // Update with pending adjustment
    setCostCenters((prev) =>
      prev.map((cc) => {
        if (cc.id !== costCenterId) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.map((item) => {
            if (item.id !== lineItemId) return item;
            return {
              ...item,
              forecastValues: pendingUpdatedValues,
              adjustmentStatus: 'pending' as const,
              adjustmentRequestId: requestId,
              adjustmentBeforeValues: pendingOldValues,
              adjustmentSheet: 'forecast' as const,
            };
          }),
        };
      })
    );

    // Add audit entry
    if (oldValue !== newValue) {
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        userName: 'Marketing Admin',
        sheet: 'forecast',
        costCenterId,
        costCenterName,
        lineItemId,
        lineItemName,
        month,
        oldValue,
        newValue,
      };

      setAuditLog((prev) => [entry, ...prev].slice(0, 50));
    }

    toast({
      title: 'Approval required',
      description: `Increase of ${formatCurrency(delta)} exceeds threshold. A spend request has been created.`,
    });

    // Close dialog and reset state
    setJustificationDialogOpen(false);
    setPendingAdjustment(null);
    setPendingUpdatedValues(null);
    setPendingOldValues(null);
  }, [pendingAdjustment, pendingUpdatedValues, pendingOldValues, costCenters, addRequest, isActiveFY, selectedFiscalYearId]);

  // Admin override handlers
  const handleOverrideCancel = useCallback(() => {
    setOverrideDialogOpen(false);
    setPendingOverrideAction(null);
  }, []);

  const handleOverrideSubmit = useCallback((justification: string) => {
    if (!pendingOverrideAction) return;

    const { type, costCenterId, lineItemId, month, oldValue, newValue, updatedValues } = pendingOverrideAction;
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const lineItemName = lineItem.name;
    const costCenterName = costCenter?.name ?? '';
    const entityId = isActiveFY && selectedFiscalYearId ? selectedFiscalYearId : 'legacy';

    if (type === 'cell_edit' && updatedValues && month !== undefined) {
      // Cancel any linked requests if they exist
      const linkedRequestIds = [
        lineItem.approvalRequestId,
        lineItem.adjustmentRequestId,
        lineItem.deletionRequestId,
        lineItem.cancellationRequestId,
      ].filter(Boolean) as string[];

      for (const requestId of linkedRequestIds) {
        updateRequest(requestId, (request) => ({
          ...request,
          status: 'cancelled' as const,
        }));
        appendApprovalAudit('request', entityId, {
          action: 'admin_override_cancel_linked_request',
          actorRole: 'admin',
          meta: { justification, requestId, lineItemId, costCenterId },
        });
      }

      // Apply the edit directly
      setCostCenters((prev) =>
        prev.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.map((item) => {
              if (item.id !== lineItemId) return item;
              return {
                ...item,
                forecastValues: updatedValues,
                // Clear any pending flags
                approvalStatus: undefined,
                approvalRequestId: undefined,
                adjustmentStatus: undefined,
                adjustmentRequestId: undefined,
                adjustmentBeforeValues: undefined,
                adjustmentSheet: undefined,
              };
            }),
          };
        })
      );

      // Log the override
      appendApprovalAudit('request', entityId, {
        action: 'admin_override_cell_edit',
        actorRole: 'admin',
        meta: {
          sheet: 'forecast',
          fiscalYearId: selectedFiscalYearId,
          costCenterId,
          costCenterName,
          lineItemId,
          lineItemName,
          month,
          oldValue,
          newValue,
          justification,
        },
      });

      // Also add to local audit log
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        userName: 'Marketing Admin (Override)',
        sheet: 'forecast',
        costCenterId,
        costCenterName,
        lineItemId,
        lineItemName,
        month,
        oldValue: oldValue ?? 0,
        newValue: newValue ?? 0,
      };
      setAuditLog((prev) => [entry, ...prev].slice(0, 50));

      toast({
        title: 'Override applied',
        description: 'Cell edit applied via admin override.',
      });
    } else if (type === 'delete_line_item') {
      // Cancel any linked requests
      const linkedRequestIds = [
        lineItem.approvalRequestId,
        lineItem.adjustmentRequestId,
        lineItem.deletionRequestId,
        lineItem.cancellationRequestId,
      ].filter(Boolean) as string[];

      for (const requestId of linkedRequestIds) {
        updateRequest(requestId, (request) => ({
          ...request,
          status: 'cancelled' as const,
        }));
        appendApprovalAudit('request', entityId, {
          action: 'admin_override_cancel_linked_request',
          actorRole: 'admin',
          meta: { justification, requestId, lineItemId, costCenterId },
        });
      }

      // Delete the line item
      setCostCenters((prev) =>
        prev.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.filter((item) => item.id !== lineItemId),
          };
        })
      );

      // Log the override
      appendApprovalAudit('request', entityId, {
        action: 'admin_override_delete_line_item',
        actorRole: 'admin',
        meta: {
          sheet: 'forecast',
          fiscalYearId: selectedFiscalYearId,
          costCenterId,
          costCenterName,
          lineItemId,
          lineItemName,
          justification,
        },
      });

      toast({
        title: 'Override applied',
        description: 'Line item deleted via admin override.',
      });
    }

    setOverrideDialogOpen(false);
    setPendingOverrideAction(null);
  }, [pendingOverrideAction, costCenters, updateRequest, isActiveFY, selectedFiscalYearId]);

  const toggleLockedMonth = (month: Month) => {
    setLockedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  const lockedMonthsDisplay = lockedMonths.size > 0
    ? Array.from(lockedMonths).map((m) => MONTH_LABELS[m]).join(', ')
    : 'None';

  // Compute count of eligible approvals for current role
  const forecastApprovalsCount = useMemo(() => {
    if (!selectedFiscalYearId || !currentRole) return 0;
    
    const validKinds: OriginKind[] = ['new_line_item', 'adjustment', 'delete_line_item', 'cancel_request'];
    return requests.filter((r) => {
      if (r.originSheet !== 'forecast') return false;
      if (r.originFiscalYearId !== selectedFiscalYearId) return false;
      if (!r.originKind || !validKinds.includes(r.originKind)) return false;
      return requestNeedsApprovalByRole(r, currentRole);
    }).length;
  }, [requests, selectedFiscalYearId, currentRole]);

  return (
    <div className="space-y-6">
      {/* Admin Override Banner */}
      {isAdminOverride && (
        <Alert className="border-amber-500 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Admin Override ON — All edits/deletes bypass approvals and are logged.
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
              Turn Off
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={isActiveFY ? `Forecast — ${selectedFiscalYear?.name}` : 'Forecast'}
          description="Current forecast — updated throughout the year as plans change."
        />
        
        {isActiveFY && (
          <div className="flex items-center gap-2">
            {isEditable ? (
              <Button onClick={() => setAddLineItemOpen(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add line item
              </Button>
            ) : isFinance ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" className="gap-2" disabled>
                      <Plus className="h-4 w-4" />
                      Add line item
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Finance is read-only</p>
                </TooltipContent>
              </Tooltip>
            ) : null}

          {currentRole !== 'admin' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApprovalsDrawerOpen(true)}
              className="gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Approvals
              {forecastApprovalsCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {forecastApprovalsCount}
                </Badge>
              )}
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <History className="h-4 w-4" />
                Change history
                {auditLog.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                    {auditLog.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[450px]">
              <SheetHeader>
                <SheetTitle>Change history</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-6rem)] mt-4">
                {auditLog.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No changes yet
                  </p>
                ) : (
                  <div className="space-y-3 pr-4">
                    {auditLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="border rounded-lg p-3 space-y-1 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-xs">
                            {formatAuditTimestamp(entry.timestamp, adminSettings.timeZone)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.userName}
                          </span>
                        </div>
                        <div className="font-medium">
                          {entry.costCenterName} › {entry.lineItemName}
                        </div>
                        <div className="text-muted-foreground">
                          {MONTH_LABELS[entry.month]}:{' '}
                          <span className="text-destructive line-through">
                            {formatCurrency(entry.oldValue)}
                          </span>{' '}
                          →{' '}
                          <span className="text-primary font-medium">
                            {formatCurrency(entry.newValue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Lock className="h-4 w-4" />
                Locked months
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Lock/Unlock Months</h4>
                <p className="text-xs text-muted-foreground">
                  Locked months cannot be edited.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month) => (
                    <div key={month} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`lock-${month}`}
                        checked={lockedMonths.has(month)}
                        onCheckedChange={() => toggleLockedMonth(month)}
                      />
                      <Label htmlFor={`lock-${month}`} className="text-sm cursor-pointer">
                        {MONTH_LABELS[month]}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          </div>
        )}
      </div>

      {/* Empty state when no active FY */}
      {!isActiveFY ? (
        <Card className="max-w-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle className="text-center">No Active Forecast</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Create and approve a fiscal year budget to generate a forecast.
            </p>
            <Button onClick={() => navigate('/budget')}>
              Go to Budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <Lock className="inline h-3 w-3 mr-1" />
            Locked: {lockedMonthsDisplay}
          </p>
          
          <SheetTable
            costCenters={costCenters}
            valueType="forecastValues"
            editable={isEditable || isAdminOverride}
            onCellChange={(isEditable || isAdminOverride) ? handleCellChange : undefined}
            onRowAction={handleRowAction}
            onDeleteLineItem={isAdminOverride ? handleDeleteLineItem : undefined}
            onEditTags={handleEditTags}
            onEditLineItemName={currentRole === 'admin' ? handleEditLineItemName : undefined}
            canEditLineItemName={currentRole === 'admin' && selectedFiscalYear?.status !== 'closed' && selectedFiscalYear?.status !== 'archived'}
            tagsEditable={selectedFiscalYear?.status !== 'closed' && selectedFiscalYear?.status !== 'archived'}
            currentUserRole={currentRole as 'admin' | 'manager' | 'cmo' | 'finance'}
            lockedMonths={lockedMonths}
            focusCostCenterId={focusCostCenterId}
            focusLineItemId={focusLineItemId}
            onFocusLineItemNotFound={handleFocusLineItemNotFound}
            adminOverrideEnabled={adminSettings.adminOverrideEnabled}
          />

          <AddLineItemDialog
            open={addLineItemOpen}
            onOpenChange={setAddLineItemOpen}
            costCenters={costCenters}
            lockedMonths={lockedMonths}
            onCreateLineItem={handleCreateLineItem}
            checkDuplicateName={(name) => findDuplicateLineItemName({ name, costCenters })}
          />

          <EditTagsDialog
            open={editTagsOpen}
            onOpenChange={setEditTagsOpen}
            data={editTagsData}
            onSave={handleSaveTags}
          />

          <EditLineItemDialog
            open={editLineItemOpen}
            onOpenChange={setEditLineItemOpen}
            data={editLineItemData}
            costCenters={costCenters}
            lockedMonths={lockedMonths}
            onSave={handleSaveLineItem}
            checkDuplicateName={(name, excludeId) => 
              findDuplicateLineItemName({ 
                name, 
                costCenters, 
                excludeLineItemId: excludeId 
              })
            }
            valueType="forecastValues"
          />

          <AdjustmentJustificationDialog
            open={justificationDialogOpen}
            data={pendingAdjustment}
            onCancel={handleJustificationCancel}
            onSubmit={handleJustificationSubmit}
          />

          <RowActionDialog
            open={rowActionDialogOpen}
            data={pendingRowAction}
            onCancel={handleRowActionCancel}
            onSubmit={handleRowActionSubmit}
          />

          <AdminOverrideDialog
            open={overrideDialogOpen}
            title={pendingOverrideAction?.type === 'delete_line_item' ? 'Delete Line Item (Override)' : 'Edit Cell (Override)'}
            description="This action bypasses the normal approval workflow. Please provide a justification for audit purposes."
            onCancel={handleOverrideCancel}
            onSubmit={handleOverrideSubmit}
          />

          <BulkLineItemApprovalsDrawer
            open={approvalsDrawerOpen}
            onOpenChange={setApprovalsDrawerOpen}
            originSheet="forecast"
          />
        </>
      )}
    </div>
  );
}
