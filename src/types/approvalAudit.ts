export type ApprovalEntityType = 'request' | 'budget';

export type ApprovalAuditAction =
  | 'created'
  | 'submitted_for_approval'
  | 'approved_step'
  | 'rejected_step'
  | 'reset'
  | 'final_approved'
  | 'notified_next_approver';

export type ApprovalActorRole = 'admin' | 'manager' | 'cmo' | 'finance';

export type ApprovalStepLevel = 'manager' | 'cmo' | 'finance';

export interface ApprovalAuditEvent {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  action: ApprovalAuditAction;
  timestamp: string; // ISO
  actorRole: ApprovalActorRole;
  stepLevel?: ApprovalStepLevel;
  note?: string;
  meta?: Record<string, unknown>;
}
