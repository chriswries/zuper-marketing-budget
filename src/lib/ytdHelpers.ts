/**
 * YTD (Year-to-Date) calculation helpers for variance reports.
 * Provides utilities to sum monthly values through a specified month.
 */

import { MONTHS, Month, MonthlyValues } from '@/types/budget';

export type ScopeMode = 'fy' | 'ytd';

/**
 * Get the index of a month in the fiscal year order (Feb=0, Jan=11).
 */
export function getMonthIndex(month: Month): number {
  return MONTHS.indexOf(month);
}

/**
 * Sum monthly values from Feb through the specified asOfMonth (inclusive).
 * @param values Monthly values object
 * @param asOfMonth The last month to include in the sum
 * @returns Sum of values from Feb through asOfMonth
 */
export function sumYTD(values: MonthlyValues, asOfMonth: Month): number {
  const endIndex = getMonthIndex(asOfMonth);
  let total = 0;
  for (let i = 0; i <= endIndex; i++) {
    total += values[MONTHS[i]] || 0;
  }
  return total;
}

/**
 * Get the current fiscal month based on today's date.
 * Fiscal year runs Feb (month 0) → Jan (month 11).
 * Returns the current month key.
 */
export function getCurrentFiscalMonth(): Month {
  const now = new Date();
  const calendarMonth = now.getMonth(); // 0 = Jan, 1 = Feb, etc.
  
  // Map calendar month to fiscal month key
  // Jan (0) -> 'jan', Feb (1) -> 'feb', etc.
  const calendarToFiscal: Record<number, Month> = {
    0: 'jan',  // January is last month of FY
    1: 'feb',
    2: 'mar',
    3: 'apr',
    4: 'may',
    5: 'jun',
    6: 'jul',
    7: 'aug',
    8: 'sep',
    9: 'oct',
    10: 'nov',
    11: 'dec',
  };
  
  return calendarToFiscal[calendarMonth];
}

/**
 * Find the latest month with any actuals data.
 * Iterates through months in fiscal order and returns the last one with data.
 * @param actualsByMonth Monthly actuals object
 * @returns The latest month with actuals, or null if none
 */
export function getLatestActualsMonth(actualsByMonth: MonthlyValues): Month | null {
  let latestMonth: Month | null = null;
  
  for (const month of MONTHS) {
    if ((actualsByMonth[month] || 0) !== 0) {
      latestMonth = month;
    }
  }
  
  return latestMonth;
}

/**
 * Find the latest month with any actuals across all line items in a report.
 * @param lineItemsActualsByMonth Array of MonthlyValues from line items
 * @returns The latest month with any actuals, or null if none
 */
export function getLatestActualsMonthFromLineItems(
  lineItemsActualsByMonth: MonthlyValues[]
): Month | null {
  let latestMonthIndex = -1;
  
  for (const actualsByMonth of lineItemsActualsByMonth) {
    for (let i = 0; i < MONTHS.length; i++) {
      const month = MONTHS[i];
      if ((actualsByMonth[month] || 0) !== 0 && i > latestMonthIndex) {
        latestMonthIndex = i;
      }
    }
  }
  
  return latestMonthIndex >= 0 ? MONTHS[latestMonthIndex] : null;
}

/**
 * Compute YTD variance by month (only include months up to asOfMonth).
 * @param varianceByMonth Full variance by month
 * @param asOfMonth The last month to include
 * @returns Filtered variance by month (months after asOfMonth are 0)
 */
export function getYTDVarianceByMonth(
  varianceByMonth: MonthlyValues,
  asOfMonth: Month
): MonthlyValues {
  const endIndex = getMonthIndex(asOfMonth);
  const result: MonthlyValues = {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
  
  for (let i = 0; i <= endIndex; i++) {
    result[MONTHS[i]] = varianceByMonth[MONTHS[i]] || 0;
  }
  
  return result;
}
