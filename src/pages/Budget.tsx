import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable, CellChangeArgs } from '@/components/sheet/SheetTable';
import { AddLineItemDialog } from '@/components/sheet/AddLineItemDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BudgetSetupWizard } from '@/components/budget/BudgetSetupWizard';
import { EditAllocationsDialog } from '@/components/budget/EditAllocationsDialog';
import { AdjustmentJustificationDialog, AdjustmentJustificationData } from '@/components/sheet/AdjustmentJustificationDialog';
import { useFiscalYearBudget, BudgetApprovalStatus } from '@/contexts/FiscalYearBudgetContext';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { createDefaultApprovalSteps } from '@/types/requests';
import { LineItem, Month, MONTHS, MONTH_LABELS, calculateFYTotal, MonthlyValues, CostCenter } from '@/types/budget';
import { AuditEntry } from '@/types/audit';
import { ApprovalAuditEvent } from '@/types/approvalAudit';
import { saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { shouldTriggerIncreaseApproval, getIncreaseApprovalThreshold } from '@/lib/lineItemApprovalThreshold';
import {
  loadApprovalAudit,
  appendApprovalAudit,
  formatAuditEvent,
  formatAuditTimestamp,
} from '@/lib/approvalAuditStore';
import {
  buildBudgetSlackTemplate,
  buildBudgetEmailSubject,
  buildBudgetEmailBody,
  buildBudgetUrl,
} from '@/lib/notificationTemplates';
import { copyText } from '@/lib/copyToClipboard';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { toast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CalendarPlus,
  FileSpreadsheet,
  History,
  Plus,
  Settings2,
  Send,
  Check,
  X,
  RotateCcw,
  Lock,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Bell,
  Copy,
} from 'lucide-react';

const BUDGET_AUDIT_KEY_PREFIX = 'budget_audit_v1_';

function loadBudgetAuditLog(fyId: string): AuditEntry[] {
  try {
    const stored = localStorage.getItem(`${BUDGET_AUDIT_KEY_PREFIX}${fyId}`);
    if (stored) {
      return JSON.parse(stored) as AuditEntry[];
    }
  } catch {
    // Ignore
  }
  return [];
}

function saveBudgetAuditLog(fyId: string, entries: AuditEntry[]): void {
  try {
    localStorage.setItem(`${BUDGET_AUDIT_KEY_PREFIX}${fyId}`, JSON.stringify(entries));
  } catch {
    // Ignore
  }
}

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

function createEmptyMonthlyValues(): MonthlyValues {
  return {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
}

function getApprovalStatusBadge(status: BudgetApprovalStatus) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'pending':
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending Approval</Badge>;
    case 'approved':
      return <Badge className="bg-green-600 hover:bg-green-600">Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
  }
}

function getStepIcon(status: 'pending' | 'approved' | 'rejected') {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case 'approved':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'rejected':
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

export default function Budget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget } = useFiscalYearBudget();
  const { requests, addRequest, updateRequest } = useRequests();
  const { settings: adminSettings } = useAdminSettings();
  const { currentRole } = useCurrentUserRole();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);
  const [editAllocationsOpen, setEditAllocationsOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [approvalAuditEvents, setApprovalAuditEvents] = useState<ApprovalAuditEvent[]>([]);

  // Justification dialog state
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] = useState<AdjustmentJustificationData | null>(null);
  const [pendingUpdatedValues, setPendingUpdatedValues] = useState<MonthlyValues | null>(null);
  const [pendingOldValues, setPendingOldValues] = useState<MonthlyValues | null>(null);

  // Focus props from URL params
  const focusCostCenterId = searchParams.get('focusCostCenterId') ?? undefined;
  const focusLineItemId = searchParams.get('focusLineItemId') ?? undefined;

  const handleFocusLineItemNotFound = useCallback(() => {
    toast({
      title: 'Line item not found',
      description: 'This line item no longer exists (may have been rejected or deleted).',
      variant: 'destructive',
    });
    // Clear the focus params
    setSearchParams({});
  }, [setSearchParams]);

  // Finance role is read-only for sheet editing
  const isFinance = currentRole === 'finance';

  // Check if budget is editable (excludes finance role)
  const isEditable = useMemo(() => {
    if (isFinance) return false; // Finance is read-only
    if (!selectedFiscalYear) return false;
    const status = selectedFiscalYear.approval?.status ?? 'draft';
    return status === 'draft' || status === 'rejected';
  }, [selectedFiscalYear, isFinance]);

  // Determine the next pending budget approval step
  const nextPendingBudgetStep = useMemo(() => {
    if (!selectedFiscalYear?.approval?.steps) return null;
    return selectedFiscalYear.approval.steps.find((s) => s.status === 'pending') ?? null;
  }, [selectedFiscalYear]);

  // Role gating for budget approvals
  const canApproveBudgetStep = nextPendingBudgetStep?.level === currentRole;
  const isAdmin = currentRole === 'admin';

  // Check if allocations are balanced
  const allocationsBalanced = useMemo(() => {
    if (!selectedFiscalYear) return false;
    const totalAllocated = selectedFiscalYear.costCenters.reduce(
      (sum, cc) => sum + cc.annualLimit,
      0
    );
    return Math.abs(totalAllocated - selectedFiscalYear.targetBudget) <= 1;
  }, [selectedFiscalYear]);

  // Check if any line items are pending approval (create or adjustment)
  const hasPendingLineItems = useMemo(() => {
    if (!selectedFiscalYear) return false;
    return selectedFiscalYear.costCenters.some((cc) =>
      cc.lineItems.some((item) => item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending')
    );
  }, [selectedFiscalYear]);

  // Compute submission blockers
  const submissionBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!allocationsBalanced) {
      blockers.push('Allocations must balance to target budget');
    }
    if (hasPendingLineItems) {
      blockers.push('All line items must be approved before submission');
    }
    return blockers;
  }, [allocationsBalanced, hasPendingLineItems]);

  const canSubmit = submissionBlockers.length === 0;

  // Compute remaining amounts for each cost center and grand total
  const remainingAmounts = useMemo(() => {
    if (!selectedFiscalYear) return { byCostCenter: new Map<string, number>(), grandTotal: 0 };

    const byCostCenter = new Map<string, number>();
    let totalSpent = 0;

    for (const cc of selectedFiscalYear.costCenters) {
      const spent = cc.lineItems.reduce((sum, item) => sum + calculateFYTotal(item.budgetValues), 0);
      totalSpent += spent;
      byCostCenter.set(cc.id, cc.annualLimit - spent);
    }

    return {
      byCostCenter,
      grandTotal: selectedFiscalYear.targetBudget - totalSpent,
    };
  }, [selectedFiscalYear]);

  // Render meta for cost center FY Total cell
  const renderCostCenterFYMeta = useCallback((cc: CostCenter) => {
    const remaining = remainingAmounts.byCostCenter.get(cc.id) ?? 0;
    if (remaining >= 0) {
      return (
        <Badge variant="secondary" className="text-xs mt-1">
          Remaining: {formatCurrency(remaining)}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-xs mt-1">
        Over by: {formatCurrency(Math.abs(remaining))}
      </Badge>
    );
  }, [remainingAmounts]);

  // Render meta for grand total FY Total cell
  const renderGrandTotalFYMeta = useCallback(() => {
    const remaining = remainingAmounts.grandTotal;
    if (remaining >= 0) {
      return (
        <Badge variant="secondary" className="text-xs mt-1">
          Remaining: {formatCurrency(remaining)}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-xs mt-1">
        Over by: {formatCurrency(Math.abs(remaining))}
      </Badge>
    );
  }, [remainingAmounts]);

  // Handle saving allocations
  const handleSaveAllocations = useCallback(
    (payload: {
      targetBudget: number;
      costCenters: { id: string; name: string; annualLimit: number; isNew?: boolean }[];
      deletedIds: string[];
    }) => {
      if (!selectedFiscalYear || !selectedFiscalYearId) return;

      updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
        // Build new cost centers array preserving existing lineItems
        const newCostCenters: CostCenter[] = payload.costCenters.map((updated) => {
          const existing = fy.costCenters.find((cc) => cc.id === updated.id);
          if (existing && !updated.isNew) {
            return {
              ...existing,
              name: updated.name,
              annualLimit: updated.annualLimit,
            };
          }
          // New cost center
          return {
            id: updated.id,
            name: updated.name,
            ownerId: null,
            annualLimit: updated.annualLimit,
            lineItems: [],
          };
        });

        return {
          ...fy,
          targetBudget: payload.targetBudget,
          costCenters: newCostCenters,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget]
  );

  // Approval workflow handlers
  const handleSubmitForApproval = useCallback(() => {
    if (!selectedFiscalYearId || !canSubmit) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
      ...fy,
      updatedAt: new Date().toISOString(),
      approval: {
        ...fy.approval,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        approvedAt: undefined,
        rejectedAt: undefined,
        steps: [
          { level: 'cmo', status: 'pending' },
          { level: 'finance', status: 'pending' },
        ],
      },
    }));

    // Append audit event
    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'submitted_for_approval',
      actorRole: currentRole,
    });
    setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId));
  }, [selectedFiscalYearId, canSubmit, updateFiscalYearBudget, currentRole]);

  const handleApproveNextStep = useCallback(() => {
    if (!selectedFiscalYearId || !selectedFiscalYear) return;

    const stepLevel = nextPendingBudgetStep?.level;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      const steps = [...fy.approval.steps];
      const pendingIndex = steps.findIndex((s) => s.status === 'pending');

      if (pendingIndex === -1) return fy;

      steps[pendingIndex] = {
        ...steps[pendingIndex],
        status: 'approved',
        updatedAt: new Date().toISOString(),
      };

      const allApproved = steps.every((s) => s.status === 'approved');
      const now = new Date().toISOString();

      if (allApproved) {
        // Create forecast from approved budget
        const forecastCostCenters = createForecastCostCentersFromBudget({
          ...fy,
          approval: { ...fy.approval, steps },
        });
        saveForecastForFY(fy.id, forecastCostCenters);
      }

      return {
        ...fy,
        updatedAt: now,
        status: allApproved ? 'active' : fy.status,
        approval: {
          ...fy.approval,
          steps,
          status: allApproved ? 'approved' : 'pending',
          approvedAt: allApproved ? now : undefined,
        },
      };
    });

    // Append audit event for step approval
    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'approved_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'cmo' | 'finance',
    });

    // Check if this was the final step
    const steps = selectedFiscalYear.approval?.steps ?? [];
    const pendingCount = steps.filter((s) => s.status === 'pending').length;
    if (pendingCount === 1) {
      // This was the last pending step, append final_approved
      appendApprovalAudit('budget', selectedFiscalYearId, {
        action: 'final_approved',
        actorRole: currentRole,
      });
    }

    setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId));
  }, [selectedFiscalYearId, selectedFiscalYear, updateFiscalYearBudget, currentRole, nextPendingBudgetStep]);

  const handleReject = useCallback(() => {
    if (!selectedFiscalYearId) return;

    const stepLevel = nextPendingBudgetStep?.level;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      const steps = [...fy.approval.steps];
      const pendingIndex = steps.findIndex((s) => s.status === 'pending');

      if (pendingIndex !== -1) {
        steps[pendingIndex] = {
          ...steps[pendingIndex],
          status: 'rejected',
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ...fy,
        updatedAt: new Date().toISOString(),
        approval: {
          ...fy.approval,
          steps,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
        },
      };
    });

    // Append audit event
    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'rejected_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'cmo' | 'finance',
    });
    setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId));
  }, [selectedFiscalYearId, updateFiscalYearBudget, currentRole, nextPendingBudgetStep]);

  const handleResetToDraft = useCallback(() => {
    if (!selectedFiscalYearId) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
      ...fy,
      updatedAt: new Date().toISOString(),
      status: 'planning',
      approval: {
        status: 'draft',
        steps: [
          { level: 'cmo', status: 'pending' },
          { level: 'finance', status: 'pending' },
        ],
        submittedAt: undefined,
        approvedAt: undefined,
        rejectedAt: undefined,
      },
    }));

    // Append audit event
    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'reset',
      actorRole: currentRole,
    });
    setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId));
  }, [selectedFiscalYearId, updateFiscalYearBudget, currentRole]);

  // Load audit log when FY changes
  useEffect(() => {
    if (selectedFiscalYearId) {
      setAuditLog(loadBudgetAuditLog(selectedFiscalYearId));
      setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId));
    } else {
      setAuditLog([]);
      setApprovalAuditEvents([]);
    }
  }, [selectedFiscalYearId]);

  // Save audit log whenever it changes
  useEffect(() => {
    if (selectedFiscalYearId && auditLog.length > 0) {
      saveBudgetAuditLog(selectedFiscalYearId, auditLog);
    }
  }, [selectedFiscalYearId, auditLog]);

  // Sync line item approval/adjustment status with request status
  useEffect(() => {
    if (!selectedFiscalYear || !selectedFiscalYearId) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      let changed = false;

      const updatedCostCenters = fy.costCenters.map((cc) => {
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

              if (isRejected && item.adjustmentBeforeValues && item.adjustmentSheet === 'budget') {
                changed = true;
                // Revert values and clear adjustment fields
                updatedItems.push({
                  ...item,
                  budgetValues: item.adjustmentBeforeValues,
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

        const hasChangedItem = updatedItems.some((itm, idx) => itm !== cc.lineItems[idx]);
        if (hasChangedItem) {
          return { ...cc, lineItems: updatedItems };
        }

        return cc;
      });

      if (!changed && updatedCostCenters.every((cc, idx) => cc === fy.costCenters[idx])) {
        return fy;
      }

      return { ...fy, costCenters: updatedCostCenters, updatedAt: new Date().toISOString() };
    });
  }, [requests, selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget]);

  const handleCellChange = useCallback(
    ({ costCenterId, lineItemId, month, newValue }: CellChangeArgs) => {
      if (!selectedFiscalYear || !selectedFiscalYearId) return;

      // Find the line item
      const costCenter = selectedFiscalYear.costCenters.find((cc) => cc.id === costCenterId);
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

      const oldBudgetValues = lineItem.budgetValues;
      const oldValue = oldBudgetValues[month] ?? 0;
      const updatedBudgetValues = { ...oldBudgetValues, [month]: newValue };

      const oldTotal = calculateFYTotal(oldBudgetValues);
      const newTotal = calculateFYTotal(updatedBudgetValues);

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
          const entry: AuditEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            userName: 'Marketing Admin',
            sheet: 'budget',
            fiscalYearId: selectedFiscalYearId,
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
    },
    [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget, adminSettings]
  );

  // Handle justification dialog cancel
  const handleJustificationCancel = useCallback(() => {
    setJustificationDialogOpen(false);
    setPendingAdjustment(null);
    setPendingUpdatedValues(null);
    setPendingOldValues(null);
  }, []);

  // Handle justification dialog submit
  const handleJustificationSubmit = useCallback((userJustification: string) => {
    if (!pendingAdjustment || !pendingUpdatedValues || !pendingOldValues || !selectedFiscalYearId) return;

    const { costCenterId, lineItemId, lineItemName, month, delta, oldValue, newValue } = pendingAdjustment;
    const costCenter = selectedFiscalYear?.costCenters.find((cc) => cc.id === costCenterId);
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
      justification: `Budget adjustment: ${userJustification}`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      approvalSteps: createDefaultApprovalSteps(),
      // Origin metadata for deep linking
      originSheet: 'budget' as const,
      originFiscalYearId: selectedFiscalYearId,
      originCostCenterId: costCenterId,
      originLineItemId: lineItemId,
      originKind: 'adjustment' as const,
      lineItemName,
    };
    addRequest(newRequest);

    // Update with pending adjustment
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

    // Add audit entry
    if (oldValue !== newValue) {
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        userName: 'Marketing Admin',
        sheet: 'budget',
        fiscalYearId: selectedFiscalYearId,
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
  }, [pendingAdjustment, pendingUpdatedValues, pendingOldValues, selectedFiscalYear, selectedFiscalYearId, addRequest, updateFiscalYearBudget]);

  const handleDeleteLineItem = useCallback(
    ({ costCenterId, lineItemId }: { costCenterId: string; lineItemId: string }) => {
      if (!selectedFiscalYear || !selectedFiscalYearId) return;

      // Find the line item to check if we need to cancel a request
      const costCenter = selectedFiscalYear.costCenters.find((cc) => cc.id === costCenterId);
      const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);

      // If this is a pending line item with a linked request, reject the request
      if (lineItem?.approvalStatus === 'pending' && lineItem.approvalRequestId) {
        updateRequest(lineItem.approvalRequestId, (request) => ({
          ...request,
          status: 'rejected',
          approvalSteps: request.approvalSteps.map((step, idx) => {
            if (idx === 0 || request.approvalSteps.slice(0, idx).every((s) => s.status === 'approved')) {
              if (step.status === 'pending') {
                return { ...step, status: 'rejected' as const, updatedAt: new Date().toISOString() };
              }
            }
            return step;
          }),
        }));
      }

      // Remove line item from FY budget
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
    },
    [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget, updateRequest]
  );

  const handleCreateLineItem = useCallback(
    (costCenterId: string, lineItem: LineItem) => {
      if (!selectedFiscalYear || !selectedFiscalYearId) return;

      const cc = selectedFiscalYear.costCenters.find((c) => c.id === costCenterId);
      const costCenterName = cc?.name ?? 'Unknown Cost Center';

      // For Budget, we use forecastValues from dialog as budgetValues
      // (the dialog populates forecastValues, so we copy those to budgetValues)
      const budgetValues = { ...lineItem.forecastValues };
      const fyTotal = calculateFYTotal(budgetValues);
      const vendorName = lineItem.vendor?.name ?? '—';

      // Find start/end months
      const monthsWithSpend = MONTHS.filter((m) => budgetValues[m] > 0);
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
        justification: `New budget line item: ${lineItem.name}`,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        approvalSteps: createDefaultApprovalSteps(),
        // Origin metadata for deep linking
        originSheet: 'budget' as const,
        originFiscalYearId: selectedFiscalYearId,
        originCostCenterId: costCenterId,
        originLineItemId: lineItem.id,
        originKind: 'new_line_item' as const,
        lineItemName: lineItem.name,
      };
      addRequest(newRequest);

      // Create line item with budgetValues populated and approval tracking
      const lineItemWithApproval: LineItem = {
        ...lineItem,
        budgetValues,
        forecastValues: createEmptyMonthlyValues(),
        actualValues: createEmptyMonthlyValues(),
        approvalStatus: 'pending',
        approvalRequestId: requestId,
      };

      // Add to FY budget
      updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
        ...fy,
        updatedAt: new Date().toISOString(),
        costCenters: fy.costCenters.map((c) => {
          if (c.id !== costCenterId) return c;
          return {
            ...c,
            lineItems: [...c.lineItems, lineItemWithApproval],
          };
        }),
      }));
    },
    [selectedFiscalYear, selectedFiscalYearId, addRequest, updateFiscalYearBudget]
  );

  // Empty state: no selected FY or it doesn't exist
  if (!selectedFiscalYear) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Budget"
          description="Original annual budget by cost center and line item. Locked after approval."
        />

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Fiscal Year Budget Selected
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Start by creating a new fiscal year budget. You'll define your target budget and allocate it across cost centers.
            </p>
            <Button onClick={() => setWizardOpen(true)}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              Start FY Budget
            </Button>
          </CardContent>
        </Card>

        <BudgetSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  const approvalStatus = selectedFiscalYear.approval?.status ?? 'draft';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={`Budget — ${selectedFiscalYear.name}`}
          description={`Original annual budget (${selectedFiscalYear.status}). Target: ${formatCurrency(selectedFiscalYear.targetBudget)}`}
        />

        <div className="flex items-center gap-2">
          {isEditable ? (
            <>
              <Button onClick={() => setAddLineItemOpen(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add line item
              </Button>

              <Button variant="outline" size="sm" onClick={() => setEditAllocationsOpen(true)} className="gap-2">
                <Settings2 className="h-4 w-4" />
                Edit allocations
              </Button>
            </>
          ) : isFinance && (selectedFiscalYear.approval?.status === 'draft' || selectedFiscalYear.approval?.status === 'rejected') ? (
            <>
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

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled className="gap-2">
                      <Settings2 className="h-4 w-4" />
                      Edit allocations
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Finance is read-only</p>
                </TooltipContent>
              </Tooltip>
            </>
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
        </div>
      </div>

      {/* Budget Approval Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Budget Approval</CardTitle>
            <div className="flex items-center gap-2">
              {nextPendingBudgetStep && approvalStatus === 'pending' && (
                <Badge variant="outline" className="text-xs">
                  Next: {nextPendingBudgetStep.level.toUpperCase()}
                </Badge>
              )}
              {getApprovalStatusBadge(approvalStatus)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step timeline */}
          <div className="flex items-center gap-6">
            {selectedFiscalYear.approval?.steps.map((step, idx) => (
              <div key={step.level} className="flex items-center gap-2">
                {getStepIcon(step.status)}
                <div>
                  <div className="text-sm font-medium capitalize">{step.level}</div>
                  {step.updatedAt && (
                    <div className="text-xs text-muted-foreground">
                      {formatTimestamp(step.updatedAt)}
                    </div>
                  )}
                </div>
                {idx < selectedFiscalYear.approval.steps.length - 1 && (
                  <div className="w-8 h-px bg-border ml-2" />
                )}
              </div>
            ))}
          </div>

          {/* Submission blockers */}
          {(approvalStatus === 'draft' || approvalStatus === 'rejected') && submissionBlockers.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {submissionBlockers.map((blocker, idx) => (
                    <li key={idx}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Locking banner */}
          {(approvalStatus === 'pending' || approvalStatus === 'approved') && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Budget is {approvalStatus === 'approved' ? 'approved and locked' : 'under approval'}.
                {approvalStatus === 'pending' && ' Reset to draft to make changes.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Role gating info */}
          {approvalStatus === 'pending' && !canApproveBudgetStep && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Current role is <strong>{currentRole.toUpperCase()}</strong>. Switch to <strong>{nextPendingBudgetStep?.level?.toUpperCase()}</strong> in Admin settings to approve this step.
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {(approvalStatus === 'draft' || approvalStatus === 'rejected') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleSubmitForApproval}
                      disabled={!canSubmit || !isAdmin}
                      size="sm"
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Submit for approval
                    </Button>
                  </span>
                </TooltipTrigger>
                {!isAdmin && (
                  <TooltipContent>
                    <p>Only Admin can submit budgets for approval</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            {approvalStatus === 'pending' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={handleApproveNextStep}
                        disabled={!canApproveBudgetStep}
                        size="sm"
                        className="gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Approve next step
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canApproveBudgetStep && (
                    <TooltipContent>
                      <p>Only {nextPendingBudgetStep?.level?.toUpperCase()} can approve this step</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={handleReject}
                        disabled={!canApproveBudgetStep}
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canApproveBudgetStep && (
                    <TooltipContent>
                      <p>Only {nextPendingBudgetStep?.level?.toUpperCase()} can reject this step</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </>
            )}

            {(approvalStatus === 'pending' || approvalStatus === 'rejected') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleResetToDraft}
                      disabled={!isAdmin}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset to draft
                    </Button>
                  </span>
                </TooltipTrigger>
                {!isAdmin && (
                  <TooltipContent>
                    <p>Only Admin can reset budgets to draft</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>

          {/* Approval Activity */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Approval Activity</span>
            </div>
            {approvalAuditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approval activity yet</p>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {approvalAuditEvents.map((event) => {
                    const actionIcon: Record<string, React.ReactNode> = {
                      created: <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />,
                      submitted_for_approval: <Send className="h-3.5 w-3.5 text-blue-500" />,
                      approved_step: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                      rejected_step: <XCircle className="h-3.5 w-3.5 text-destructive" />,
                      reset: <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />,
                      final_approved: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                      notified_next_approver: <Bell className="h-3.5 w-3.5 text-blue-500" />,
                    };
                    return (
                      <div key={event.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5">{actionIcon[event.action] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                        <div className="flex-1">
                          <div className="font-medium">{formatAuditEvent(event)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatAuditTimestamp(event.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Notify Next Approver */}
          {approvalStatus === 'pending' && nextPendingBudgetStep && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Notify Next Approver</span>
                <Badge variant="outline" className="text-xs ml-auto capitalize">
                  {nextPendingBudgetStep.level}
                </Badge>
              </div>
              <BudgetNotifyApprover
                budgetName={selectedFiscalYear.name}
                nextLevel={nextPendingBudgetStep.level as 'cmo' | 'finance'}
                fiscalYearId={selectedFiscalYearId}
                onAuditUpdated={() => setApprovalAuditEvents(loadApprovalAudit('budget', selectedFiscalYearId))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <SheetTable
        costCenters={selectedFiscalYear.costCenters}
        valueType="budgetValues"
        editable={isEditable}
        showEmptyCostCenters={true}
        onCellChange={handleCellChange}
        onDeleteLineItem={handleDeleteLineItem}
        renderCostCenterFYMeta={renderCostCenterFYMeta}
        renderGrandTotalFYMeta={renderGrandTotalFYMeta}
        focusCostCenterId={focusCostCenterId}
        focusLineItemId={focusLineItemId}
        onFocusLineItemNotFound={handleFocusLineItemNotFound}
      />

      <AddLineItemDialog
        open={addLineItemOpen}
        onOpenChange={setAddLineItemOpen}
        costCenters={selectedFiscalYear.costCenters}
        lockedMonths={new Set()} // No locked months for Budget
        onCreateLineItem={handleCreateLineItem}
      />

      <EditAllocationsDialog
        open={editAllocationsOpen}
        onOpenChange={setEditAllocationsOpen}
        fiscalYearBudget={selectedFiscalYear}
        onSave={handleSaveAllocations}
      />

      <AdjustmentJustificationDialog
        open={justificationDialogOpen}
        data={pendingAdjustment}
        onCancel={handleJustificationCancel}
        onSubmit={handleJustificationSubmit}
      />
    </div>
  );
}

function BudgetNotifyApprover({
  budgetName,
  nextLevel,
  fiscalYearId,
  onAuditUpdated,
}: {
  budgetName: string;
  nextLevel: 'cmo' | 'finance';
  fiscalYearId: string | null;
  onAuditUpdated: () => void;
}) {
  const { currentRole } = useCurrentUserRole();
  
  const links = {
    budgetUrl: buildBudgetUrl(fiscalYearId ?? undefined),
  };

  const slackMessage = buildBudgetSlackTemplate({
    budgetName,
    nextLevel,
    links,
  });

  const emailSubject = buildBudgetEmailSubject({
    budgetName,
    nextLevel,
  });

  const emailBody = buildBudgetEmailBody({
    budgetName,
    nextLevel,
    links,
  });

  const handleCopy = async (text: string, label: string, channel: 'slack' | 'email', part: 'message' | 'subject' | 'body') => {
    const success = await copyText(text);
    if (success) {
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard.`,
      });
      
      // Append audit event on successful copy
      if (fiscalYearId) {
        appendApprovalAudit('budget', fiscalYearId, {
          action: 'notified_next_approver',
          actorRole: currentRole,
          stepLevel: nextLevel,
          meta: { channel, part },
        });
        onAuditUpdated();
      }
    } else {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Tabs defaultValue="slack" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-3">
        <TabsTrigger value="slack">Slack</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
      </TabsList>
      <TabsContent value="slack" className="space-y-3">
        <Textarea
          value={slackMessage}
          readOnly
          className="min-h-[120px] text-sm font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCopy(slackMessage, 'Slack message', 'slack', 'message')}
          className="gap-2"
        >
          <Copy className="h-4 w-4" />
          Copy Slack message
        </Button>
      </TabsContent>
      <TabsContent value="email" className="space-y-3">
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Subject</Label>
          <div className="flex gap-2">
            <Input value={emailSubject} readOnly className="flex-1 text-sm" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(emailSubject, 'Email subject', 'email', 'subject')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Body</Label>
          <Textarea
            value={emailBody}
            readOnly
            className="min-h-[120px] text-sm font-mono"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopy(emailBody, 'Email body', 'email', 'body')}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy email body
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
