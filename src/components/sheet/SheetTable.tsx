import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ChevronDown, ChevronRight, ChevronsUpDown, Search, Lock, Trash2, XCircle, ExternalLink } from 'lucide-react';
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

export interface RowActionArgs {
  costCenterId: string;
  lineItem: LineItem;
  actionType: 'cancel_request' | 'delete_line_item';
  targetRequestId?: string; // For cancellations, the request being cancelled
}

export type UserRole = 'admin' | 'manager' | 'cmo' | 'finance';

interface SheetTableProps {
  costCenters: CostCenter[];
  valueType: ValueType;
  editable?: boolean;
  showEmptyCostCenters?: boolean;
  onCellChange?: (args: CellChangeArgs) => void;
  onDeleteLineItem?: (args: DeleteLineItemArgs) => void;
  onRowAction?: (args: RowActionArgs) => void;
  currentUserRole?: UserRole;
  lockedMonths?: Set<Month>;
  renderCostCenterFYMeta?: (costCenter: CostCenter, spent: number) => React.ReactNode;
  renderGrandTotalFYMeta?: (grandTotal: number) => React.ReactNode;
  // Focus props for deep linking
  focusCostCenterId?: string;
  focusLineItemId?: string;
  onFocusLineItemNotFound?: () => void;
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

export function SheetTable({ costCenters, valueType, editable = false, showEmptyCostCenters = true, onCellChange, onDeleteLineItem, onRowAction, currentUserRole, lockedMonths, renderCostCenterFYMeta, renderGrandTotalFYMeta, focusCostCenterId, focusLineItemId, onFocusLineItemNotFound }: SheetTableProps) {
  const navigate = useNavigate();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(costCenters.map((cc) => cc.id)));
  const [searchQuery, setSearchQuery] = useState('');
  const [contractedOnly, setContractedOnly] = useState(false);
  const [highlightedLineItemId, setHighlightedLineItemId] = useState<string | null>(null);
  const focusHandled = useRef(false);

  // Focus/scroll/highlight logic
  useEffect(() => {
    if (focusLineItemId && !focusHandled.current) {
      // First check if the line item exists
      const lineItemExists = costCenters.some((cc) =>
        cc.lineItems.some((item) => item.id === focusLineItemId)
      );

      if (!lineItemExists) {
        onFocusLineItemNotFound?.();
        focusHandled.current = true;
        return;
      }

      // Expand the cost center containing this line item
      if (focusCostCenterId) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(focusCostCenterId);
          return next;
        });
      }

      // Scroll and highlight after a brief delay to ensure DOM is updated
      setTimeout(() => {
        const element = document.getElementById(`line-item-${focusLineItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedLineItemId(focusLineItemId);
          // Remove highlight after 4 seconds
          setTimeout(() => {
            setHighlightedLineItemId(null);
          }, 4000);
        }
      }, 100);

      focusHandled.current = true;
    }
  }, [focusLineItemId, focusCostCenterId, costCenters, onFocusLineItemNotFound]);

  // Determine if editing is enabled (supports forecastValues and budgetValues)
  const isEditable = editable && (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onCellChange;
  // Determine if row actions are enabled
  const hasRowActions = (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onRowAction;
  // Legacy canDelete for backwards compatibility
  const canDelete = editable && (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onDeleteLineItem;
  // Show action column if either new or legacy handler exists
  const showActionColumn = hasRowActions || canDelete;

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
              {showActionColumn && (
                <TableHead className="w-[50px] min-w-[50px]"></TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCostCenters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showActionColumn ? 16 : 15} className="text-center text-muted-foreground py-8">
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
                        {showActionColumn && <TableCell></TableCell>}
                      </TableRow>

                      {/* Line Item Child Rows */}
                      {isExpanded &&
                        costCenter.lineItems.map((item) => {
                          const itemFYTotal = calculateFYTotal(item[valueType]);

                          const isHighlighted = highlightedLineItemId === item.id;
                          const pendingRequestId = item.approvalStatus === 'pending' 
                            ? item.approvalRequestId 
                            : item.adjustmentStatus === 'pending' 
                              ? item.adjustmentRequestId 
                              : null;

                          return (
                            <TableRow 
                              key={item.id} 
                              id={`line-item-${item.id}`}
                              className={`hover:bg-muted/20 ${isHighlighted ? 'ring-2 ring-primary bg-primary/10 transition-all' : ''}`}
                            >
                              <TableCell className="sticky left-0 bg-background z-10">
                                <div className="flex items-center gap-2 pl-6">
                                  <span className="text-foreground">{item.name}</span>
                                  {/* Approval pending badge */}
                                  {(item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending') && !item.cancellationStatus && (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="secondary" className="text-xs">
                                        Approval pending
                                      </Badge>
                                      {pendingRequestId && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/requests/${pendingRequestId}`);
                                          }}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {/* Cancellation pending badge */}
                                  {item.cancellationStatus === 'pending' && (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                                        Cancellation pending
                                      </Badge>
                                      {item.cancellationRequestId && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/requests/${item.cancellationRequestId}`);
                                          }}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {/* Deletion pending badge */}
                                  {item.deletionStatus === 'pending' && (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs border-destructive text-destructive">
                                        Deletion pending
                                      </Badge>
                                      {item.deletionRequestId && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/requests/${item.deletionRequestId}`);
                                          }}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
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
                                // Lock cells during pending cancellation or deletion
                                const isItemLocked = item.cancellationStatus === 'pending' || item.deletionStatus === 'pending';
                                
                                if (isEditable && !isMonthLocked && !isItemLocked) {
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
                                    className={`text-right tabular-nums ${isMonthLocked || isItemLocked ? 'bg-muted/40 cursor-not-allowed text-muted-foreground' : ''}`}
                                  >
                                    {formatCurrency(cellValue)}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right tabular-nums font-medium bg-muted/20">
                                {formatCurrency(itemFYTotal)}
                              </TableCell>
                              {showActionColumn && (
                                <TableCell className="text-center">
                                  {(() => {
                                    // Determine action type and permissions
                                    const isPending = item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending';
                                    const hasCancellationPending = item.cancellationStatus === 'pending';
                                    const hasDeletionPending = item.deletionStatus === 'pending';
                                    
                                    // If cancellation or deletion is already pending, disable
                                    if (hasCancellationPending || hasDeletionPending) {
                                      return (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 text-muted-foreground cursor-not-allowed opacity-50"
                                                  disabled
                                                >
                                                  {isPending ? <XCircle className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{hasCancellationPending ? 'Cancellation pending' : 'Deletion pending'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Admin/Finance: disabled
                                    if (currentUserRole === 'admin' || currentUserRole === 'finance') {
                                      return (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 text-muted-foreground cursor-not-allowed opacity-50"
                                                  disabled
                                                >
                                                  {isPending ? <XCircle className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{currentUserRole === 'finance' ? 'Finance is read-only' : 'Admin cannot modify line items'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Note: Contracted items CAN be deleted per spec - managers/CMO can initiate deletion
                                    // (The deletion goes through approval flow)
                                    
                                    // Manager or CMO: can perform actions
                                    const actionType = isPending ? 'cancel_request' : 'delete_line_item';
                                    const targetRequestId = item.approvalRequestId || item.adjustmentRequestId;
                                    
                                    // If we have onRowAction, use the new flow
                                    if (onRowAction) {
                                      return (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onRowAction({
                                                    costCenterId: costCenter.id,
                                                    lineItem: item,
                                                    actionType,
                                                    targetRequestId,
                                                  });
                                                }}
                                              >
                                                {isPending ? <XCircle className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{isPending ? 'Cancel request' : 'Delete line item'}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Legacy: use AlertDialog with onDeleteLineItem
                                    if (onDeleteLineItem) {
                                      return (
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
                                                <TooltipContent>
                                                  <p>{isPending ? 'Cancel request' : 'Delete line item'}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                {isPending ? 'Cancel request?' : 'Delete line item?'}
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {isPending
                                                  ? `This will cancel the pending approval request for "${item.name}".`
                                                  : `This will permanently delete "${item.name}". This action cannot be undone.`}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Go back</AlertDialogCancel>
                                              <AlertDialogAction
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                onClick={() => {
                                                  onDeleteLineItem({
                                                    costCenterId: costCenter.id,
                                                    lineItemId: item.id,
                                                  });
                                                }}
                                              >
                                                {isPending ? 'Cancel Request' : 'Delete'}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      );
                                    }
                                    
                                    return null;
                                  })()}
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
                  {showActionColumn && <TableCell></TableCell>}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
