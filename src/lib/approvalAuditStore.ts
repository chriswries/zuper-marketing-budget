import {
  ApprovalEntityType,
  ApprovalAuditEvent,
  ApprovalAuditAction,
  ApprovalActorRole,
  ApprovalStepLevel,
} from '@/types/approvalAudit';

const STORAGE_KEY = 'approval_audit_v1';

interface AuditStore {
  request: Record<string, ApprovalAuditEvent[]>;
  budget: Record<string, ApprovalAuditEvent[]>;
}

function loadStore(): AuditStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        request: parsed.request ?? {},
        budget: parsed.budget ?? {},
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { request: {}, budget: {} };
}

function saveStore(store: AuditStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function loadApprovalAudit(
  entityType: ApprovalEntityType,
  entityId: string
): ApprovalAuditEvent[] {
  const store = loadStore();
  return store[entityType][entityId] ?? [];
}

export function appendApprovalAudit(
  entityType: ApprovalEntityType,
  entityId: string,
  event: Omit<ApprovalAuditEvent, 'id' | 'entityType' | 'entityId' | 'timestamp'>
): ApprovalAuditEvent {
  const store = loadStore();
  
  const fullEvent: ApprovalAuditEvent = {
    id: crypto.randomUUID(),
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    ...event,
  };

  if (!store[entityType][entityId]) {
    store[entityType][entityId] = [];
  }
  store[entityType][entityId].unshift(fullEvent);
  
  // Keep max 50 events per entity
  store[entityType][entityId] = store[entityType][entityId].slice(0, 50);
  
  saveStore(store);
  dispatchAuditUpdated();
  return fullEvent;
}

export function ensureCreatedEventIfMissing(
  entityType: ApprovalEntityType,
  entityId: string,
  createdAtIso: string,
  actorRole: ApprovalActorRole,
  meta?: Record<string, unknown>
): void {
  const existing = loadApprovalAudit(entityType, entityId);
  const hasCreated = existing.some((e) => e.action === 'created');
  
  if (!hasCreated) {
    const store = loadStore();
    
    const createdEvent: ApprovalAuditEvent = {
      id: crypto.randomUUID(),
      entityType,
      entityId,
      action: 'created',
      timestamp: createdAtIso,
      actorRole,
      meta,
    };

    if (!store[entityType][entityId]) {
      store[entityType][entityId] = [];
    }
    // Add created event at the end (oldest)
    store[entityType][entityId].push(createdEvent);
    
    saveStore(store);
  }
}

// Format helpers
const actionLabels: Record<ApprovalAuditAction, string> = {
  created: 'Created',
  submitted_for_approval: 'Submitted for approval',
  approved_step: 'Approved',
  rejected_step: 'Rejected',
  reset: 'Reset to draft',
  final_approved: 'Fully approved',
  notified_next_approver: 'Notification copied',
  admin_override_cell_edit: 'Admin override: cell edit',
  admin_override_delete_line_item: 'Admin override: delete line item',
  admin_override_cancel_linked_request: 'Admin override: cancel linked request',
  admin_override_force_cancel: 'Admin override: force cancel',
  admin_override_force_approve: 'Admin override: force approve',
  admin_override_force_reject: 'Admin override: force reject',
  admin_override_soft_delete: 'Admin override: soft delete',
  fy_archived: 'Fiscal year archived',
  fy_restored: 'Fiscal year restored',
  fy_hard_deleted: 'Fiscal year hard deleted',
  fy_bundle_imported: 'Fiscal year bundle imported',
};

const roleLabels: Record<ApprovalActorRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

const stepLabels: Record<ApprovalStepLevel, string> = {
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

export function formatAuditEvent(event: ApprovalAuditEvent): string {
  const roleLabel = roleLabels[event.actorRole];
  const actionLabel = actionLabels[event.action];
  
  if (event.action === 'approved_step' || event.action === 'rejected_step') {
    const stepLabel = event.stepLevel ? stepLabels[event.stepLevel] : '';
    return `${roleLabel} ${actionLabel.toLowerCase()} ${stepLabel} step`;
  }
  
  if (event.action === 'notified_next_approver' && event.meta) {
    const channel = event.meta.channel === 'slack' ? 'Slack' : 'Email';
    const part = event.meta.part === 'message' ? 'message' : event.meta.part === 'subject' ? 'subject' : 'body';
    const stepLabel = event.stepLevel ? stepLabels[event.stepLevel] : '';
    return `${roleLabel} copied ${channel} ${part} for ${stepLabel} step`;
  }
  
  return `${roleLabel} ${actionLabel.toLowerCase()}`;
}

// Re-export centralized formatAuditTimestamp for backward compatibility
export { formatAuditTimestamp } from '@/lib/dateTime';

// Global loader for all audit events across all entities
export function loadAllApprovalAuditEvents(): ApprovalAuditEvent[] {
  const store = loadStore();
  const allEvents: ApprovalAuditEvent[] = [];

  // Flatten request events
  for (const entityId of Object.keys(store.request)) {
    allEvents.push(...store.request[entityId]);
  }

  // Flatten budget events
  for (const entityId of Object.keys(store.budget)) {
    allEvents.push(...store.budget[entityId]);
  }

  // Sort by timestamp descending (newest first)
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return allEvents;
}

// Custom event for same-tab updates
export const APPROVAL_AUDIT_UPDATED_EVENT = 'approval-audit-updated';

function dispatchAuditUpdated(): void {
  window.dispatchEvent(new CustomEvent(APPROVAL_AUDIT_UPDATED_EVENT));
}

/**
 * Remove all audit events for a specific entity.
 */
export function removeApprovalAuditForEntity(
  entityType: ApprovalEntityType,
  entityId: string
): void {
  const store = loadStore();
  delete store[entityType][entityId];
  saveStore(store);
  dispatchAuditUpdated();
}

/**
 * Replace all audit events for a specific entity (used by bundle import).
 */
export function replaceApprovalAuditForEntity(
  entityType: ApprovalEntityType,
  entityId: string,
  events: ApprovalAuditEvent[]
): void {
  const store = loadStore();
  store[entityType][entityId] = events;
  saveStore(store);
  dispatchAuditUpdated();
}
