import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CostCenter,
  MONTHS,
  MONTH_LABELS,
  Month,
  calculateFYTotal,
  calculateCostCenterRollup,
} from '@/types/budget';

type ValueType = 'budgetValues' | 'forecastValues' | 'actualValues';

interface SheetTableProps {
  costCenters: CostCenter[];
  valueType: ValueType;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function SheetTable({ costCenters, valueType }: SheetTableProps) {
  const [expandedCostCenters, setExpandedCostCenters] = useState<Set<string>>(
    () => new Set(costCenters.map((cc) => cc.id))
  );

  const toggleCostCenter = (id: string) => {
    setExpandedCostCenters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCostCenters(new Set(costCenters.map((cc) => cc.id)));
  };

  const collapseAll = () => {
    setExpandedCostCenters(new Set());
  };

  const allExpanded = expandedCostCenters.size === costCenters.length;

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    const totals: Record<Month, number> = {
      feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
      aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
    };
    
    for (const cc of costCenters) {
      const rollup = calculateCostCenterRollup(cc.lineItems, valueType);
      for (const month of MONTHS) {
        totals[month] += rollup[month];
      }
    }
    
    return totals;
  }, [costCenters, valueType]);

  const grandFYTotal = calculateFYTotal(grandTotals);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={allExpanded ? collapseAll : expandAll}
          className="gap-1.5"
        >
          <ChevronsUpDown className="h-4 w-4" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[280px] min-w-[280px] sticky left-0 bg-muted/50 z-10">
                Cost Center / Line Item
              </TableHead>
              <TableHead className="w-[120px] min-w-[120px]">Vendor</TableHead>
              {MONTHS.map((month) => (
                <TableHead
                  key={month}
                  className="w-[90px] min-w-[90px] text-right"
                >
                  {MONTH_LABELS[month]}
                </TableHead>
              ))}
              <TableHead className="w-[100px] min-w-[100px] text-right font-semibold bg-muted">
                FY Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costCenters.map((costCenter) => {
              const isExpanded = expandedCostCenters.has(costCenter.id);
              const rollup = calculateCostCenterRollup(costCenter.lineItems, valueType);
              const fyTotal = calculateFYTotal(rollup);

              return (
                <>
                  {/* Cost Center Parent Row */}
                  <TableRow
                    key={costCenter.id}
                    className="bg-muted/30 font-medium cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleCostCenter(costCenter.id)}
                  >
                    <TableCell className="sticky left-0 bg-muted/30 z-10">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{costCenter.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {costCenter.lineItems.length} items
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    {MONTHS.map((month) => (
                      <TableCell key={month} className="text-right tabular-nums">
                        {formatCurrency(rollup[month])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums font-semibold bg-muted/50">
                      {formatCurrency(fyTotal)}
                    </TableCell>
                  </TableRow>

                  {/* Line Item Child Rows */}
                  {isExpanded &&
                    costCenter.lineItems.map((item) => {
                      const itemFYTotal = calculateFYTotal(item[valueType]);

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/20">
                          <TableCell className="sticky left-0 bg-background z-10">
                            <div className="flex items-center gap-2 pl-6">
                              <span className="text-foreground">{item.name}</span>
                              {item.isContracted && (
                                <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                                  Contracted
                                </Badge>
                              )}
                              {item.isAccrual && (
                                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                                  Accrual
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.vendor?.name ?? '—'}
                          </TableCell>
                          {MONTHS.map((month) => (
                            <TableCell key={month} className="text-right tabular-nums">
                              {formatCurrency(item[valueType][month])}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums font-medium bg-muted/20">
                            {formatCurrency(itemFYTotal)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </>
              );
            })}

            {/* Grand Total Row */}
            <TableRow className="bg-primary/5 font-semibold border-t-2">
              <TableCell className="sticky left-0 bg-primary/5 z-10">
                Grand Total
              </TableCell>
              <TableCell>—</TableCell>
              {MONTHS.map((month) => (
                <TableCell key={month} className="text-right tabular-nums">
                  {formatCurrency(grandTotals[month])}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums bg-primary/10">
                {formatCurrency(grandFYTotal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
