import { CostCenter, MONTHS, createZeroMonthlyValues } from '@/types/budget';
import { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Creates forecast from an approved budget by inserting forecast monthly_values
 * rows that copy the budget values. Returns the CostCenter[] shape for local state.
 *
 * Line items and cost centers are shared between budget and forecast (same rows).
 * Only the monthly_values differ by value_type.
 */
export async function createForecastCostCentersFromBudget(fy: FiscalYearBudget): Promise<CostCenter[]> {
  const fyId = fy.id;

  // Build forecast monthly_values rows by copying budget values
  const forecastRows: { line_item_id: string; fiscal_year_id: string; value_type: string; month: string; amount: number }[] = [];

  for (const cc of fy.costCenters) {
    for (const item of cc.lineItems) {
      for (const m of MONTHS) {
        forecastRows.push({
          line_item_id: item.id,
          fiscal_year_id: fyId,
          value_type: 'forecast',
          month: m,
          amount: item.budgetValues[m] ?? 0,
        });
      }
    }
  }

  // Batch insert forecast monthly_values
  if (forecastRows.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < forecastRows.length; i += batchSize) {
      const batch = forecastRows.slice(i, i + batchSize);
      const { error } = await supabase
        .from('monthly_values')
        .upsert(batch, { onConflict: 'line_item_id,value_type,month' });
      if (error) {
        logger.error('Failed to insert forecast monthly values from budget:', error);
      }
    }
  }

  return buildForecastCostCenters(fy);
}

/**
 * Build CostCenter[] shape for local state (forecast = copy of budget, actuals zeroed)
 */
function buildForecastCostCenters(fy: FiscalYearBudget): CostCenter[] {
  return fy.costCenters.map((cc) => ({
    id: cc.id,
    name: cc.name,
    ownerId: cc.ownerId,
    annualLimit: cc.annualLimit,
    monthlyLimits: cc.monthlyLimits ? { ...cc.monthlyLimits } : undefined,
    lineItems: cc.lineItems.map((item) => ({
      id: item.id,
      costCenterId: item.costCenterId,
      name: item.name,
      vendor: item.vendor ? { ...item.vendor } : null,
      ownerId: item.ownerId,
      isContracted: item.isContracted,
      isAccrual: item.isAccrual,
      isSoftwareSubscription: item.isSoftwareSubscription ?? false,
      contractStartDate: item.contractStartDate,
      contractEndDate: item.contractEndDate,
      autoRenew: item.autoRenew,
      cancellationNoticeDays: item.cancellationNoticeDays,
      budgetValues: { ...item.budgetValues },
      forecastValues: { ...item.budgetValues },
      actualValues: createZeroMonthlyValues(),
      approvalStatus: undefined,
      approvalRequestId: undefined,
    })),
  }));
}
