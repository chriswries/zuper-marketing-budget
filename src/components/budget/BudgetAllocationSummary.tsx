import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { CostCenter, calculateFYTotal } from '@/types/budget';

interface BudgetAllocationSummaryProps {
  costCenters: CostCenter[];
  targetBudget: number;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function BudgetAllocationSummary({ costCenters, targetBudget }: BudgetAllocationSummaryProps) {
  const { totalAllocated, remaining, percentAllocated, isOverBudget } = useMemo(() => {
    const total = costCenters.reduce((sum, cc) => {
      const ccTotal = cc.lineItems.reduce((s, item) => s + calculateFYTotal(item.budgetValues), 0);
      return sum + ccTotal;
    }, 0);
    
    const rem = targetBudget - total;
    const pct = targetBudget > 0 ? Math.min((total / targetBudget) * 100, 100) : 0;
    
    return {
      totalAllocated: total,
      remaining: rem,
      percentAllocated: pct,
      isOverBudget: rem < 0,
    };
  }, [costCenters, targetBudget]);

  return (
    <div className="rounded-lg border bg-card p-4 mb-4">
      <div className="flex items-center justify-between gap-8">
        {/* Budget Allocated */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Budget Allocated</span>
            <span className="text-lg font-semibold">
              {formatCurrency(totalAllocated)}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                of {formatCurrency(targetBudget)}
              </span>
            </span>
          </div>
          <Progress 
            value={percentAllocated} 
            className={`h-2 ${isOverBudget ? '[&>div]:bg-destructive' : ''}`}
          />
        </div>

        {/* Remaining Budget */}
        <div className="text-right min-w-[140px]">
          <span className="text-sm font-medium text-muted-foreground block">
            {isOverBudget ? 'Over Budget' : 'Remaining'}
          </span>
          <span className={`text-xl font-bold ${isOverBudget ? 'text-destructive' : 'text-green-600'}`}>
            {isOverBudget ? '-' : ''}{formatCurrency(Math.abs(remaining))}
          </span>
        </div>
      </div>
    </div>
  );
}
