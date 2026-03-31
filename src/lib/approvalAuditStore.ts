import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import {
  ApprovalEntityType,
  ApprovalAuditEvent,
  ApprovalAuditAction,
  ApprovalActorRole,
  ApprovalStepLevel,
} from '@/types/approvalAudit';
import type { Json } from '@/integrations/supabase/types';

// Cache TTL: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHED_ENTITIES = 20;

interface CacheEntry {
  data: ApprovalAuditEvent[];
  loadedAt: number;
}

// Custom event for same-tab updates
export const APPROVAL_AUDIT_UPDATED_EVENT = 'approval-audit-updated';

function dispatchAuditUpdated(): void {
  window.dispatchEvent(new CustomEvent(APPROVAL_AUDIT_UPDATED_EVENT));
}

// Map DB row to ApprovalAuditEvent
function rowToEvent(row: {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_role: string | null;
  note: string | null;
  meta: Json | null;
  created_at: string;
}): ApprovalAuditEvent {
  return {
    id: row.id,
    entityType: row.entity_type as ApprovalEntityType,
    entityId: row.entity_id,
    action: row.action as ApprovalAuditAction,
    timestamp: row.created_at,
    actorRole: row.actor_role as ApprovalActorRole,
    stepLevel: (row.meta as Record<string, unknown> | null)?.stepLevel as ApprovalStepLevel | undefined,
    note: row.note ?? undefined,
    meta: row.meta as Record<string, unknown> | undefined,
  };
}

// Evict oldest entries when cache exceeds max size
function evictIfNeeded(): void {
  const keys = Object.keys(cachedEvents);
  if (keys.length <= MAX_CACHED_ENTITIES) return;

  // Sort by loadedAt ascending, evict oldest
  const sorted = keys
    .map((k) => ({ key: k, loadedAt: cachedEvents[k].loadedAt }))
    .sort((a, b) => a.loadedAt - b.loadedAt);

  const toEvict = sorted.length - MAX_CACHED_ENTITIES;
  for (let i = 0; i < toEvict; i++) {
    delete cachedEvents[sorted[i].key];
  }
}

// Load audit events for a specific entity
export async function loadApprovalAudit(
  entityType: ApprovalEntityType,
  entityId: string
): Promise<ApprovalAuditEvent[]> {
  const { data, error } = await supabase
    .from('approval_audit_events')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to load approval audit:', error);
    return [];
  }

  const events = (data || []).map(rowToEvent);
  const key = `${entityType}:${entityId}`;
  cachedEvents[key] = { data: events, loadedAt: Date.now() };
  evictIfNeeded();
  return events;
}

// Synchronous version that returns cached data or empty array
let cachedEvents: Record<string, CacheEntry> = {};

export function loadApprovalAuditSync(
  entityType: ApprovalEntityType,
  entityId: string
): ApprovalAuditEvent[] {
  const key = `${entityType}:${entityId}`;
  const entry = cachedEvents[key];
  if (entry) {
    if (Date.now() - entry.loadedAt > CACHE_TTL) {
      // Stale — trigger background refresh
      loadApprovalAudit(entityType, entityId).catch(logger.error);
    }
    return entry.data;
  }
  return [];
}

// Append a new audit event
export async function appendApprovalAudit(
  entityType: ApprovalEntityType,
  entityId: string,
  event: Omit<ApprovalAuditEvent, 'id' | 'entityType' | 'entityId' | 'timestamp'>
): Promise<ApprovalAuditEvent> {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const { stepLevel, ...eventRest } = event;
  const meta = { ...event.meta, stepLevel } as Record<string, unknown>;

  const { data, error } = await supabase
    .from('approval_audit_events')
    .insert({
      id,
      entity_type: entityType,
      entity_id: entityId,
      action: event.action,
      actor_role: event.actorRole,
      note: event.note ?? null,
      meta: meta as Json,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to append approval audit:', error);
  }

  const fullEvent: ApprovalAuditEvent = {
    id,
    entityType,
    entityId,
    timestamp,
    ...event,
  };

  // Update cache
  const key = `${entityType}:${entityId}`;
  if (!cachedEvents[key]) {
    cachedEvents[key] = { data: [], loadedAt: Date.now() };
    evictIfNeeded();
  }
  cachedEvents[key].data.unshift(fullEvent);
  cachedEvents[key].loadedAt = Date.now();

  dispatchAuditUpdated();
  return fullEvent;
}

// Ensure a "created" event exists for an entity
export async function ensureCreatedEventIfMissing(
  entityType: ApprovalEntityType,
  entityId: string,
  createdAtIso: string,
  actorRole: ApprovalActorRole,
  meta?: Record<string, unknown>
): Promise<void> {
  const existing = await loadApprovalAudit(entityType, entityId);
  const hasCreated = existing.some((e) => e.action === 'created');

  if (!hasCreated) {
    const id = crypto.randomUUID();
    await supabase
      .from('approval_audit_events')
      .insert({
        id,
        entity_type: entityType,
        entity_id: entityId,
        action: 'created',
        actor_role: actorRole,
        note: null,
        meta: (meta ?? {}) as Json,
        created_at: createdAtIso,
      });

    // Update cache
    const key = `${entityType}:${entityId}`;
    cachedEvents[key] = {
      data: [...existing, {
        id,
        entityType,
        entityId,
        action: 'created' as ApprovalAuditAction,
        timestamp: createdAtIso,
        actorRole,
        meta,
      }],
      loadedAt: Date.now(),
    };
    evictIfNeeded();
  } else {
    // Update cache
    const key = `${entityType}:${entityId}`;
    cachedEvents[key] = { data: existing, loadedAt: Date.now() };
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
  admin_override_cell_edit: 'Admin line item edit',
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
  budget_cell_edit: 'Budget cell edit',
  // Vendor registry actions
  vendor_created: 'Vendor created',
  vendor_updated: 'Vendor updated',
  vendor_deactivated: 'Vendor deactivated',
  vendor_alias_created: 'Vendor alias created',
  vendor_alias_updated: 'Vendor alias updated',
  vendor_alias_deactivated: 'Vendor alias deactivated',
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
  const actionLabel = actionLabels[event.action] ?? event.action;

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

  // For admin line item edits, include the note which has the line item name and changes
  if (event.action === 'admin_override_cell_edit' && event.note) {
    return `${actionLabel}: ${event.note}`;
  }

  return `${roleLabel} ${actionLabel.toLowerCase()}`;
}

// Re-export centralized formatAuditTimestamp for backward compatibility
export { formatAuditTimestamp } from '@/lib/dateTime';

// Global loader for all audit events across all entities
export async function loadAllApprovalAuditEvents(): Promise<ApprovalAuditEvent[]> {
  const { data, error } = await supabase
    .from('approval_audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.error('Failed to load all approval audit events:', error);
    return [];
  }

  return (data || []).map(rowToEvent);
}

// Remove all audit events for a specific entity (admin only)
export async function removeApprovalAuditForEntity(
  entityType: ApprovalEntityType,
  entityId: string
): Promise<void> {
  const { error } = await supabase
    .from('approval_audit_events')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (error) {
    logger.error('Failed to remove approval audit for entity:', error);
  }

  // Clear cache
  const key = `${entityType}:${entityId}`;
  delete cachedEvents[key];

  dispatchAuditUpdated();
}

// Replace all audit events for a specific entity (used by bundle import, admin only)
export async function replaceApprovalAuditForEntity(
  entityType: ApprovalEntityType,
  entityId: string,
  events: ApprovalAuditEvent[]
): Promise<void> {
  // Delete existing
  await supabase
    .from('approval_audit_events')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  // Insert new events
  if (events.length > 0) {
    const rows = events.map((e) => ({
      id: e.id,
      entity_type: entityType,
      entity_id: entityId,
      action: e.action,
      actor_role: e.actorRole,
      note: e.note ?? null,
      meta: ({ ...e.meta, stepLevel: e.stepLevel }) as Json,
      created_at: e.timestamp,
    }));

    const { error } = await supabase
      .from('approval_audit_events')
      .insert(rows);

    if (error) {
      logger.error('Failed to replace approval audit for entity:', error);
    }
  }

  // Update cache
  const key = `${entityType}:${entityId}`;
  cachedEvents[key] = { data: events, loadedAt: Date.now() };
  evictIfNeeded();

  dispatchAuditUpdated();
}
