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
import { Textarea } from '@/components/ui/textarea';
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
  const [globalMode, setGlobalMode] = useState<'$' | '%'>('$');
  const [rows, setRows] = useState<AllocationRow[]>(() =>
    fiscalYearBudget.costCenters.map((cc) => ({
      id: cc.id,
      name: cc.name,
      value: cc.annualLimit,
      hasLineItems: cc.lineItems.length > 0,
    }))
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  
  // Strong delete confirmation state
  const [pendingDeleteRow, setPendingDeleteRow] = useState<AllocationRow | null>(null);
  const [deleteJustification, setDeleteJustification] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Reset state when dialog opens
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setTargetBudget(fiscalYearBudget.targetBudget);
      setGlobalMode('$');
      setRows(
        fiscalYearBudget.costCenters.map((cc) => ({
          id: cc.id,
          name: cc.name,
          value: cc.annualLimit,
          hasLineItems: cc.lineItems.length > 0,
        }))
      );
      setDeletedIds([]);
      resetDeleteConfirmation();
    }
    onOpenChange(nextOpen);
  }, [fiscalYearBudget, onOpenChange]);

  const resetDeleteConfirmation = () => {
    setPendingDeleteRow(null);
    setDeleteJustification('');
    setDeleteConfirmText('');
  };

  // Compute amounts
  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const amount = globalMode === '%' ? targetBudget * (row.value / 100) : row.value;
      const percent = targetBudget > 0 ? (amount / targetBudget) * 100 : 0;
      return { ...row, computedAmount: Math.round(amount), computedPercent: percent };
    });
  }, [rows, targetBudget, globalMode]);

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
      { id: newId, name: '', value: 0, hasLineItems: false, isNew: true },
    ]);
  };

  // Always open confirm dialog for any delete
  const requestDelete = (row: AllocationRow) => {
    setPendingDeleteRow(row);
    setDeleteJustification('');
    setDeleteConfirmText('');
  };

  // Check if delete confirmation is valid
  const isDeleteConfirmValid = useMemo(() => {
    if (!pendingDeleteRow) return false;
    const hasJustification = deleteJustification.trim().length > 0;
    const confirmTextTrimmed = deleteConfirmText.trim();
    const matchesName = confirmTextTrimmed === pendingDeleteRow.name;
    const matchesDelete = confirmTextTrimmed.toUpperCase() === 'DELETE';
    return hasJustification && (matchesName || matchesDelete);
  }, [pendingDeleteRow, deleteJustification, deleteConfirmText]);

  const confirmRemoveRow = () => {
    if (!pendingDeleteRow || !isDeleteConfirmValid) return;
    
    setRows((prev) => prev.filter((r) => r.id !== pendingDeleteRow.id));
    if (!pendingDeleteRow.isNew) {
      setDeletedIds((prev) => [...prev, pendingDeleteRow.id]);
    }
    resetDeleteConfirmation();
  };

  const handleGlobalModeChange = (newMode: '$' | '%') => {
    if (newMode === globalMode) return;
    
    setRows((prev) =>
      prev.map((r) => {
        let newValue: number;
        if (globalMode === '$' && newMode === '%') {
          // Converting from $ to %
          newValue = targetBudget > 0 
            ? Math.round((r.value / targetBudget) * 100 * 100) / 100 
            : 0;
        } else {
          // Converting from % to $
          newValue = Math.round((r.value / 100) * targetBudget);
        }
        return { ...r, value: newValue };
      })
    );
    setGlobalMode(newMode);
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
            <DialogTitle>Edit Budget Settings</DialogTitle>
            <DialogDescription>
              Adjust the target budget and cost center settings for {fiscalYearBudget.name}.
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cost Centers</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={globalMode}
                    onValueChange={(val) => handleGlobalModeChange(val as '$' | '%')}
                  >
                    <SelectTrigger className="w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="$">$</SelectItem>
                      <SelectItem value="%">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addRow}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto border rounded-md">
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

                          {/* Value with mode indicator */}
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                              {globalMode}
                            </span>
                            <Input
                              type="number"
                              value={row.value}
                              onChange={(e) => updateRow(row.id, { value: Number(e.target.value) || 0 })}
                              onFocus={(e) => e.target.select()}
                              className="w-28 pl-6"
                            />
                          </div>

                          {/* Computed display */}
                          <div className="text-sm text-muted-foreground w-32 text-right">
                            {formatCurrency(row.computedAmount)} ({row.computedPercent.toFixed(1)}%)
                          </div>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => requestDelete(row)}
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
              </div>
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

      {/* Strong delete confirmation dialog */}
      <AlertDialog open={!!pendingDeleteRow} onOpenChange={(open) => !open && resetDeleteConfirmation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cost center?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will remove <strong>"{pendingDeleteRow?.name || 'this cost center'}"</strong> from the Budget Settings.
                </p>
                {pendingDeleteRow?.hasLineItems && (
                  <p className="text-destructive">
                    This cost center has line items that will also be removed from the budget.
                  </p>
                )}
                <p className="font-medium">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {/* Justification */}
            <div className="space-y-2">
              <Label htmlFor="deleteJustification">
                Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="deleteJustification"
                value={deleteJustification}
                onChange={(e) => setDeleteJustification(e.target.value)}
                placeholder="Please explain why you are deleting this cost center..."
                className="min-h-[80px]"
              />
            </div>

            {/* Typed confirmation */}
            <div className="space-y-2">
              <Label htmlFor="deleteConfirmText">
                Type <strong>"{pendingDeleteRow?.name}"</strong> or <strong>DELETE</strong> to confirm <span className="text-destructive">*</span>
              </Label>
              <Input
                id="deleteConfirmText"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={pendingDeleteRow?.name || 'DELETE'}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmRemoveRow}
              disabled={!isDeleteConfirmValid}
            >
              Delete Cost Center
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
