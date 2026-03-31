import { useState, useCallback } from 'react';
import { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { SpendRequest, createDefaultApprovalSteps } from '@/types/requests';
import { AdjustmentJustificationData } from '@/components/sheet/AdjustmentJustificationDialog';
import { LineItem, Month, MONTHS, MONTH_LABELS, calculateFYTotal, MonthlyValues } from '@/types/budget';
import { CellChangeArgs } from '@/components/sheet/SheetTable';
import { shouldTriggerIncreaseApproval, getIncreaseApprovalThreshold } from '@/lib/lineItemApprovalThreshold';
import { appendApprovalAudit, loadApprovalAudit } from '@/lib/approvalAuditStore';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { ApprovalAuditEvent } from '@/types/approvalAudit';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';

export interface OverrideAction {
  type: 'cell_edit' | 'delete_line_item';
  costCenterId: string;
  lineItemId: string;
  month?: Month;
  oldValue?: number;
  newValue?: number;
  updatedValues?: MonthlyValues;
}

interface UseBudgetCellEditArgs {
  selectedFiscalYear: FiscalYearBudget | null;
  selectedFiscalYearId: string | null;
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => Promise<void>;
  addRequest: (request: SpendRequest) => Promise<void>;
  updateRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => Promise<void>;
  adminSettings: { increaseApprovalPercent: number; increaseApprovalAbsoluteUsd: number; adminOverrideEnabled: boolean };
  currentRole: UserRole;
  isAdminOverride: boolean;
  setApprovalAuditEvents: React.Dispatch<React.SetStateAction<ApprovalAuditEvent[]>>;
}

export interface UseBudgetCellEditReturn {
  handleCellChange: (args: CellChangeArgs) => void;
  justificationDialogOpen: boolean;
  pendingAdjustment: AdjustmentJustificationData | null;
  pendingUpdatedValues: MonthlyValues | null;
  pendingOldValues: MonthlyValues | null;
  setJustificationDialogOpen: (open: boolean) => void;
  handleJustificationSubmit: (justification: string) => void;
  handleJustificationCancel: () => void;
  overrideDialogOpen: boolean;
  pendingOverrideAction: OverrideAction | null;
  setOverrideDialogOpen: (open: boolean) => void;
  setPendingOverrideAction: React.Dispatch<React.SetStateAction<OverrideAction | null>>;
  handleOverrideSubmit: (justification: string) => void;
  handleOverrideCancel: () => void;
}

export function useBudgetCellEdit({
  selectedFiscalYear,
  selectedFiscalYearId,
  updateFiscalYearBudget,
  addRequest,
  updateRequest,
  adminSettings,
  currentRole,
  isAdminOverride,
  setApprovalAuditEvents,
}: UseBudgetCellEditArgs): UseBudgetCellEditReturn {
  // Justification dialog state
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] = useState<AdjustmentJustificationData | null>(null);
  const [pendingUpdatedValues, setPendingUpdatedValues] = useState<MonthlyValues | null>(null);
  const [pendingOldValues, setPendingOldValues] = useState<MonthlyValues | null>(null);

  // Admin override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<OverrideAction | null>(null);

  const handleCellChange = useCallback(
    ({ costCenterId, lineItemId, month, newValue }: CellChangeArgs) => {
      if (!selectedFiscalYear || !selectedFiscalYearId) return;

      const costCenter = selectedFiscalYear.costCenters.find((cc) => cc.id === costCenterId);
      const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
      if (!lineItem) return;

      const lineItemName = lineItem?.name ?? '';

      // Block edits if pending approval or adjustment (unless admin override)
      if (!isAdminOverride && (lineItem.approvalStatus === 'pending' || lineItem.adjustmentStatus === 'pending')) {
        toast({
          title: 'Edit locked',
          description: 'This line item has a pending approval request. Changes are locked until approved/rejected.',
          variant: 'destructive',
        });
        return;
      }

      const oldBudgetValues = lineItem.budgetValues;
      const oldValue = oldBudgetValues[month] ?? 0;
      const updatedBudgetValues = { ...oldBudgetValues, [month]: newValue };

      const oldTotal = calculateFYTotal(oldBudgetValues);
      const newTotal = calculateFYTotal(updatedBudgetValues);

      // Admin override: skip approval workflow, but require justification
      if (isAdminOverride) {
        setPendingOverrideAction({
          type: 'cell_edit',
          costCenterId,
          lineItemId,
          month,
          oldValue,
          newValue,
          updatedValues: updatedBudgetValues,
        });
        setOverrideDialogOpen(true);
        return;
      }

      // Check if this triggers an approval workflow
      if (shouldTriggerIncreaseApproval(oldTotal, newTotal, adminSettings)) {
        const delta = newTotal - oldTotal;
        const threshold = getIncreaseApprovalThreshold(oldTotal, adminSettings);

        setPendingAdjustment({
          costCenterId,
          lineItemId,
          lineItemName,
          month,
          oldValue,
          newValue,
          delta,
          threshold,
          sheet: 'budget',
        });
        setPendingUpdatedValues(updatedBudgetValues);
        setPendingOldValues(oldBudgetValues);
        setJustificationDialogOpen(true);
      } else {
        // Normal edit without approval
        updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
          ...fy,
          updatedAt: new Date().toISOString(),
          costCenters: fy.costCenters.map((cc) => {
            if (cc.id !== costCenterId) return cc;
            return {
              ...cc,
              lineItems: cc.lineItems.map((item) => {
                if (item.id !== lineItemId) return item;
                return {
                  ...item,
                  budgetValues: updatedBudgetValues,
                };
              }),
            };
          }),
        }));

        // Add audit entry
        if (oldValue !== newValue) {
          const costCenterName = costCenter?.name ?? '';
          appendApprovalAudit('budget', selectedFiscalYearId, {
            action: 'budget_cell_edit',
            actorRole: currentRole,
            note: `${costCenterName} › ${lineItemName} — ${MONTH_LABELS[month]}: ${formatCurrency(oldValue)} → ${formatCurrency(newValue)}`,
            meta: { costCenterId, lineItemId, month, oldValue, newValue },
          }).then(() => {
            loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
          });
        }
      }
    },
    [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget, adminSettings, isAdminOverride, currentRole, setApprovalAuditEvents]
  );

  const handleJustificationCancel = useCallback(() => {
    setJustificationDialogOpen(false);
    setPendingAdjustment(null);
    setPendingUpdatedValues(null);
    setPendingOldValues(null);
  }, []);

  const handleJustificationSubmit = useCallback((userJustification: string) => {
    if (!pendingAdjustment || !pendingUpdatedValues || !pendingOldValues || !selectedFiscalYearId) return;

    const { costCenterId, lineItemId, lineItemName, month, delta, oldValue, newValue } = pendingAdjustment;
    const costCenter = selectedFiscalYear?.costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const costCenterName = costCenter?.name ?? '';
    const vendorName = lineItem.vendor?.name ?? '—';

    const changedMonths = MONTHS.filter((m) => pendingUpdatedValues[m] !== pendingOldValues[m]);
    const startMonth: Month = changedMonths[0] ?? 'feb';
    const endMonth: Month = changedMonths[changedMonths.length - 1] ?? 'feb';

    const oldTotal = calculateFYTotal(pendingOldValues);
    const newTotal = calculateFYTotal(pendingUpdatedValues);

    const requestId = crypto.randomUUID();
    const newRequest: SpendRequest = {
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
      originSheet: 'budget' as const,
      originFiscalYearId: selectedFiscalYearId,
      originCostCenterId: costCenterId,
      originLineItemId: lineItemId,
      originKind: 'adjustment' as const,
      lineItemName,
      currentAmount: Math.round(oldTotal),
      revisedAmount: Math.round(newTotal),
    };
    addRequest(newRequest);

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
      ...fy,
      updatedAt: new Date().toISOString(),
      costCenters: fy.costCenters.map((cc) => {
        if (cc.id !== costCenterId) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.map((item) => {
            if (item.id !== lineItemId) return item;
            return {
              ...item,
              budgetValues: pendingUpdatedValues,
              adjustmentStatus: 'pending' as const,
              adjustmentRequestId: requestId,
              adjustmentBeforeValues: pendingOldValues,
              adjustmentSheet: 'budget' as const,
            };
          }),
        };
      }),
    }));

    if (oldValue !== newValue) {
      appendApprovalAudit('budget', selectedFiscalYearId, {
        action: 'budget_cell_edit',
        actorRole: currentRole,
        note: `${costCenterName} › ${lineItemName} — ${MONTH_LABELS[month]}: ${formatCurrency(oldValue)} → ${formatCurrency(newValue)}`,
        meta: { costCenterId, lineItemId, month, oldValue, newValue },
      }).then(() => {
        loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
      });
    }

    toast({
      title: 'Approval required',
      description: `Increase of ${formatCurrency(delta)} exceeds threshold. A spend request has been created.`,
    });

    setJustificationDialogOpen(false);
    setPendingAdjustment(null);
    setPendingUpdatedValues(null);
    setPendingOldValues(null);
  }, [pendingAdjustment, pendingUpdatedValues, pendingOldValues, selectedFiscalYear, selectedFiscalYearId, addRequest, updateFiscalYearBudget, currentRole, setApprovalAuditEvents]);

  const handleOverrideCancel = useCallback(() => {
    setOverrideDialogOpen(false);
    setPendingOverrideAction(null);
  }, []);

  const handleOverrideSubmit = useCallback((justification: string) => {
    if (!pendingOverrideAction || !selectedFiscalYear || !selectedFiscalYearId) return;

    const { type, costCenterId, lineItemId, month, oldValue, newValue, updatedValues } = pendingOverrideAction;
    const costCenter = selectedFiscalYear.costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    if (!lineItem) return;

    const lineItemName = lineItem.name;
    const costCenterName = costCenter?.name ?? '';

    if (type === 'cell_edit' && updatedValues && month !== undefined) {
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
        appendApprovalAudit('budget', selectedFiscalYearId, {
          action: 'admin_override_cancel_linked_request',
          actorRole: 'admin',
          meta: { justification, requestId, lineItemId, costCenterId },
        });
      }

      // Apply the edit directly
      updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
        ...fy,
        updatedAt: new Date().toISOString(),
        costCenters: fy.costCenters.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.map((item) => {
              if (item.id !== lineItemId) return item;
              return {
                ...item,
                budgetValues: updatedValues,
                approvalStatus: undefined,
                approvalRequestId: undefined,
                adjustmentStatus: undefined,
                adjustmentRequestId: undefined,
                adjustmentBeforeValues: undefined,
                adjustmentSheet: undefined,
              };
            }),
          };
        }),
      }));

      appendApprovalAudit('budget', selectedFiscalYearId, {
        action: 'admin_override_cell_edit',
        actorRole: 'admin',
        meta: {
          sheet: 'budget',
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

      loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);

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
        appendApprovalAudit('budget', selectedFiscalYearId, {
          action: 'admin_override_cancel_linked_request',
          actorRole: 'admin',
          meta: { justification, requestId, lineItemId, costCenterId },
        });
      }

      updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
        ...fy,
        updatedAt: new Date().toISOString(),
        costCenters: fy.costCenters.map((cc) => {
          if (cc.id !== costCenterId) return cc;
          return {
            ...cc,
            lineItems: cc.lineItems.filter((item) => item.id !== lineItemId),
          };
        }),
      }));

      appendApprovalAudit('budget', selectedFiscalYearId, {
        action: 'admin_override_delete_line_item',
        actorRole: 'admin',
        meta: {
          sheet: 'budget',
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
    loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
  }, [pendingOverrideAction, selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget, updateRequest, setApprovalAuditEvents]);

  return {
    handleCellChange,
    justificationDialogOpen,
    pendingAdjustment,
    pendingUpdatedValues,
    pendingOldValues,
    setJustificationDialogOpen,
    handleJustificationSubmit,
    handleJustificationCancel,
    overrideDialogOpen,
    pendingOverrideAction,
    setOverrideDialogOpen,
    setPendingOverrideAction,
    handleOverrideSubmit,
    handleOverrideCancel,
  };
}
