import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable, CellChangeArgs, RowActionArgs } from '@/components/sheet/SheetTable';
import { AddLineItemDialog } from '@/components/sheet/AddLineItemDialog';
import { AdjustmentJustificationDialog, AdjustmentJustificationData } from '@/components/sheet/AdjustmentJustificationDialog';
import { RowActionDialog, RowActionData } from '@/components/sheet/RowActionDialog';
import { mockCostCenters } from '@/data/mock-budget-data';
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
import { Lock, History, Plus, Info } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { createDefaultApprovalSteps, createCMOApprovalSteps } from '@/types/requests';
import { loadForecastForFY, saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { shouldTriggerIncreaseApproval, getIncreaseApprovalThreshold } from '@/lib/lineItemApprovalThreshold';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { toast } from '@/hooks/use-toast';

// Deep clone cost centers to avoid mutating mock data
function deepCloneCostCenters(costCenters: CostCenter[]): CostCenter[] {
  return costCenters.map((cc) => ({
    ...cc,
    lineItems: cc.lineItems.map((item) => ({
      ...item,
      vendor: item.vendor ? { ...item.vendor } : null,
      budgetValues: { ...item.budgetValues },
      forecastValues: { ...item.forecastValues },
      actualValues: { ...item.actualValues },
    })),
  }));
}

const LEGACY_FORECAST_STORAGE_KEY = 'forecast_cost_centers_v1';

// Load legacy forecast state from localStorage or default to mock data
function loadLegacyForecastState(): CostCenter[] {
  try {
    const stored = localStorage.getItem(LEGACY_FORECAST_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as CostCenter[];
    }
  } catch {
    // Ignore parse errors
  }
  return deepCloneCostCenters(mockCostCenters);
}

// Save legacy forecast state to localStorage
function saveLegacyForecastState(costCenters: CostCenter[]): void {
  try {
    localStorage.setItem(LEGACY_FORECAST_STORAGE_KEY, JSON.stringify(costCenters));
  } catch {
    // Ignore storage errors
  }
}

// Re-export CellChangeArgs for local use with narrowed type
type ForecastCellChangeArgs = CellChangeArgs;

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function Forecast() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { requests, addRequest, updateRequest } = useRequests();
  const { selectedFiscalYear, selectedFiscalYearId } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();
  const { currentRole } = useCurrentUserRole();
  
  // Finance role is read-only for sheet editing
  const isFinance = currentRole === 'finance';
  const isEditable = !isFinance;
  
  // Read query params for focus and mode override
  const focusCostCenterId = searchParams.get('focusCostCenterId') ?? undefined;
  const focusLineItemId = searchParams.get('focusLineItemId') ?? undefined;
  const forecastModeParam = searchParams.get('forecastMode'); // 'legacy' | 'fy' | null

  // Determine if we should use FY-specific forecast or legacy
  // Allow forecastMode param to override
  const defaultIsActiveFY = selectedFiscalYear?.status === 'active';
  const isActiveFY = forecastModeParam === 'legacy' 
    ? false 
    : forecastModeParam === 'fy' 
      ? defaultIsActiveFY 
      : defaultIsActiveFY;
  const fyId = selectedFiscalYearId;

  // Initialize cost centers based on active FY or legacy
  const [costCenters, setCostCenters] = useState<CostCenter[]>(() => {
    if (isActiveFY && fyId) {
      const fyForecast = loadForecastForFY(fyId);
      if (fyForecast) return fyForecast;
      // Initialize from budget if no forecast exists yet
      if (selectedFiscalYear) {
        const newForecast = createForecastCostCentersFromBudget(selectedFiscalYear);
        saveForecastForFY(fyId, newForecast);
        return newForecast;
      }
    }
    return loadLegacyForecastState();
  });

  const [lockedMonths, setLockedMonths] = useState<Set<Month>>(() => new Set());
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);

  // Justification dialog state
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] = useState<AdjustmentJustificationData | null>(null);
  const [pendingUpdatedValues, setPendingUpdatedValues] = useState<MonthlyValues | null>(null);
  const [pendingOldValues, setPendingOldValues] = useState<MonthlyValues | null>(null);

  // Row action dialog state
  const [rowActionDialogOpen, setRowActionDialogOpen] = useState(false);
  const [pendingRowAction, setPendingRowAction] = useState<RowActionData | null>(null);

  const handleFocusLineItemNotFound = useCallback(() => {
    toast({
      title: 'Line item not found',
      description: 'This line item no longer exists (may have been rejected or deleted).',
      variant: 'destructive',
    });
    // Clear the focus params
    setSearchParams({});
  }, [setSearchParams]);

  // Track the current FY mode for display
  const usingLegacyForecast = useMemo(() => {
    return !isActiveFY;
  }, [isActiveFY]);

  // Reload cost centers when FY changes
  useEffect(() => {
    if (isActiveFY && fyId) {
      const fyForecast = loadForecastForFY(fyId);
      if (fyForecast) {
        setCostCenters(fyForecast);
      } else if (selectedFiscalYear) {
        // Initialize from budget if no forecast exists
        const newForecast = createForecastCostCentersFromBudget(selectedFiscalYear);
        saveForecastForFY(fyId, newForecast);
        setCostCenters(newForecast);
      }
    } else {
      setCostCenters(loadLegacyForecastState());
    }
  }, [isActiveFY, fyId, selectedFiscalYear]);

  // Persist costCenters to appropriate storage whenever they change
  useEffect(() => {
    if (isActiveFY && fyId) {
      saveForecastForFY(fyId, costCenters);
    } else {
      saveLegacyForecastState(costCenters);
    }
  }, [costCenters, isActiveFY, fyId]);

  // Sync line item approval/adjustment status with request status
  useEffect(() => {
    setCostCenters((prev) => {
      let changed = false;
      
      const updated = prev.map((cc) => {
        const updatedItems: LineItem[] = [];
        
        for (const item of cc.lineItems) {
          // Handle NEW line item approval (approvalRequestId)
          if (item.approvalRequestId) {
            const linkedRequest = requests.find((r) => r.id === item.approvalRequestId);
            if (linkedRequest) {
              const isRejected = 
                linkedRequest.status === 'rejected' ||
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

          // Handle ADJUSTMENT approval (adjustmentRequestId)
          if (item.adjustmentRequestId) {
            const linkedRequest = requests.find((r) => r.id === item.adjustmentRequestId);
            if (linkedRequest) {
              const isRejected = 
                linkedRequest.status === 'rejected' ||
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

      return changed || updated.some((cc, idx) => cc !== prev[idx]) ? updated : prev;
    });
  }, [requests]);

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
  }, [costCenters, updateRequest]);

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
      // Manager: create request with CMO+Finance steps
      const requestId = crypto.randomUUID();
      const vendorName = lineItem.vendor?.name ?? '—';
      const fyTotal = calculateFYTotal(lineItem.forecastValues);

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
        originKind: type,
        lineItemName: lineItem.name,
        targetRequestId: type === 'cancel_request' ? targetRequestId : undefined,
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
  }, [pendingRowAction, costCenters, currentRole, updateRequest, addRequest, isActiveFY, selectedFiscalYearId]);

  const handleCellChange = useCallback(({ costCenterId, lineItemId, month, newValue }: ForecastCellChangeArgs) => {
    // Find the line item
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const lineItemName = lineItem?.name ?? '';

    // Block edits if pending approval or adjustment
    if (lineItem.approvalStatus === 'pending' || lineItem.adjustmentStatus === 'pending') {
      toast({
        title: 'Edit locked',
        description: 'This line item has a pending approval request. Changes are locked until approved/rejected.',
        variant: 'destructive',
      });
      return;
    }

    const oldForecastValues = lineItem.forecastValues;
    const oldValue = oldForecastValues[month] ?? 0;
    const updatedForecastValues = { ...oldForecastValues, [month]: newValue };

    const oldTotal = calculateFYTotal(oldForecastValues);
    const newTotal = calculateFYTotal(updatedForecastValues);

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
  }, [costCenters, adminSettings]);

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
      justification: `Forecast adjustment: ${userJustification}`,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={isActiveFY ? `Forecast — ${selectedFiscalYear?.name}` : 'Forecast'}
          description="Current forecast — updated throughout the year as plans change."
        />
        
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
                            {formatTimestamp(entry.timestamp)}
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
      </div>

      {/* Legacy forecast banner */}
      {usingLegacyForecast && selectedFiscalYear && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Forecast for {selectedFiscalYear.name} will be available after budget approval. 
            Currently viewing legacy forecast.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        <Lock className="inline h-3 w-3 mr-1" />
        Locked: {lockedMonthsDisplay}
      </p>
      
      <SheetTable
        costCenters={costCenters}
        valueType="forecastValues"
        editable={isEditable}
        onCellChange={isEditable ? handleCellChange : undefined}
        onRowAction={handleRowAction}
        currentUserRole={currentRole as 'admin' | 'manager' | 'cmo' | 'finance'}
        lockedMonths={lockedMonths}
        focusCostCenterId={focusCostCenterId}
        focusLineItemId={focusLineItemId}
        onFocusLineItemNotFound={handleFocusLineItemNotFound}
      />

      <AddLineItemDialog
        open={addLineItemOpen}
        onOpenChange={setAddLineItemOpen}
        costCenters={costCenters}
        lockedMonths={lockedMonths}
        onCreateLineItem={handleCreateLineItem}
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
    </div>
  );
}
