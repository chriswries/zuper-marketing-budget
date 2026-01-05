import { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable, CellChangeArgs } from '@/components/sheet/SheetTable';
import { AddLineItemDialog } from '@/components/sheet/AddLineItemDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BudgetSetupWizard } from '@/components/budget/BudgetSetupWizard';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useRequests } from '@/contexts/RequestsContext';
import { createDefaultApprovalSteps } from '@/types/requests';
import { LineItem, Month, MONTHS, MONTH_LABELS, calculateFYTotal, MonthlyValues } from '@/types/budget';
import { AuditEntry } from '@/types/audit';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarPlus, FileSpreadsheet, History, Plus } from 'lucide-react';

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

export default function Budget() {
  const { selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget } = useFiscalYearBudget();
  const { requests, addRequest, updateRequest } = useRequests();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Load audit log when FY changes
  useEffect(() => {
    if (selectedFiscalYearId) {
      setAuditLog(loadBudgetAuditLog(selectedFiscalYearId));
    } else {
      setAuditLog([]);
    }
  }, [selectedFiscalYearId]);

  // Save audit log whenever it changes
  useEffect(() => {
    if (selectedFiscalYearId && auditLog.length > 0) {
      saveBudgetAuditLog(selectedFiscalYearId, auditLog);
    }
  }, [selectedFiscalYearId, auditLog]);

  // Sync line item approval status with request status
  useEffect(() => {
    if (!selectedFiscalYear || !selectedFiscalYearId) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      let changed = false;

      const updatedCostCenters = fy.costCenters.map((cc) => {
        const updatedItems: LineItem[] = [];

        for (const item of cc.lineItems) {
          if (!item.approvalRequestId) {
            updatedItems.push(item);
            continue;
          }

          const linkedRequest = requests.find((r) => r.id === item.approvalRequestId);
          if (!linkedRequest) {
            updatedItems.push(item);
            continue;
          }

          // Check if rejected: either status is 'rejected' OR any step is rejected
          const isRejected =
            linkedRequest.status === 'rejected' ||
            linkedRequest.approvalSteps?.some((step) => step.status === 'rejected');

          if (isRejected) {
            changed = true;
            // Don't include this item (remove it)
            continue;
          }

          // Check if approved: either status is 'approved' OR all steps approved
          const isApproved =
            linkedRequest.status === 'approved' ||
            (linkedRequest.approvalSteps?.length > 0 &&
              linkedRequest.approvalSteps.every((step) => step.status === 'approved'));

          if (isApproved && item.approvalStatus === 'pending') {
            changed = true;
            updatedItems.push({ ...item, approvalStatus: undefined });
            continue;
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

      // Find old value for audit
      const costCenter = selectedFiscalYear.costCenters.find((cc) => cc.id === costCenterId);
      const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
      const oldValue = lineItem?.budgetValues[month] ?? 0;
      const costCenterName = costCenter?.name ?? '';
      const lineItemName = lineItem?.name ?? '';

      // Update FY budget
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
                budgetValues: {
                  ...item.budgetValues,
                  [month]: newValue,
                },
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
    },
    [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget]
  );

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

      // Create the spend request
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={`Budget — ${selectedFiscalYear.name}`}
          description={`Original annual budget (${selectedFiscalYear.status}). Target: $${selectedFiscalYear.targetBudget.toLocaleString()}`}
        />

        <div className="flex items-center gap-2">
          <Button onClick={() => setAddLineItemOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add line item
          </Button>

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

      <SheetTable
        costCenters={selectedFiscalYear.costCenters}
        valueType="budgetValues"
        editable={true}
        showEmptyCostCenters={true}
        onCellChange={handleCellChange}
        onDeleteLineItem={handleDeleteLineItem}
      />

      <AddLineItemDialog
        open={addLineItemOpen}
        onOpenChange={setAddLineItemOpen}
        costCenters={selectedFiscalYear.costCenters}
        lockedMonths={new Set()} // No locked months for Budget
        onCreateLineItem={handleCreateLineItem}
      />
    </div>
  );
}
