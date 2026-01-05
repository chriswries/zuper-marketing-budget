import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { useFiscalYearBudget, FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { ChevronUp, ChevronDown, Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostCenterDraft {
  id: string;
  name: string;
  mode: '$' | '%';
  value: number;
}

interface BudgetSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BudgetSetupWizard({ open, onOpenChange }: BudgetSetupWizardProps) {
  const navigate = useNavigate();
  const { fiscalYears, createFiscalYearBudget, setSelectedFiscalYearId } = useFiscalYearBudget();

  const [step, setStep] = useState(1);
  const [fiscalYear, setFiscalYear] = useState<string>('');
  const [targetBudget, setTargetBudget] = useState<string>('');
  const [costCenters, setCostCenters] = useState<CostCenterDraft[]>([]);

  // Find prior FY for copy-forward
  const priorFY = useMemo(() => {
    const yearNum = parseInt(fiscalYear, 10);
    if (isNaN(yearNum)) return null;
    
    const priorYears = fiscalYears.filter(fy => fy.year < yearNum);
    if (priorYears.length === 0) return null;
    
    return priorYears.reduce((max, fy) => (fy.year > max.year ? fy : max), priorYears[0]);
  }, [fiscalYear, fiscalYears]);

  // Validate step 1
  const isStep1Valid = useMemo(() => {
    const yearNum = parseInt(fiscalYear, 10);
    const budgetNum = parseFloat(targetBudget);
    return (
      yearNum >= 2000 && yearNum <= 2100 &&
      budgetNum > 0 &&
      !fiscalYears.some(fy => fy.year === yearNum)
    );
  }, [fiscalYear, targetBudget, fiscalYears]);

  // Compute allocations
  const targetBudgetNum = parseFloat(targetBudget) || 0;

  const computedAllocations = useMemo(() => {
    return costCenters.map(cc => {
      const amount = cc.mode === '%'
        ? targetBudgetNum * (cc.value / 100)
        : cc.value;
      const percent = targetBudgetNum > 0 ? (amount / targetBudgetNum) * 100 : 0;
      return { ...cc, amount, percent };
    });
  }, [costCenters, targetBudgetNum]);

  const totalAllocated = useMemo(() => {
    return computedAllocations.reduce((sum, cc) => sum + cc.amount, 0);
  }, [computedAllocations]);

  const isBalanced = Math.abs(totalAllocated - targetBudgetNum) <= 1;
  const difference = totalAllocated - targetBudgetNum;

  // Step 2: Initialize cost centers from prior FY or empty
  const initializeCostCenters = () => {
    if (priorFY && priorFY.costCenters.length > 0) {
      const priorTarget = priorFY.targetBudget || 1;
      setCostCenters(
        priorFY.costCenters.map(cc => ({
          id: crypto.randomUUID(),
          name: cc.name,
          mode: '%' as const,
          value: Math.round((cc.annualLimit / priorTarget) * 100 * 100) / 100, // 2 decimal places
        }))
      );
    } else {
      setCostCenters([
        { id: crypto.randomUUID(), name: 'Demand Gen', mode: '%', value: 0 },
        { id: crypto.randomUUID(), name: 'Brand', mode: '%', value: 0 },
        { id: crypto.randomUUID(), name: 'Events', mode: '%', value: 0 },
      ]);
    }
  };

  const handleNextToStep2 = () => {
    initializeCostCenters();
    setStep(2);
  };

  const handleAddCostCenter = () => {
    setCostCenters(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: '', mode: '%', value: 0 },
    ]);
  };

  const handleRemoveCostCenter = (id: string) => {
    setCostCenters(prev => prev.filter(cc => cc.id !== id));
  };

  const handleMoveCostCenter = (index: number, direction: 'up' | 'down') => {
    setCostCenters(prev => {
      const newList = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newList.length) return prev;
      [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
      return newList;
    });
  };

  const handleUpdateCostCenter = (id: string, field: keyof CostCenterDraft, value: string | number) => {
    setCostCenters(prev => prev.map(cc => 
      cc.id === id ? { ...cc, [field]: value } : cc
    ));
  };

  const handleCreate = () => {
    const yearNum = parseInt(fiscalYear, 10);
    const now = new Date().toISOString();

    const draft: FiscalYearBudget = {
      id: crypto.randomUUID(),
      year: yearNum,
      name: `FY${yearNum}`,
      startDate: `${yearNum}-02-01`,
      endDate: `${yearNum + 1}-01-31`,
      status: 'planning',
      targetBudget: targetBudgetNum,
      costCenters: computedAllocations.map(cc => ({
        id: crypto.randomUUID(),
        name: cc.name.trim() || 'Unnamed',
        ownerId: null,
        annualLimit: Math.round(cc.amount),
        lineItems: [],
      })),
      createdAt: now,
      updatedAt: now,
    };

    createFiscalYearBudget(draft);
    setSelectedFiscalYearId(draft.id);
    onOpenChange(false);
    navigate('/budget');

    // Reset wizard state
    setStep(1);
    setFiscalYear('');
    setTargetBudget('');
    setCostCenters([]);
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Fiscal Year Budget</DialogTitle>
          <DialogDescription>
            Step {step} of 3: {step === 1 ? 'Basics' : step === 2 ? 'Cost Centers' : 'Allocations'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="fiscalYear">Fiscal Year (4-digit year)</Label>
              <Input
                id="fiscalYear"
                type="number"
                placeholder="e.g., 2027 for FY2027 (Feb 2027 → Jan 2028)"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                min={2000}
                max={2100}
              />
              {fiscalYear && fiscalYears.some(fy => fy.year === parseInt(fiscalYear, 10)) && (
                <p className="text-sm text-destructive">FY{fiscalYear} already exists.</p>
              )}
              {priorFY && (
                <p className="text-sm text-muted-foreground">
                  Will copy forward from {priorFY.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetBudget">Target Budget (USD)</Label>
              <Input
                id="targetBudget"
                type="number"
                placeholder="e.g., 1000000"
                value={targetBudget}
                onChange={(e) => setTargetBudget(e.target.value)}
                min={0}
              />
              {targetBudget && parseFloat(targetBudget) > 0 && (
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(parseFloat(targetBudget))}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleNextToStep2} disabled={!isStep1Valid}>
                Next: Cost Centers
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Define your cost centers. You can reorder, rename, add, or remove them.
            </p>

            <div className="space-y-2">
              {costCenters.map((cc, index) => (
                <div key={cc.id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveCostCenter(index, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveCostCenter(index, 'down')}
                      disabled={index === costCenters.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    className="flex-1"
                    placeholder="Cost center name"
                    value={cc.name}
                    onChange={(e) => handleUpdateCostCenter(cc.id, 'name', e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveCostCenter(cc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={handleAddCostCenter}>
              <Plus className="h-4 w-4 mr-1" />
              Add Cost Center
            </Button>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={costCenters.length === 0}>
                Next: Allocations
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Allocate your {formatCurrency(targetBudgetNum)} budget across cost centers.
              </p>
              <div className={cn(
                "text-sm font-medium flex items-center gap-1",
                isBalanced ? "text-green-600" : "text-destructive"
              )}>
                {isBalanced ? (
                  <>
                    <Check className="h-4 w-4" />
                    Balanced
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    {difference > 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference)}
                  </>
                )}
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">Cost Center</th>
                    <th className="text-center p-2 font-medium w-20">Mode</th>
                    <th className="text-right p-2 font-medium w-28">Value</th>
                    <th className="text-right p-2 font-medium w-28">Amount</th>
                    <th className="text-right p-2 font-medium w-20">%</th>
                  </tr>
                </thead>
                <tbody>
                  {computedAllocations.map((cc) => (
                    <tr key={cc.id} className="border-t">
                      <td className="p-2">{cc.name || 'Unnamed'}</td>
                      <td className="p-2">
                        <Select
                          value={cc.mode}
                          onValueChange={(val) => handleUpdateCostCenter(cc.id, 'mode', val as '$' | '%')}
                        >
                          <SelectTrigger className="h-8 w-16">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="$">$</SelectItem>
                            <SelectItem value="%">%</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          className="h-8 w-24 text-right"
                          value={cc.value}
                          onChange={(e) => handleUpdateCostCenter(cc.id, 'value', parseFloat(e.target.value) || 0)}
                          min={0}
                          step={cc.mode === '%' ? 0.1 : 1000}
                        />
                      </td>
                      <td className="p-2 text-right font-mono">
                        {formatCurrency(cc.amount)}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground">
                        {cc.percent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-medium">
                  <tr className="border-t">
                    <td className="p-2">Total</td>
                    <td></td>
                    <td></td>
                    <td className="p-2 text-right font-mono">{formatCurrency(totalAllocated)}</td>
                    <td className="p-2 text-right font-mono">
                      {targetBudgetNum > 0 ? ((totalAllocated / targetBudgetNum) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={!isBalanced || costCenters.length === 0}>
                Create FY{fiscalYear} Budget
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
