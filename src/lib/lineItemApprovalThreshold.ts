import { MonthlyValues, MONTHS } from '@/types/budget';

/**
 * Calculate FY total from monthly values
 */
export function calculateFYTotal(values: MonthlyValues): number {
  return MONTHS.reduce((sum, month) => sum + (values[month] || 0), 0);
}

/**
 * Determine if an increase triggers approval workflow
 * Threshold: max($5,000, 5% of old FY total)
 * Only increases trigger approvals (decreases do not)
 */
export function shouldTriggerIncreaseApproval(oldTotal: number, newTotal: number): boolean {
  if (newTotal <= oldTotal) return false;
  
  const delta = newTotal - oldTotal;
  const threshold = Math.max(5000, oldTotal * 0.05);
  
  return delta > threshold;
}
