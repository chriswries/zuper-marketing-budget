import { Month } from './budget';

export type ApprovalLevel = 'manager' | 'cmo' | 'finance';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalStep {
  level: ApprovalLevel;
  status: ApprovalStatus;
  updatedAt?: string;
  comment?: string;
}

export type OriginSheet = 'budget' | 'forecast';
export type OriginKind = 'new_line_item' | 'adjustment';

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
}

export function createDefaultApprovalSteps(): ApprovalStep[] {
  return [
    { level: 'manager', status: 'pending' },
    { level: 'cmo', status: 'pending' },
    { level: 'finance', status: 'pending' },
  ];
}
