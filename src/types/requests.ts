import { Month } from './budget';

export type ApprovalLevel = 'manager' | 'cmo' | 'finance';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalStep {
  level: ApprovalLevel;
  status: ApprovalStatus;
  updatedAt?: string;
  comment?: string;
}

export type OriginSheet = 'budget' | 'forecast';
export type OriginKind = 'new_line_item' | 'adjustment' | 'cancel_request' | 'delete_line_item';

export interface SpendRequest {
  id: string;
  costCenterId: string;
  costCenterName: string;
  vendorName: string;
  amount: number;
  startMonth: Month;
  endMonth: Month;
  isContracted: boolean;
  justification: string;
  status: RequestStatus;
  createdAt: string;
  approvalSteps: ApprovalStep[];
  // Origin metadata for deep linking
  originSheet?: OriginSheet;
  originFiscalYearId?: string | null;
  originCostCenterId?: string;
  originLineItemId?: string;
  originKind?: OriginKind;
  // Line item name for display
  lineItemName?: string;
  // For cancel_request: the request being cancelled
  targetRequestId?: string;
  // Snapshot of target request for restore if cancel_request is rejected
  targetRequestSnapshot?: { status: RequestStatus; approvalSteps: ApprovalStep[] };
  // For delete_line_item: track pending deletion
  deletionPending?: boolean;
  // Soft delete fields (admin override)
  deletedAt?: string;
  deletedByRole?: string;
  deletedJustification?: string;
  // For adjustment requests: original and revised FY totals (threshold-triggered increases)
  currentAmount?: number;
  revisedAmount?: number;
}

export function createDefaultApprovalSteps(): ApprovalStep[] {
  return [
    { level: 'manager', status: 'pending' },
    { level: 'cmo', status: 'pending' },
    { level: 'finance', status: 'pending' },
  ];
}

// For cancel/delete requests initiated by manager, starts at CMO
export function createCMOApprovalSteps(): ApprovalStep[] {
  return [
    { level: 'cmo', status: 'pending' },
    { level: 'finance', status: 'pending' },
  ];
}

// Get display label for request kind
export function getRequestKindLabel(kind: OriginKind | undefined): string {
  switch (kind) {
    case 'new_line_item':
      return 'New Line Item';
    case 'adjustment':
      return 'Adjustment';
    case 'cancel_request':
      return 'Cancel Request';
    case 'delete_line_item':
      return 'Delete Line Item';
    default:
      return 'Spend Request';
  }
}
