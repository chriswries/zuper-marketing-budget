// Fiscal year runs Feb → Jan
export const MONTHS = [
  'feb', 'mar', 'apr', 'may', 'jun', 'jul',
  'aug', 'sep', 'oct', 'nov', 'dec', 'jan'
] as const;

export type Month = typeof MONTHS[number];

export const MONTH_LABELS: Record<Month, string> = {
  feb: 'Feb',
  mar: 'Mar',
  apr: 'Apr',
  may: 'May',
  jun: 'Jun',
  jul: 'Jul',
  aug: 'Aug',
  sep: 'Sep',
  oct: 'Oct',
  nov: 'Nov',
  dec: 'Dec',
  jan: 'Jan',
};

export type FiscalYearStatus = 'planning' | 'active' | 'closed';

export interface FiscalYear {
  id: string;
  name: string; // e.g., "FY25" (Feb 2025 - Jan 2026)
  startDate: string; // ISO date
  endDate: string; // ISO date
  status: FiscalYearStatus;
  totalBudgetLimit: number;
}

export interface Vendor {
  id: string;
  name: string;
  aliases?: string[]; // For import normalization
}

export type MonthlyValues = Record<Month, number>;

export interface LineItem {
  id: string;
  costCenterId: string;
  name: string;
  vendor: Vendor | null;
  ownerId: string | null; // User ID of owner
  isContracted: boolean;
  isAccrual: boolean;
  isSoftwareSubscription: boolean;
  contractStartDate?: string;
  contractEndDate?: string;
  autoRenew?: boolean;
  cancellationNoticeDays?: number;
  budgetValues: MonthlyValues; // Original budget (locked)
  forecastValues: MonthlyValues; // Editable forecast
  actualValues: MonthlyValues; // From imports
  // Approval tracking for NEW line items (rejected = remove item)
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalRequestId?: string;
  // Adjustment tracking for EXISTING line items (rejected = revert values)
  adjustmentStatus?: 'pending';
  adjustmentRequestId?: string;
  adjustmentBeforeValues?: MonthlyValues;
  adjustmentSheet?: 'budget' | 'forecast';
  // Deletion tracking
  deletionStatus?: 'pending';
  deletionRequestId?: string;
  // Cancellation tracking (for the line item's pending request)
  cancellationStatus?: 'pending';
  cancellationRequestId?: string;
}

export interface CostCenter {
  id: string;
  name: string;
  ownerId: string | null; // User ID of owner
  annualLimit: number;
  monthlyLimits?: Partial<MonthlyValues>; // Optional per-month limits
  lineItems: LineItem[];
}

// Helper to calculate FY total from monthly values
export function calculateFYTotal(values: MonthlyValues): number {
  return MONTHS.reduce((sum, month) => sum + (values[month] || 0), 0);
}

// Helper to calculate cost center rollup
export function calculateCostCenterRollup(
  lineItems: LineItem[],
  valueType: 'budgetValues' | 'forecastValues' | 'actualValues'
): MonthlyValues {
  const rollup: MonthlyValues = {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
  
  for (const item of lineItems) {
    for (const month of MONTHS) {
      rollup[month] += item[valueType][month] || 0;
    }
  }
  
  return rollup;
}
