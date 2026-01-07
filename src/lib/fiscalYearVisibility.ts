/**
 * Helper for filtering fiscal years by archived status.
 * Used across all FY selectors in the app.
 */

import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

/**
 * Filter fiscal years based on showArchived setting.
 * When showArchived is false (default), archived FYs are hidden.
 */
export function getVisibleFiscalYears(
  fiscalYears: FiscalYearBudget[],
  showArchived: boolean
): FiscalYearBudget[] {
  if (showArchived) {
    return fiscalYears;
  }
  return fiscalYears.filter(fy => fy.status !== 'archived');
}
