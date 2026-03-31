export type ApprovalEntityType = 'request' | 'budget' | 'vendor_registry';

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
  | 'fy_hard_deleted'
  | 'fy_bundle_imported'
  | 'budget_cell_edit'
  // Vendor registry actions
  | 'vendor_created'
  | 'vendor_updated'
  | 'vendor_deactivated'
  | 'vendor_alias_created'
  | 'vendor_alias_updated'
  | 'vendor_alias_deactivated';

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
