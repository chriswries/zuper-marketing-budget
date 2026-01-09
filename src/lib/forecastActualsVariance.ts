/**
 * Forecast vs Actuals variance calculation.
 * Compares forecast values against matched actuals rollup.
 */

import { CostCenter, MonthlyValues, MONTHS, calculateFYTotal } from '@/types/budget';
import { ActualsRollupResult, LineItemRollup } from './actualsRollup';

export interface ForecastActualsLineItemRow {
  costCenterId: string;
  costCenterName: string;
  lineItemId: string;
  name: string;
  vendorName?: string;
  isContracted: boolean;
  forecastByMonth: MonthlyValues;
  actualsByMonth: MonthlyValues;
  varianceByMonth: MonthlyValues;
  forecastTotal: number;
  actualsTotal: number;
  variance: number; // actualsTotal - forecastTotal
  variancePct: number | null; // variance / forecastTotal, null if forecastTotal==0
  status: 'matched' | 'forecast_only' | 'actuals_only';
}

export interface ForecastActualsCostCenterRow {
  costCenterId: string;
  costCenterName: string;
  forecastTotal: number;
  actualsTotal: number;
  variance: number;
  variancePct: number | null;
  lineItems: ForecastActualsLineItemRow[];
}

export interface ForecastActualsReportResult {
  costCenters: ForecastActualsCostCenterRow[];
  totals: {
    forecastTotal: number;
    actualsTotal: number;
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

function computeVarianceByMonth(forecast: MonthlyValues, actuals: MonthlyValues): MonthlyValues {
  const result = createZeroMonthlyValues();
  for (const month of MONTHS) {
    result[month] = (actuals[month] || 0) - (forecast[month] || 0);
  }
  return result;
}

function computeVariancePct(variance: number, forecastTotal: number): number | null {
  if (forecastTotal === 0) {
    return null; // Avoid misleading percentage
  }
  return variance / forecastTotal;
}

/**
 * Build a Forecast vs Actuals variance report.
 * 
 * @param forecastCCs - Cost centers from the forecast
 * @param actualsRollup - Actuals rollup result from matched transactions
 */
export function buildForecastActualsReport(
  forecastCCs: CostCenter[],
  actualsRollup: ActualsRollupResult
): ForecastActualsReportResult {
  // Build lookup map for actuals by composite key
  const actualsLineItemMap = new Map<string, LineItemRollup>();
  for (const li of actualsRollup.lineItems) {
    const key = `${li.costCenterId}::${li.lineItemId}`;
    actualsLineItemMap.set(key, li);
  }
  
  // Build set of actuals cost center IDs
  const actualsCostCenterIds = new Set(actualsRollup.lineItems.map(li => li.costCenterId));
  
  const costCenters: ForecastActualsCostCenterRow[] = [];
  let grandForecastTotal = 0;
  let grandActualsTotal = 0;
  
  // Process all forecast cost centers
  for (const forecastCC of forecastCCs) {
    const lineItems: ForecastActualsLineItemRow[] = [];
    let ccForecastTotal = 0;
    let ccActualsTotal = 0;
    
    // Track which actuals line items we've matched
    const matchedActualsKeys = new Set<string>();
    
    for (const forecastItem of forecastCC.lineItems) {
      const key = `${forecastCC.id}::${forecastItem.id}`;
      const actualsItem = actualsLineItemMap.get(key);
      
      const forecastValues = forecastItem.forecastValues || createZeroMonthlyValues();
      const actualsValues = actualsItem?.actualByMonth || createZeroMonthlyValues();
      
      const forecastTotal = calculateFYTotal(forecastValues);
      const actualsTotal = actualsItem?.actualTotal || 0;
      const variance = actualsTotal - forecastTotal;
      
      let status: 'matched' | 'forecast_only' | 'actuals_only';
      if (actualsItem) {
        status = 'matched';
        matchedActualsKeys.add(key);
      } else {
        status = 'forecast_only';
      }
      
      lineItems.push({
        costCenterId: forecastCC.id,
        costCenterName: forecastCC.name,
        lineItemId: forecastItem.id,
        name: forecastItem.name,
        vendorName: forecastItem.vendor?.name,
        isContracted: forecastItem.isContracted || false,
        forecastByMonth: forecastValues,
        actualsByMonth: actualsValues,
        varianceByMonth: computeVarianceByMonth(forecastValues, actualsValues),
        forecastTotal,
        actualsTotal,
        variance,
        variancePct: computeVariancePct(variance, forecastTotal),
        status,
      });
      
      ccForecastTotal += forecastTotal;
      ccActualsTotal += actualsTotal;
    }
    
    // Add actuals-only line items (in forecast's cost center)
    for (const actualsLI of actualsRollup.lineItems) {
      if (actualsLI.costCenterId !== forecastCC.id) continue;
      
      const key = `${actualsLI.costCenterId}::${actualsLI.lineItemId}`;
      if (matchedActualsKeys.has(key)) continue;
      
      const actualsValues = actualsLI.actualByMonth;
      
      lineItems.push({
        costCenterId: forecastCC.id,
        costCenterName: forecastCC.name,
        lineItemId: actualsLI.lineItemId,
        name: actualsLI.lineItemName,
        vendorName: actualsLI.vendorName,
        isContracted: false,
        forecastByMonth: createZeroMonthlyValues(),
        actualsByMonth: actualsValues,
        varianceByMonth: actualsValues, // variance = actuals - 0
        forecastTotal: 0,
        actualsTotal: actualsLI.actualTotal,
        variance: actualsLI.actualTotal,
        variancePct: null, // forecastTotal is 0
        status: 'actuals_only',
      });
      
      ccActualsTotal += actualsLI.actualTotal;
    }
    
    const ccVariance = ccActualsTotal - ccForecastTotal;
    
    costCenters.push({
      costCenterId: forecastCC.id,
      costCenterName: forecastCC.name,
      forecastTotal: ccForecastTotal,
      actualsTotal: ccActualsTotal,
      variance: ccVariance,
      variancePct: computeVariancePct(ccVariance, ccForecastTotal),
      lineItems,
    });
    
    grandForecastTotal += ccForecastTotal;
    grandActualsTotal += ccActualsTotal;
  }
  
  // Handle cost centers that exist ONLY in actuals (not in forecast)
  const forecastCCIds = new Set(forecastCCs.map(cc => cc.id));
  const actualsOnlyCCIds = new Set<string>();
  
  for (const ccId of actualsCostCenterIds) {
    if (!forecastCCIds.has(ccId)) {
      actualsOnlyCCIds.add(ccId);
    }
  }
  
  // Group actuals-only items by their cost center
  for (const ccId of actualsOnlyCCIds) {
    const ccLineItems = actualsRollup.lineItems.filter(li => li.costCenterId === ccId);
    if (ccLineItems.length === 0) continue;
    
    const ccName = ccLineItems[0].costCenterName;
    const lineItems: ForecastActualsLineItemRow[] = [];
    let ccActualsTotal = 0;
    
    for (const actualsLI of ccLineItems) {
      lineItems.push({
        costCenterId: ccId,
        costCenterName: ccName,
        lineItemId: actualsLI.lineItemId,
        name: actualsLI.lineItemName,
        vendorName: actualsLI.vendorName,
        isContracted: false,
        forecastByMonth: createZeroMonthlyValues(),
        actualsByMonth: actualsLI.actualByMonth,
        varianceByMonth: actualsLI.actualByMonth,
        forecastTotal: 0,
        actualsTotal: actualsLI.actualTotal,
        variance: actualsLI.actualTotal,
        variancePct: null,
        status: 'actuals_only',
      });
      
      ccActualsTotal += actualsLI.actualTotal;
    }
    
    costCenters.push({
      costCenterId: ccId,
      costCenterName: ccName,
      forecastTotal: 0,
      actualsTotal: ccActualsTotal,
      variance: ccActualsTotal,
      variancePct: null,
      lineItems,
    });
    
    grandActualsTotal += ccActualsTotal;
  }
  
  const grandVariance = grandActualsTotal - grandForecastTotal;
  
  return {
    costCenters,
    totals: {
      forecastTotal: grandForecastTotal,
      actualsTotal: grandActualsTotal,
      variance: grandVariance,
      variancePct: computeVariancePct(grandVariance, grandForecastTotal),
    },
  };
}
