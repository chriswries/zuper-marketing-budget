import { MonthlyValues, MONTHS } from '@/types/budget';

export interface ApprovalThresholdSettings {
  increaseApprovalAbsoluteUsd: number;
  increaseApprovalPercent: number;
}

const DEFAULT_SETTINGS: ApprovalThresholdSettings = {
  increaseApprovalAbsoluteUsd: 5000,
  increaseApprovalPercent: 5,
};

/**
 * Calculate FY total from monthly values
 */
export function calculateFYTotal(values: MonthlyValues): number {
  return MONTHS.reduce((sum, month) => sum + (values[month] || 0), 0);
}

/**
 * Get the approval threshold for a given old total
 * Returns: max(absoluteUsd, oldTotal * (percent / 100))
 */
export function getIncreaseApprovalThreshold(
  oldTotal: number,
  settings: ApprovalThresholdSettings = DEFAULT_SETTINGS
): number {
  return Math.max(
    settings.increaseApprovalAbsoluteUsd,
    oldTotal * (settings.increaseApprovalPercent / 100)
  );
}

/**
 * Determine if an increase triggers approval workflow
 * Threshold: max(absoluteUsd, percent% of old FY total)
 * Only increases trigger approvals (decreases do not)
 */
export function shouldTriggerIncreaseApproval(
  oldTotal: number,
  newTotal: number,
  settings: ApprovalThresholdSettings = DEFAULT_SETTINGS
): boolean {
  if (newTotal <= oldTotal) return false;
  
  const delta = newTotal - oldTotal;
  const threshold = getIncreaseApprovalThreshold(oldTotal, settings);
  
  return delta > threshold;
}
