import { Month } from './budget';

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO string
  userName: string;
  sheet: 'forecast';
  costCenterId: string;
  costCenterName: string;
  lineItemId: string;
  lineItemName: string;
  month: Month;
  oldValue: number;
  newValue: number;
}
