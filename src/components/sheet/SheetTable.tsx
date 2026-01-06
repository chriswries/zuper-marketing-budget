import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, ChevronsUpDown, Search, Lock, Trash2 } from 'lucide-react';
import {
  CostCenter,
  LineItem,
  MONTHS,
  MONTH_LABELS,
  Month,
  calculateFYTotal,
} from '@/types/budget';
import { EditableCell } from './EditableCell';

type ValueType = 'budgetValues' | 'forecastValues' | 'actualValues';

export interface CellChangeArgs {
  costCenterId: string;
  lineItemId: string;
  month: Month;
  valueType: 'forecastValues' | 'budgetValues';
  newValue: number;
}

interface DeleteLineItemArgs {
  costCenterId: string;
  lineItemId: string;
}

interface SheetTableProps {
  costCenters: CostCenter[];
  valueType: ValueType;
  editable?: boolean;
  showEmptyCostCenters?: boolean;
  onCellChange?: (args: CellChangeArgs) => void;
  onDeleteLineItem?: (args: DeleteLineItemArgs) => void;
  lockedMonths?: Set<Month>;
  renderCostCenterFYMeta?: (costCenter: CostCenter, spent: number) => React.ReactNode;
  renderGrandTotalFYMeta?: (grandTotal: number) => React.ReactNode;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Calculate rollup from filtered line items
function calculateFilteredRollup(
  lineItems: LineItem[],
  valueType: ValueType
): Record<Month, number> {
  const rollup: Record<Month, number> = {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
  for (const item of lineItems) {
    for (const month of MONTHS) {
      rollup[month] += item[valueType][month] || 0;
    }
  }
  return rollup;
}

export function SheetTable({ costCenters, valueType, editable = false, showEmptyCostCenters = true, onCellChange, onDeleteLineItem, lockedMonths, renderCostCenterFYMeta, renderGrandTotalFYMeta }: SheetTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(costCenters.map((cc) => cc.id)));
  const [searchQuery, setSearchQuery] = useState('');
  const [contractedOnly, setContractedOnly] = useState(false);

  // Determine if editing is enabled (supports forecastValues and budgetValues)
  const isEditable = editable && (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onCellChange;
  // Determine if delete is enabled (supports forecastValues and budgetValues)
  const canDelete = editable && (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onDeleteLineItem;

  // Check if any filter is active
  const hasActiveFilter = searchQuery.trim() !== '' || contractedOnly;

  // Filter cost centers and line items
  const filteredCostCenters = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return costCenters
      .map((cc) => {
        const filteredItems = cc.lineItems.filter((item) => {
          // Contracted filter
          if (contractedOnly && !item.isContracted) return false;

          // Search filter (name or vendor)
          if (query) {
            const nameMatch = item.name.toLowerCase().includes(query);
            const vendorMatch = item.vendor?.name.toLowerCase().includes(query) ?? false;
            if (!nameMatch && !vendorMatch) return false;
          }

          return true;
        });

        return { ...cc, lineItems: filteredItems };
      })
      .filter((cc) => {
        // If filter is active, hide empty cost centers
        if (hasActiveFilter) return cc.lineItems.length > 0;
        // If no filter and showEmptyCostCenters is true, keep all cost centers
        if (showEmptyCostCenters) return true;
        // Otherwise hide empty
        return cc.lineItems.length > 0;
      });
  }, [costCenters, searchQuery, contractedOnly, hasActiveFilter, showEmptyCostCenters]);

  // Compute grand total from visible data
  const grandTotal = useMemo(() => {
    const allVisibleItems = filteredCostCenters.flatMap((cc) => cc.lineItems);
    return calculateFilteredRollup(allVisibleItems, valueType);
  }, [filteredCostCenters, valueType]);

  const grandFYTotal = calculateFYTotal(grandTotal);

  const toggleCostCenter = (id: string) => {
    setExpandedIds((prev) => {
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
    setExpandedIds(new Set(filteredCostCenters.map((cc) => cc.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const allExpanded = filteredCostCenters.every((cc) => expandedIds.has(cc.id));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={allExpanded ? collapseAll : expandAll}
          className="flex items-center gap-2"
        >
          <ChevronsUpDown className="h-4 w-4" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search line items or vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="contracted-only"
            checked={contractedOnly}
            onCheckedChange={setContractedOnly}
          />
          <Label htmlFor="contracted-only" className="text-sm cursor-pointer">
            Contracted only
          </Label>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[280px] min-w-[280px] sticky left-0 bg-muted/50 z-20">
                Line Item
              </TableHead>
              <TableHead className="w-[120px] min-w-[120px]">Vendor</TableHead>
              {MONTHS.map((month) => {
                const isLocked = lockedMonths?.has(month);
                return (
                  <TableHead
                    key={month}
                    className={`w-[90px] min-w-[90px] text-right ${isLocked ? 'bg-muted/70' : ''}`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      {MONTH_LABELS[month]}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-[100px] min-w-[100px] text-right font-semibold bg-muted">
                FY Total
              </TableHead>
              {canDelete && (
                <TableHead className="w-[50px] min-w-[50px]"></TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCostCenters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 16 : 15} className="text-center text-muted-foreground py-8">
                  No matching line items found.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredCostCenters.map((costCenter) => {
                  const isExpanded = expandedIds.has(costCenter.id);
                  const rollup = calculateFilteredRollup(costCenter.lineItems, valueType);
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
                          <div>{formatCurrency(fyTotal)}</div>
                          {renderCostCenterFYMeta?.(costCenter, fyTotal)}
                        </TableCell>
                        {canDelete && <TableCell></TableCell>}
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
                                  {(item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending') && (
                                    <Badge variant="secondary" className="text-xs">
                                      Approval pending
                                    </Badge>
                                  )}
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
                              {MONTHS.map((month) => {
                                const cellValue = item[valueType][month];
                                // Only apply locked months logic for forecastValues (not budgetValues)
                                const isMonthLocked = valueType === 'forecastValues' && lockedMonths?.has(month);
                                
                                if (isEditable && !isMonthLocked) {
                                  return (
                                    <EditableCell
                                      key={month}
                                      value={cellValue}
                                      formatted={formatCurrency(cellValue)}
                                      onSave={(newValue) => {
                                        onCellChange({
                                          costCenterId: costCenter.id,
                                          lineItemId: item.id,
                                          month,
                                          valueType: valueType as 'forecastValues' | 'budgetValues',
                                          newValue,
                                        });
                                      }}
                                    />
                                  );
                                }

                                return (
                                  <TableCell 
                                    key={month} 
                                    className={`text-right tabular-nums ${isMonthLocked ? 'bg-muted/40 cursor-not-allowed text-muted-foreground' : ''}`}
                                  >
                                    {formatCurrency(cellValue)}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right tabular-nums font-medium bg-muted/20">
                                {formatCurrency(itemFYTotal)}
                              </TableCell>
                              {canDelete && (
                                <TableCell className="text-center">
                                  {/* Allow delete for pending items (cancel request), block for contracted non-pending */}
                                  {item.isContracted && item.approvalStatus !== 'pending' ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground cursor-not-allowed opacity-50"
                                            disabled
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Contracted items cannot be deleted.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            {item.approvalStatus === 'pending' && (
                                              <TooltipContent>
                                                <p>Cancel request</p>
                                              </TooltipContent>
                                            )}
                                          </Tooltip>
                                        </TooltipProvider>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            {item.approvalStatus === 'pending' ? 'Cancel request?' : 'Delete line item?'}
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {item.approvalStatus === 'pending'
                                              ? `This will cancel the pending approval request for "${item.name}" and remove it from the forecast.`
                                              : `This will permanently delete "${item.name}" from the forecast. This action cannot be undone.`}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() => {
                                              onDeleteLineItem?.({
                                                costCenterId: costCenter.id,
                                                lineItemId: item.id,
                                              });
                                            }}
                                          >
                                            {item.approvalStatus === 'pending' ? 'Cancel Request' : 'Delete'}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </TableCell>
                              )}
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
                      {formatCurrency(grandTotal[month])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums bg-primary/10">
                    <div>{formatCurrency(grandFYTotal)}</div>
                    {renderGrandTotalFYMeta?.(grandFYTotal)}
                  </TableCell>
                  {canDelete && <TableCell></TableCell>}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
