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
import { ChevronDown, ChevronRight, ChevronsUpDown, Search, Lock, Trash2, XCircle, ExternalLink, ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  actionType: 'cancel_request' | 'delete_line_item' | 'withdraw_request';
  targetRequestId?: string; // For cancellations/withdrawals, the request being cancelled/withdrawn
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
  // Admin override mode - allows admin to edit/delete without normal restrictions
  adminOverrideEnabled?: boolean;
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

export function SheetTable({ costCenters, valueType, editable = false, showEmptyCostCenters = true, onCellChange, onDeleteLineItem, onRowAction, currentUserRole, lockedMonths, renderCostCenterFYMeta, renderGrandTotalFYMeta, focusCostCenterId, focusLineItemId, onFocusLineItemNotFound, adminOverrideEnabled = false }: SheetTableProps) {
  const navigate = useNavigate();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(costCenters.map((cc) => cc.id)));
  const [searchQuery, setSearchQuery] = useState('');
  const [contractedOnly, setContractedOnly] = useState(false);
  const [accrualOnly, setAccrualOnly] = useState(false);
  const [softwareOnly, setSoftwareOnly] = useState(false);
  const [costCenterSort, setCostCenterSort] = useState<'default' | 'name' | 'fy-high' | 'fy-low'>('default');
  const [lineItemSort, setLineItemSort] = useState<'default' | 'name' | 'fy-high' | 'fy-low'>('default');
  const [highlightedLineItemId, setHighlightedLineItemId] = useState<string | null>(null);
  const focusHandled = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  // Finance role is always read-only for sheet editing
  // Admin with override enabled can edit regardless of parent editable prop
  const isAdminOverride = currentUserRole === 'admin' && adminOverrideEnabled;
  const baseEditable = (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onCellChange && currentUserRole !== 'finance';
  // effectiveEditable: true if normal editing allowed OR admin override is active
  const effectiveEditable = (editable && baseEditable) || isAdminOverride;
  // Legacy isEditable for any code that still references it
  const isEditable = effectiveEditable;
  // Determine if row actions are enabled
  const hasRowActions = (valueType === 'forecastValues' || valueType === 'budgetValues') && !!onRowAction;
  // Legacy canDelete for backwards compatibility - also respects admin override
  const canDelete = ((editable && baseEditable) || isAdminOverride) && !!onDeleteLineItem;
  // Show action column if either new or legacy handler exists
  const showActionColumn = hasRowActions || canDelete;

  // Check if any filter is active
  const hasActiveFilter = searchQuery.trim() !== '' || contractedOnly || accrualOnly || softwareOnly;

  // Filter and sort cost centers and line items
  const filteredCostCenters = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // First filter
    let result = costCenters
      .map((cc) => {
        const filteredItems = cc.lineItems.filter((item) => {
          // Contracted filter
          if (contractedOnly && !item.isContracted) return false;
          // Accrual filter
          if (accrualOnly && !item.isAccrual) return false;
          // Software subscription filter
          if (softwareOnly && !item.isSoftwareSubscription) return false;

          // Search filter (name or vendor)
          if (query) {
            const nameMatch = item.name.toLowerCase().includes(query);
            const vendorMatch = item.vendor?.name.toLowerCase().includes(query) ?? false;
            if (!nameMatch && !vendorMatch) return false;
          }

          return true;
        });

        // Sort line items
        let sortedItems = [...filteredItems];
        if (lineItemSort === 'name') {
          sortedItems.sort((a, b) => a.name.localeCompare(b.name));
        } else if (lineItemSort === 'fy-high') {
          sortedItems.sort((a, b) => calculateFYTotal(b[valueType]) - calculateFYTotal(a[valueType]));
        } else if (lineItemSort === 'fy-low') {
          sortedItems.sort((a, b) => calculateFYTotal(a[valueType]) - calculateFYTotal(b[valueType]));
        }

        return { ...cc, lineItems: sortedItems };
      })
      .filter((cc) => {
        // If filter is active, hide empty cost centers
        if (hasActiveFilter) return cc.lineItems.length > 0;
        // If no filter and showEmptyCostCenters is true, keep all cost centers
        if (showEmptyCostCenters) return true;
        // Otherwise hide empty
        return cc.lineItems.length > 0;
      });

    // Sort cost centers
    if (costCenterSort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (costCenterSort === 'fy-high') {
      result.sort((a, b) => {
        const totalA = calculateFYTotal(calculateFilteredRollup(a.lineItems, valueType));
        const totalB = calculateFYTotal(calculateFilteredRollup(b.lineItems, valueType));
        return totalB - totalA;
      });
    } else if (costCenterSort === 'fy-low') {
      result.sort((a, b) => {
        const totalA = calculateFYTotal(calculateFilteredRollup(a.lineItems, valueType));
        const totalB = calculateFYTotal(calculateFilteredRollup(b.lineItems, valueType));
        return totalA - totalB;
      });
    }

    return result;
  }, [costCenters, searchQuery, contractedOnly, accrualOnly, softwareOnly, hasActiveFilter, showEmptyCostCenters, valueType, costCenterSort, lineItemSort]);

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
            Contracted
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="accrual-only"
            checked={accrualOnly}
            onCheckedChange={setAccrualOnly}
          />
          <Label htmlFor="accrual-only" className="text-sm cursor-pointer">
            Accrual
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="software-only"
            checked={softwareOnly}
            onCheckedChange={setSoftwareOnly}
          />
          <Label htmlFor="software-only" className="text-sm cursor-pointer">
            Software
          </Label>
        </div>
      </div>

      {/* Sorting controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Sort:</span>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="cc-sort" className="text-sm whitespace-nowrap">Cost centers</Label>
          <Select value={costCenterSort} onValueChange={(v) => setCostCenterSort(v as typeof costCenterSort)}>
            <SelectTrigger id="cc-sort" className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="name">Name (A→Z)</SelectItem>
              <SelectItem value="fy-high">FY Total (High→Low)</SelectItem>
              <SelectItem value="fy-low">FY Total (Low→High)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="li-sort" className="text-sm whitespace-nowrap">Line items</Label>
          <Select value={lineItemSort} onValueChange={(v) => setLineItemSort(v as typeof lineItemSort)}>
            <SelectTrigger id="li-sort" className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="name">Name (A→Z)</SelectItem>
              <SelectItem value="fy-high">FY Total (High→Low)</SelectItem>
              <SelectItem value="fy-low">FY Total (Low→High)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table scroll container - owns both horizontal and vertical scroll */}
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="Budget table"
        className="relative min-w-0 w-full overflow-x-auto overflow-y-auto rounded-md border bg-background max-h-[calc(100vh-220px)]"
        style={{ scrollbarGutter: 'stable' }}
        onWheel={(e) => {
          const el = scrollRef.current;
          if (!el) return;
          
          // If user is holding Shift with a vertical scroll wheel (mouse), convert to horizontal
          if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
            return;
          }
          
          // For trackpad users: deltaX is already horizontal, let it work natively
          // No preventDefault here - allow native scrolling
        }}
      >
        <Table className="w-max min-w-full table-fixed border-separate border-spacing-0">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[320px] min-w-[320px] max-w-[320px] sticky top-0 left-0 z-30 bg-muted border-b border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
                Cost Center / Line Item
              </TableHead>
              <TableHead className="w-[220px] min-w-[220px] sticky top-0 z-20 bg-muted border-b">Vendor</TableHead>
              {MONTHS.map((month) => {
                const isLocked = lockedMonths?.has(month);
                return (
                  <TableHead
                    key={month}
                    className="w-[120px] min-w-[120px] text-right sticky top-0 z-20 bg-muted border-b"
                  >
                    <div className="flex items-center justify-end gap-1">
                      {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      {MONTH_LABELS[month]}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-[140px] min-w-[140px] text-right font-semibold sticky top-0 z-20 bg-muted border-b">
                FY Total
              </TableHead>
              {showActionColumn && (
                <TableHead className="w-[72px] min-w-[72px] sticky top-0 z-20 bg-muted border-b"></TableHead>
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
                        className="group font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleCostCenter(costCenter.id)}
                      >
                        <TableCell className="w-[320px] min-w-[320px] max-w-[320px] sticky left-0 z-10 bg-muted border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
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
                        <TableCell className="w-[220px] min-w-[220px] text-muted-foreground">—</TableCell>
                        {MONTHS.map((month) => (
                          <TableCell key={month} className="w-[120px] min-w-[120px] text-right tabular-nums">
                            {formatCurrency(rollup[month])}
                          </TableCell>
                        ))}
                        <TableCell className="w-[140px] min-w-[140px] text-right tabular-nums font-semibold bg-muted/50">
                          <div>{formatCurrency(fyTotal)}</div>
                          {renderCostCenterFYMeta?.(costCenter, fyTotal)}
                        </TableCell>
                        {showActionColumn && <TableCell className="w-[72px] min-w-[72px]"></TableCell>}
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
                              className={`group hover:bg-muted/20 ${isHighlighted ? 'ring-2 ring-primary bg-primary/10 transition-all' : ''}`}
                            >
                              <TableCell className="w-[320px] min-w-[320px] max-w-[320px] sticky left-0 z-10 bg-background border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
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
                                  {item.isSoftwareSubscription && (
                                    <Badge variant="outline" className="text-xs border-purple-500 text-purple-600">
                                      Software
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="w-[220px] min-w-[220px] text-muted-foreground text-sm">
                                {item.vendor?.name ?? '—'}
                              </TableCell>
                              {MONTHS.map((month) => {
                                const cellValue = item[valueType][month];
                                // Only apply locked months logic for forecastValues (not budgetValues)
                                const isMonthLocked = valueType === 'forecastValues' && lockedMonths?.has(month);
                                // Lock cells during pending cancellation or deletion (unless admin override)
                                const isItemLocked = !isAdminOverride && (item.cancellationStatus === 'pending' || item.deletionStatus === 'pending');
                                // Admin override bypasses pending approval locks
                                const isPendingLocked = !isAdminOverride && (item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending');
                                
                                // Admin override bypasses month locks too
                                const effectiveMonthLocked = isAdminOverride ? false : isMonthLocked;
                                
                                if (isEditable && !effectiveMonthLocked && !isItemLocked && !isPendingLocked) {
                                  return (
                                    <EditableCell
                                      key={month}
                                      value={cellValue}
                                      formatted={formatCurrency(cellValue)}
                                      className="w-[120px] min-w-[120px]"
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
                                    className={`w-[120px] min-w-[120px] text-right tabular-nums ${isMonthLocked || isItemLocked ? 'bg-muted/40 cursor-not-allowed text-muted-foreground' : ''}`}
                                  >
                                    {formatCurrency(cellValue)}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="w-[140px] min-w-[140px] text-right tabular-nums font-medium bg-muted/20">
                                {formatCurrency(itemFYTotal)}
                              </TableCell>
                              {showActionColumn && (
                                <TableCell className="w-[72px] min-w-[72px] text-center">
{(() => {
                                    // Determine action type and permissions
                                    const isPending = item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending';
                                    const hasCancellationPending = item.cancellationStatus === 'pending';
                                    const hasDeletionPending = item.deletionStatus === 'pending';
                                    
                                    // Finance role: always disabled for all actions
                                    if (currentUserRole === 'finance') {
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
                                              <p>Finance is read-only</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Check withdraw for pending deletion/cancellation FIRST (before disabling)
                                    if (hasDeletionPending || hasCancellationPending) {
                                      const withdrawTargetId = hasDeletionPending ? item.deletionRequestId : item.cancellationRequestId;
                                      const tooltipLabel = hasDeletionPending ? 'Withdraw deletion request' : 'Withdraw cancellation request';
                                      
                                      // Manager can withdraw their own pending deletion/cancellation request
                                      if (currentUserRole === 'manager') {
                                        // Safety: if requestId is missing, show disabled with error tooltip
                                        if (!withdrawTargetId) {
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
                                                      <XCircle className="h-4 w-4" />
                                                    </Button>
                                                  </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Missing request link</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        }
                                        
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
                                                    if (onRowAction) {
                                                      onRowAction({
                                                        costCenterId: costCenter.id,
                                                        lineItem: item,
                                                        actionType: 'withdraw_request',
                                                        targetRequestId: withdrawTargetId,
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <XCircle className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>{tooltipLabel}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      }
                                      
                                      // Non-manager roles: show disabled with permission tooltip
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
                                                  <XCircle className="h-4 w-4" />
                                                </Button>
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Only Managers can withdraw pending requests</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Admin: disabled for other actions UNLESS admin override is enabled
                                    if (currentUserRole === 'admin' && !isAdminOverride) {
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
                                              <p>Admin cannot modify line items. Enable Admin Override Mode in settings.</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    }
                                    
                                    // Admin with override: allow delete action (goes through parent handler)
                                    if (currentUserRole === 'admin' && isAdminOverride) {
                                      // Use legacy onDeleteLineItem for admin override delete
                                      if (onDeleteLineItem) {
                                        return (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 text-amber-600 hover:text-destructive"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteLineItem({
                                                      costCenterId: costCenter.id,
                                                      lineItemId: item.id,
                                                    });
                                                  }}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Delete line item (Admin Override)</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      }
                                    }
                                    
                                    // Note: Contracted items CAN be deleted per spec - managers/CMO can initiate deletion
                                    // (The deletion goes through approval flow)
                                    
                                    // Determine action type and correct targetRequestId
                                    // For pending items: use withdraw_request (no new request created)
                                    // For approved items: use delete_line_item
                                    const actionType = isPending ? 'withdraw_request' : 'delete_line_item';
                                    // Fix: Choose targetRequestId based on which status is actually pending
                                    const targetRequestId = item.adjustmentStatus === 'pending'
                                      ? item.adjustmentRequestId
                                      : item.approvalStatus === 'pending'
                                        ? item.approvalRequestId
                                        : undefined;
                                    
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
                                              <p>{isPending ? 'Withdraw request' : 'Delete line item'}</p>
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
                <TableRow className="group font-semibold border-t-2 bg-accent">
                  <TableCell className="w-[320px] min-w-[320px] max-w-[320px] sticky left-0 z-10 bg-accent border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
                    Grand Total
                  </TableCell>
                  <TableCell className="w-[220px] min-w-[220px]">—</TableCell>
                  {MONTHS.map((month) => (
                    <TableCell key={month} className="w-[120px] min-w-[120px] text-right tabular-nums">
                      {formatCurrency(grandTotal[month])}
                    </TableCell>
                  ))}
                  <TableCell className="w-[140px] min-w-[140px] text-right tabular-nums bg-accent">
                    <div>{formatCurrency(grandFYTotal)}</div>
                    {renderGrandTotalFYMeta?.(grandFYTotal)}
                  </TableCell>
                  {showActionColumn && <TableCell className="w-[72px] min-w-[72px]"></TableCell>}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
