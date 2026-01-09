import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp, ArrowDown, Plus, Trash2, AlertCircle } from 'lucide-react';
import { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { CostCenter } from '@/types/budget';
import { validateCostCenterNames } from '@/lib/validateCostCenters';
import { toast } from '@/hooks/use-toast';

interface AllocationRow {
  id: string;
  name: string;
  mode: '$' | '%';
  value: number;
  hasLineItems: boolean;
  isNew?: boolean;
}

interface EditAllocationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fiscalYearBudget: FiscalYearBudget;
  onSave: (payload: {
    targetBudget: number;
    costCenters: { id: string; name: string; annualLimit: number; isNew?: boolean }[];
    deletedIds: string[];
  }) => void;
}

export function EditAllocationsDialog({
  open,
  onOpenChange,
  fiscalYearBudget,
  onSave,
}: EditAllocationsDialogProps) {
  const [targetBudget, setTargetBudget] = useState(fiscalYearBudget.targetBudget);
  const [rows, setRows] = useState<AllocationRow[]>(() =>
    fiscalYearBudget.costCenters.map((cc) => ({
      id: cc.id,
      name: cc.name,
      mode: '$' as const,
      value: cc.annualLimit,
      hasLineItems: cc.lineItems.length > 0,
    }))
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<AllocationRow | null>(null);

  // Reset state when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setTargetBudget(fiscalYearBudget.targetBudget);
      setRows(
        fiscalYearBudget.costCenters.map((cc) => ({
          id: cc.id,
          name: cc.name,
          mode: '$' as const,
          value: cc.annualLimit,
          hasLineItems: cc.lineItems.length > 0,
        }))
      );
      setDeletedIds([]);
      setPendingDeleteRow(null);
    }
    onOpenChange(nextOpen);
  }, [fiscalYearBudget, onOpenChange]);

  // Compute amounts
  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const amount = row.mode === '%' ? targetBudget * (row.value / 100) : row.value;
      const percent = targetBudget > 0 ? (amount / targetBudget) * 100 : 0;
      return { ...row, computedAmount: Math.round(amount), computedPercent: percent };
    });
  }, [rows, targetBudget]);

  const totalAllocated = useMemo(() => {
    return computedRows.reduce((sum, r) => sum + r.computedAmount, 0);
  }, [computedRows]);

  const difference = totalAllocated - targetBudget;
  const isBalanced = Math.abs(difference) <= 1;

  // Validate cost center names
  const costCenterValidation = useMemo(() => {
    return validateCostCenterNames(rows);
  }, [rows]);

  const canSave = isBalanced && costCenterValidation.isValid;

  const updateRow = (id: string, updates: Partial<AllocationRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const addRow = () => {
    const newId = crypto.randomUUID();
    setRows((prev) => [
      ...prev,
      { id: newId, name: '', mode: '$', value: 0, hasLineItems: false, isNew: true },
    ]);
  };

  const removeRow = (row: AllocationRow) => {
    if (row.hasLineItems && !row.isNew) {
      setPendingDeleteRow(row);
    } else {
      confirmRemoveRow(row);
    }
  };

  const confirmRemoveRow = (row: AllocationRow) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    if (!row.isNew) {
      setDeletedIds((prev) => [...prev, row.id]);
    }
    setPendingDeleteRow(null);
  };

  const moveRow = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rows.length - 1) return;

    setRows((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    // Defensive guard
    if (!costCenterValidation.isValid) {
      toast({
        title: 'Fix cost center names',
        description: 'Cost center names must be unique and non-empty.',
        variant: 'destructive',
      });
      return;
    }

    onSave({
      targetBudget,
      costCenters: computedRows.map((r) => ({
        id: r.id,
        name: r.name,
        annualLimit: r.computedAmount,
        isNew: r.isNew,
      })),
      deletedIds,
    });
    onOpenChange(false);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Budget Allocations</DialogTitle>
            <DialogDescription>
              Adjust the target budget and cost center allocations for {fiscalYearBudget.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 flex-1 overflow-hidden flex flex-col">
            {/* Target Budget */}
            <div className="space-y-2">
              <Label htmlFor="targetBudget">Target Budget (USD)</Label>
              <Input
                id="targetBudget"
                type="number"
                value={targetBudget}
                onChange={(e) => setTargetBudget(Number(e.target.value) || 0)}
                className="max-w-xs"
              />
            </div>

            {/* Cost Centers List */}
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <Label>Cost Centers</Label>
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-4 space-y-3">
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      No cost centers. Click "Add" to create one.
                    </p>
                  ) : (
                    computedRows.map((row, index) => (
                      <div key={row.id} className="space-y-1">
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-card">
                          {/* Reorder buttons */}
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => moveRow(index, 'up')}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => moveRow(index, 'down')}
                              disabled={index === rows.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Name */}
                          <Input
                            value={row.name}
                            onChange={(e) => updateRow(row.id, { name: e.target.value })}
                            placeholder="Cost center name"
                            className={`flex-1 min-w-[120px] ${costCenterValidation.errorsById[row.id] ? 'border-destructive' : ''}`}
                          />

                          {/* Mode */}
                          <Select
                            value={row.mode}
                            onValueChange={(val) => updateRow(row.id, { mode: val as '$' | '%' })}
                          >
                            <SelectTrigger className="w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="$">$</SelectItem>
                              <SelectItem value="%">%</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Value */}
                          <Input
                            type="number"
                            value={row.value}
                            onChange={(e) => updateRow(row.id, { value: Number(e.target.value) || 0 })}
                            className="w-24"
                          />

                          {/* Computed display */}
                          <div className="text-sm text-muted-foreground w-32 text-right">
                            {formatCurrency(row.computedAmount)} ({row.computedPercent.toFixed(1)}%)
                          </div>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {costCenterValidation.errorsById[row.id] && (
                          <p className="text-xs text-destructive ml-10">{costCenterValidation.errorsById[row.id]}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Validation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Total Allocated:</span>
                <span className={isBalanced ? 'text-foreground' : 'text-destructive font-medium'}>
                  {formatCurrency(totalAllocated)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Target Budget:</span>
                <span>{formatCurrency(targetBudget)}</span>
              </div>

              {!isBalanced && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {difference > 0
                      ? `Over by ${formatCurrency(difference)}`
                      : `Under by ${formatCurrency(Math.abs(difference))}`}
                    . Allocations must equal the target budget (±$1).
                  </AlertDescription>
                </Alert>
              )}

              {!costCenterValidation.isValid && rows.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Fix cost center name errors to save.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              Save Budget Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation for cost centers with line items */}
      <AlertDialog open={!!pendingDeleteRow} onOpenChange={() => setPendingDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cost center?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting "{pendingDeleteRow?.name}" will remove its line items from the budget.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDeleteRow && confirmRemoveRow(pendingDeleteRow)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
