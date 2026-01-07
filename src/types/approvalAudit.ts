export type ApprovalEntityType = 'request' | 'budget';

export type ApprovalAuditAction =
  | 'created'
  | 'submitted_for_approval'
  | 'approved_step'
  | 'rejected_step'
  | 'reset'
  | 'final_approved'
  | 'notified_next_approver'
  | 'admin_override_cell_edit'
  | 'admin_override_delete_line_item'
  | 'admin_override_cancel_linked_request'
  | 'admin_override_force_cancel'
  | 'admin_override_force_approve'
  | 'admin_override_force_reject'
  | 'admin_override_soft_delete'
  | 'fy_archived'
  | 'fy_restored'
  | 'fy_hard_deleted';

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
