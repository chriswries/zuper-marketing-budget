/**
 * Actuals rollup computation.
 * Maps transactions to months and aggregates by cost center / line item.
 */

import type { Month, MONTHS } from '@/types/budget';
import { createZeroMonthlyValues } from '@/types/budget';
import type { ActualsTransaction } from '@/types/actuals';
import type { TransactionMatch } from './actualsMatchingStore';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

// Month keys used in the app (calendar month -> key)
const CALENDAR_MONTH_TO_KEY: Record<number, Month> = {
  0: 'jan',  // January
  1: 'feb',  // February
  2: 'mar',  // March
  3: 'apr',  // April
  4: 'may',  // May
  5: 'jun',  // June
  6: 'jul',  // July
  7: 'aug',  // August
  8: 'sep',  // September
  9: 'oct',  // October
  10: 'nov', // November
  11: 'dec', // December
};

/**
 * Convert date string (YYYY-MM-DD or ISO) to month key (jan, feb, etc.)
 * Parses the month directly from the string to avoid timezone shifts.
 */
export function isoDateToMonthKey(isoDate: string): Month {
  // Extract YYYY-MM-DD portion (handles both "2027-01-31" and "2027-01-31T17:00:00Z")
  const datePart = isoDate.split('T')[0];
  const monthNum = parseInt(datePart.split('-')[1], 10); // 1-12
  return CALENDAR_MONTH_TO_KEY[monthNum - 1];
}

export interface CostCenterRollup {
  costCenterId: string;
  costCenterName: string;
  actualByMonth: Record<Month, number>;
  actualTotal: number;
}

export interface LineItemRollup {
  costCenterId: string;
  costCenterName: string;
  lineItemId: string;
  lineItemName: string;
  vendorName?: string;
  actualByMonth: Record<Month, number>;
  actualTotal: number;
}

export interface RollupSummary {
  matchedCount: number;
  matchedTotal: number;
  unmatchedCount: number;
  unmatchedTotal: number;
  orphanedMatchCount: number; // Matches pointing to deleted CC/LI
}

export interface ActualsRollupResult {
  costCenters: CostCenterRollup[];
  lineItems: LineItemRollup[];
  summary: RollupSummary;
}

interface BuildActualsRollupArgs {
  fiscalYearId: string;
  fiscalYear: FiscalYearBudget;
  transactions: ActualsTransaction[];
  matchesByTxnId: Record<string, TransactionMatch>;
}

/**
 * Build actuals rollup from transactions and matches.
 */
export function buildActualsRollup(args: BuildActualsRollupArgs): ActualsRollupResult {
  const { fiscalYear, transactions, matchesByTxnId } = args;

  // Build lookup maps for cost centers and line items
  const costCenterMap = new Map<string, { name: string; lineItems: Map<string, { name: string; vendorName?: string }> }>();
  
  for (const cc of fiscalYear.costCenters) {
    const lineItemMap = new Map<string, { name: string; vendorName?: string }>();
    for (const li of cc.lineItems) {
      lineItemMap.set(li.id, { name: li.name, vendorName: li.vendor?.name });
    }
    costCenterMap.set(cc.id, { name: cc.name, lineItems: lineItemMap });
  }

  // Initialize rollup accumulators
  // Use composite key for lineItemRollups to avoid collisions
  const lineItemRollups = new Map<string, LineItemRollup>();
  const costCenterRollups = new Map<string, CostCenterRollup>();

  let matchedCount = 0;
  let matchedTotal = 0;
  let unmatchedCount = 0;
  let unmatchedTotal = 0;
  let orphanedMatchCount = 0;

  for (const txn of transactions) {
    const match = matchesByTxnId[txn.id];

    if (!match) {
      unmatchedCount++;
      unmatchedTotal += txn.amount;
      continue;
    }

    const { costCenterId, lineItemId } = match;

    // Get cost center and line item info BEFORE counting as matched
    const ccInfo = costCenterMap.get(costCenterId);
    const liInfo = ccInfo?.lineItems.get(lineItemId);

    if (!ccInfo || !liInfo) {
      // Invalid match (orphaned reference) - treat as UNMATCHED, not "dropped"
      console.warn(`Orphaned match for txn ${txn.id}: CC=${costCenterId}, LI=${lineItemId}`);
      orphanedMatchCount++;
      unmatchedCount++;
      unmatchedTotal += txn.amount;
      continue;
    }

    // Valid match - now count it
    matchedCount++;
    matchedTotal += txn.amount;

    const monthKey = isoDateToMonthKey(txn.txnDate);

    // Use composite key to prevent collisions across cost centers
    const lineItemKey = `${costCenterId}::${lineItemId}`;

    // Update line item rollup
    if (!lineItemRollups.has(lineItemKey)) {
      lineItemRollups.set(lineItemKey, {
        costCenterId,
        costCenterName: ccInfo.name,
        lineItemId,
        lineItemName: liInfo.name,
        vendorName: liInfo.vendorName,
        actualByMonth: createZeroMonthlyValues(),
        actualTotal: 0,
      });
    }
    const liRollup = lineItemRollups.get(lineItemKey)!;
    liRollup.actualByMonth[monthKey] += txn.amount;
    liRollup.actualTotal += txn.amount;

    // Update cost center rollup
    if (!costCenterRollups.has(costCenterId)) {
      costCenterRollups.set(costCenterId, {
        costCenterId,
        costCenterName: ccInfo.name,
        actualByMonth: createZeroMonthlyValues(),
        actualTotal: 0,
      });
    }
    const ccRollup = costCenterRollups.get(costCenterId)!;
    ccRollup.actualByMonth[monthKey] += txn.amount;
    ccRollup.actualTotal += txn.amount;
  }

  return {
    costCenters: Array.from(costCenterRollups.values()),
    lineItems: Array.from(lineItemRollups.values()),
    summary: {
      matchedCount,
      matchedTotal,
      unmatchedCount,
      unmatchedTotal,
      orphanedMatchCount,
    },
  };
}
