import { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { AddLineItemDialog } from '@/components/sheet/AddLineItemDialog';
import { mockCostCenters } from '@/data/mock-budget-data';
import { CostCenter, LineItem, Month, MONTHS, MONTH_LABELS, calculateFYTotal } from '@/types/budget';
import { AuditEntry } from '@/types/audit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { Lock, History, Plus } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { createDefaultApprovalSteps } from '@/types/requests';

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

interface CellChangeArgs {
  costCenterId: string;
  lineItemId: string;
  month: Month;
  valueType: 'forecastValues';
  newValue: number;
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

export default function Forecast() {
  const { requests, addRequest, updateRequest } = useRequests();
  const [costCenters, setCostCenters] = useState<CostCenter[]>(() =>
    deepCloneCostCenters(mockCostCenters)
  );
  const [lockedMonths, setLockedMonths] = useState<Set<Month>>(() => new Set(['feb', 'mar']));
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);

  // Sync line item approval status with request status
  useEffect(() => {
    setCostCenters((prev) => {
      let changed = false;
      const updated = prev.map((cc) => {
        const updatedItems = cc.lineItems.filter((item) => {
          if (!item.approvalRequestId) return true;
          
          const linkedRequest = requests.find((r) => r.id === item.approvalRequestId);
          if (!linkedRequest) return true;

          if (linkedRequest.status === 'rejected') {
            changed = true;
            return false; // Remove rejected line items
          }

          if (linkedRequest.status === 'approved' && item.approvalStatus === 'pending') {
            changed = true;
            // Will update status below
          }

          return true;
        }).map((item) => {
          if (!item.approvalRequestId) return item;

          const linkedRequest = requests.find((r) => r.id === item.approvalRequestId);
          if (!linkedRequest) return item;

          if (linkedRequest.status === 'approved' && item.approvalStatus === 'pending') {
            return { ...item, approvalStatus: undefined, approvalRequestId: undefined };
          }

          return item;
        });

        if (updatedItems.length !== cc.lineItems.length) {
          return { ...cc, lineItems: updatedItems };
        }

        // Check if any item changed status
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
    // Use mockCostCenters as source of truth for cost center name (stable reference)
    const cc = mockCostCenters.find((c) => c.id === costCenterId);
    const costCenterName = cc?.name ?? 'Unknown Cost Center';

    // Compute request fields from line item
    const fyTotal = calculateFYTotal(lineItem.forecastValues);
    const vendorName = lineItem.vendor?.name ?? '—';
    
    // Find start/end months (first/last month with spend > 0)
    const monthsWithSpend = MONTHS.filter((m) => lineItem.forecastValues[m] > 0);
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
      justification: `New line item: ${lineItem.name}`,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      approvalSteps: createDefaultApprovalSteps(),
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
  }, [addRequest]);

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
  const handleCellChange = useCallback(({ costCenterId, lineItemId, month, newValue }: CellChangeArgs) => {
    // Find the old value BEFORE updating state
    const costCenter = costCenters.find((cc) => cc.id === costCenterId);
    const lineItem = costCenter?.lineItems.find((item) => item.id === lineItemId);
    const oldValue = lineItem?.forecastValues[month] ?? 0;
    const costCenterName = costCenter?.name ?? '';
    const lineItemName = lineItem?.name ?? '';

    // Update cost centers state
    setCostCenters((prev) =>
      prev.map((cc) => {
        if (cc.id !== costCenterId) return cc;
        return {
          ...cc,
          lineItems: cc.lineItems.map((item) => {
            if (item.id !== lineItemId) return item;
            return {
              ...item,
              forecastValues: {
                ...item.forecastValues,
                [month]: newValue,
              },
            };
          }),
        };
      })
    );

    // Add audit entry (only if value actually changed)
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
  }, [costCenters]);

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
          title="Forecast"
          description="Current forecast — updated throughout the year as plans change."
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

      <p className="text-sm text-muted-foreground">
        <Lock className="inline h-3 w-3 mr-1" />
        Locked: {lockedMonthsDisplay}
      </p>
      
      <SheetTable
        costCenters={costCenters}
        valueType="forecastValues"
        editable={true}
        onCellChange={handleCellChange}
        onDeleteLineItem={handleDeleteLineItem}
        lockedMonths={lockedMonths}
      />

      <AddLineItemDialog
        open={addLineItemOpen}
        onOpenChange={setAddLineItemOpen}
        costCenters={costCenters}
        lockedMonths={lockedMonths}
        onCreateLineItem={handleCreateLineItem}
      />
    </div>
  );
}
