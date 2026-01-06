import { CostCenter, MonthlyValues, MONTHS, calculateFYTotal } from '@/types/budget';

export interface VarianceLineItemRow {
  costCenterId: string;
  costCenterName: string;
  lineItemId: string;
  name: string;
  vendorName?: string;
  isContracted: boolean;
  budgetByMonth: MonthlyValues;
  forecastByMonth: MonthlyValues;
  varianceByMonth: MonthlyValues;
  budgetTotal: number;
  forecastTotal: number;
  variance: number; // forecastTotal - budgetTotal
  variancePct: number | null; // variance / budgetTotal, null if budgetTotal==0
  status: 'matched' | 'budget_only' | 'forecast_only';
}

export interface VarianceCostCenterRow {
  costCenterId: string;
  costCenterName: string;
  budgetTotal: number;
  forecastTotal: number;
  variance: number;
  variancePct: number | null;
  lineItems: VarianceLineItemRow[];
}

export interface VarianceReportResult {
  costCenters: VarianceCostCenterRow[];
  totals: {
    budgetTotal: number;
    forecastTotal: number;
    variance: number;
    variancePct: number | null;
  };
}

function createZeroMonthlyValues(): MonthlyValues {
  return {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
}

function computeVarianceByMonth(budget: MonthlyValues, forecast: MonthlyValues): MonthlyValues {
  const result = createZeroMonthlyValues();
  for (const month of MONTHS) {
    result[month] = (forecast[month] || 0) - (budget[month] || 0);
  }
  return result;
}

function computeVariancePct(variance: number, budgetTotal: number): number | null {
  if (budgetTotal === 0) {
    return null; // Avoid misleading percentage
  }
  return variance / budgetTotal;
}

export function buildVarianceReport(
  budgetCCs: CostCenter[],
  forecastCCs: CostCenter[]
): VarianceReportResult {
  const budgetMap = new Map(budgetCCs.map(cc => [cc.id, cc]));
  const forecastMap = new Map(forecastCCs.map(cc => [cc.id, cc]));
  
  // Collect all CC ids, maintaining budget order first
  const allCCIds = new Set<string>();
  for (const cc of budgetCCs) allCCIds.add(cc.id);
  for (const cc of forecastCCs) allCCIds.add(cc.id);
  
  const costCenters: VarianceCostCenterRow[] = [];
  let grandBudgetTotal = 0;
  let grandForecastTotal = 0;
  
  for (const ccId of allCCIds) {
    const budgetCC = budgetMap.get(ccId);
    const forecastCC = forecastMap.get(ccId);
    const ccName = budgetCC?.name || forecastCC?.name || ccId;
    
    // Collect all line item ids for this CC
    const budgetItemMap = new Map(
      (budgetCC?.lineItems || []).map(item => [item.id, item])
    );
    const forecastItemMap = new Map(
      (forecastCC?.lineItems || []).map(item => [item.id, item])
    );
    
    const allItemIds = new Set<string>();
    for (const item of budgetCC?.lineItems || []) allItemIds.add(item.id);
    for (const item of forecastCC?.lineItems || []) allItemIds.add(item.id);
    
    const lineItems: VarianceLineItemRow[] = [];
    let ccBudgetTotal = 0;
    let ccForecastTotal = 0;
    
    for (const itemId of allItemIds) {
      const budgetItem = budgetItemMap.get(itemId);
      const forecastItem = forecastItemMap.get(itemId);
      
      const budgetValues = budgetItem?.budgetValues || createZeroMonthlyValues();
      const forecastValues = forecastItem?.forecastValues || createZeroMonthlyValues();
      
      const budgetTotal = calculateFYTotal(budgetValues);
      const forecastTotal = calculateFYTotal(forecastValues);
      const variance = forecastTotal - budgetTotal;
      
      let status: 'matched' | 'budget_only' | 'forecast_only';
      if (budgetItem && forecastItem) {
        status = 'matched';
      } else if (budgetItem) {
        status = 'budget_only';
      } else {
        status = 'forecast_only';
      }
      
      lineItems.push({
        costCenterId: ccId,
        costCenterName: ccName,
        lineItemId: itemId,
        name: budgetItem?.name || forecastItem?.name || itemId,
        vendorName: budgetItem?.vendor?.name || forecastItem?.vendor?.name,
        isContracted: budgetItem?.isContracted || forecastItem?.isContracted || false,
        budgetByMonth: budgetValues,
        forecastByMonth: forecastValues,
        varianceByMonth: computeVarianceByMonth(budgetValues, forecastValues),
        budgetTotal,
        forecastTotal,
        variance,
        variancePct: computeVariancePct(variance, budgetTotal),
        status,
      });
      
      ccBudgetTotal += budgetTotal;
      ccForecastTotal += forecastTotal;
    }
    
    const ccVariance = ccForecastTotal - ccBudgetTotal;
    
    costCenters.push({
      costCenterId: ccId,
      costCenterName: ccName,
      budgetTotal: ccBudgetTotal,
      forecastTotal: ccForecastTotal,
      variance: ccVariance,
      variancePct: computeVariancePct(ccVariance, ccBudgetTotal),
      lineItems,
    });
    
    grandBudgetTotal += ccBudgetTotal;
    grandForecastTotal += ccForecastTotal;
  }
  
  const grandVariance = grandForecastTotal - grandBudgetTotal;
  
  return {
    costCenters,
    totals: {
      budgetTotal: grandBudgetTotal,
      forecastTotal: grandForecastTotal,
      variance: grandVariance,
      variancePct: computeVariancePct(grandVariance, grandBudgetTotal),
    },
  };
}
