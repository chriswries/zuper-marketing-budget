import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';
import { CostCenter, Month, MONTHS, MONTH_LABELS } from '@/types/budget';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Lock } from 'lucide-react';

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

export default function Forecast() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>(() =>
    deepCloneCostCenters(mockCostCenters)
  );
  const [lockedMonths, setLockedMonths] = useState<Set<Month>>(() => new Set(['feb', 'mar']));

  const handleCellChange = useCallback(({ costCenterId, lineItemId, month, newValue }: CellChangeArgs) => {
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
  }, []);

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

      <p className="text-sm text-muted-foreground">
        <Lock className="inline h-3 w-3 mr-1" />
        Locked: {lockedMonthsDisplay}
      </p>
      
      <SheetTable
        costCenters={costCenters}
        valueType="forecastValues"
        editable={true}
        onCellChange={handleCellChange}
        lockedMonths={lockedMonths}
      />
    </div>
  );
}
