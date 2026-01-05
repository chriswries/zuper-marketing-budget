import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';
import { CostCenter, Month } from '@/types/budget';

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast"
        description="Current forecast — updated throughout the year as plans change."
      />
      
      <SheetTable
        costCenters={costCenters}
        valueType="forecastValues"
        editable={true}
        onCellChange={handleCellChange}
      />
    </div>
  );
}
