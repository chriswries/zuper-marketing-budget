import { CostCenter, MonthlyValues } from '@/types/budget';
import { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

function createZeroMonthlyValues(): MonthlyValues {
  return {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
}

/**
 * Creates a new set of forecast cost centers from an approved budget.
 * - Each line item's forecastValues is initialized as a copy of budgetValues
 * - actualValues are zeroed out
 * - approval fields are cleared (these are now baseline approved)
 */
export function createForecastCostCentersFromBudget(fy: FiscalYearBudget): CostCenter[] {
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
      // Copy budget as the baseline
      budgetValues: { ...item.budgetValues },
      // Forecast starts as a copy of budget
      forecastValues: { ...item.budgetValues },
      // Actuals start at zero
      actualValues: createZeroMonthlyValues(),
      // Clear approval fields - these are now baseline approved
      approvalStatus: undefined,
      approvalRequestId: undefined,
    })),
  }));
}
