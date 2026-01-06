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

export function formatAuditTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
