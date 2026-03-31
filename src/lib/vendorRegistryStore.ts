import { logger } from '@/lib/logger';
/**
 * Global Canonical Vendor Registry Store
 * 
 * Manages canonical vendors and their aliases (global, not FY-scoped).
 * Provides CRUD operations, normalization, and realtime cache invalidation.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CanonicalVendor, VendorAlias } from '@/types/vendorRegistry';

// ============================================
// In-memory caches
// ============================================

let vendorsCache: CanonicalVendor[] | null = null;
let aliasesCache: VendorAlias[] | null = null;
let aliasKeyMap: Map<string, VendorAlias> | null = null;

// ============================================
// Normalization
// ============================================

/**
 * Normalize a vendor/merchant name to a canonical key for matching.
 * Lowercase, trim, remove punctuation, collapse whitespace.
 */
export function normalizeVendorKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ');   // collapse whitespace
}

// ============================================
// Vendors CRUD
// ============================================

/**
 * List all canonical vendors (optionally including inactive).
 */
export async function listCanonicalVendors(includeInactive = false): Promise<CanonicalVendor[]> {
  // Return from cache if available
  if (vendorsCache) {
    return includeInactive 
      ? vendorsCache 
      : vendorsCache.filter(v => v.isActive);
  }

  const { data, error } = await supabase
    .from('canonical_vendors')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    logger.error('Failed to load canonical vendors:', error);
    return [];
  }

  vendorsCache = (data || []).map(row => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }));

  return includeInactive 
    ? vendorsCache 
    : vendorsCache.filter(v => v.isActive);
}

/**
 * Get a single canonical vendor by ID.
 */
export async function getCanonicalVendorById(id: string): Promise<CanonicalVendor | null> {
  const vendors = await listCanonicalVendors(true);
  return vendors.find(v => v.id === id) || null;
}

/**
 * Create or find existing canonical vendor by name.
 * Returns existing if same normalized name exists.
 */
export async function upsertCanonicalVendor(name: string): Promise<CanonicalVendor | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  // Check if already exists (case-insensitive)
  const vendors = await listCanonicalVendors(true);
  const existing = vendors.find(v => 
    v.name.toLowerCase() === trimmedName.toLowerCase()
  );
  
  if (existing) {
    // If inactive, reactivate it
    if (!existing.isActive) {
      await setCanonicalVendorActive(existing.id, true);
      return { ...existing, isActive: true };
    }
    return existing;
  }

  // Insert new vendor
  const { data, error } = await supabase
    .from('canonical_vendors')
    .insert({ name: trimmedName })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create canonical vendor:', error);
    return null;
  }

  // Invalidate cache
  invalidateVendorsCache();

  return {
    id: data.id,
    name: data.name,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
  };
}

/**
 * Set active/inactive status for a canonical vendor.
 */
export async function setCanonicalVendorActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('canonical_vendors')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    logger.error('Failed to update canonical vendor active status:', error);
  }

  invalidateVendorsCache();
}

// ============================================
// Aliases CRUD
// ============================================

/**
 * List all vendor aliases (optionally including inactive).
 */
export async function listVendorAliases(includeInactive = false): Promise<VendorAlias[]> {
  // Return from cache if available
  if (aliasesCache) {
    return includeInactive 
      ? aliasesCache 
      : aliasesCache.filter(a => a.isActive);
  }

  const { data, error } = await supabase
    .from('vendor_aliases')
    .select('*')
    .order('alias_display', { ascending: true });

  if (error) {
    logger.error('Failed to load vendor aliases:', error);
    return [];
  }

  aliasesCache = (data || []).map(row => ({
    id: row.id,
    aliasKey: row.alias_key,
    aliasDisplay: row.alias_display,
    canonicalVendorId: row.canonical_vendor_id,
    source: row.source,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }));

  // Build key map for fast lookup
  buildAliasKeyMap();

  return includeInactive 
    ? aliasesCache 
    : aliasesCache.filter(a => a.isActive);
}

/**
 * Build alias key map for fast lookups.
 */
function buildAliasKeyMap(): void {
  if (!aliasesCache) return;
  
  aliasKeyMap = new Map();
  for (const alias of aliasesCache) {
    if (alias.isActive) {
      aliasKeyMap.set(alias.aliasKey, alias);
    }
  }
}

/**
 * Create or update a vendor alias.
 * Derives alias_key from aliasDisplay.
 */
export async function upsertVendorAlias(
  aliasDisplay: string, 
  canonicalVendorId: string
): Promise<VendorAlias | null> {
  const trimmedDisplay = aliasDisplay.trim();
  if (!trimmedDisplay || !canonicalVendorId) return null;

  const aliasKey = normalizeVendorKey(trimmedDisplay);

  // Check if alias key already exists
  const aliases = await listVendorAliases(true);
  const existing = aliases.find(a => a.aliasKey === aliasKey);

  if (existing) {
    // Update to point to new vendor if different
    if (existing.canonicalVendorId !== canonicalVendorId || !existing.isActive) {
      const { error } = await supabase
        .from('vendor_aliases')
        .update({ 
          canonical_vendor_id: canonicalVendorId,
          alias_display: trimmedDisplay,
          is_active: true,
        })
        .eq('id', existing.id);

      if (error) {
        logger.error('Failed to update vendor alias:', error);
        return null;
      }

      invalidateAliasesCache();
      return { 
        ...existing, 
        canonicalVendorId, 
        aliasDisplay: trimmedDisplay,
        isActive: true,
      };
    }
    return existing;
  }

  // Insert new alias
  const { data, error } = await supabase
    .from('vendor_aliases')
    .insert({
      alias_key: aliasKey,
      alias_display: trimmedDisplay,
      canonical_vendor_id: canonicalVendorId,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create vendor alias:', error);
    return null;
  }

  invalidateAliasesCache();

  return {
    id: data.id,
    aliasKey: data.alias_key,
    aliasDisplay: data.alias_display,
    canonicalVendorId: data.canonical_vendor_id,
    source: data.source,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
  };
}

/**
 * Set active/inactive status for a vendor alias.
 */
export async function setVendorAliasActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('vendor_aliases')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    logger.error('Failed to update vendor alias active status:', error);
  }

  invalidateAliasesCache();
}

// ============================================
// Resolution
// ============================================

/**
 * Resolve a merchant name to its canonical vendor via alias lookup.
 * Returns null if no active alias found or vendor is inactive.
 */
export async function resolveCanonicalVendorForMerchant(
  merchantName: string
): Promise<CanonicalVendor | null> {
  if (!merchantName) return null;

  const key = normalizeVendorKey(merchantName);
  
  // Ensure caches are loaded
  await listVendorAliases();
  await listCanonicalVendors(true);

  if (!aliasKeyMap || !vendorsCache) return null;

  const alias = aliasKeyMap.get(key);
  if (!alias) return null;

  const vendor = vendorsCache.find(v => v.id === alias.canonicalVendorId);
  if (!vendor || !vendor.isActive) return null;

  return vendor;
}

/**
 * Bulk resolve merchant names to canonical vendors.
 * Returns a map of merchantName -> CanonicalVendor (or null).
 */
export async function bulkResolveVendors(
  merchantNames: string[]
): Promise<Map<string, CanonicalVendor | null>> {
  const result = new Map<string, CanonicalVendor | null>();

  // Ensure caches are loaded
  await listVendorAliases();
  await listCanonicalVendors(true);

  for (const name of merchantNames) {
    const key = normalizeVendorKey(name);
    const alias = aliasKeyMap?.get(key);
    
    if (alias) {
      const vendor = vendorsCache?.find(v => v.id === alias.canonicalVendorId);
      result.set(name, vendor?.isActive ? vendor : null);
    } else {
      result.set(name, null);
    }
  }

  return result;
}

// ============================================
// Cache Invalidation
// ============================================

export function invalidateVendorsCache(): void {
  vendorsCache = null;
}

export function invalidateAliasesCache(): void {
  aliasesCache = null;
  aliasKeyMap = null;
}

export function invalidateAllVendorCaches(): void {
  invalidateVendorsCache();
  invalidateAliasesCache();
}

// ============================================
// Realtime Subscription
// ============================================

/**
 * Subscribe to realtime changes on vendor registry tables.
 * Invalidates caches when changes occur.
 * Returns cleanup function.
 */
export function subscribeVendorRegistryRealtimeInvalidation(): () => void {
  const vendorsChannel = supabase
    .channel('vendor-registry-vendors-invalidation')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'canonical_vendors',
      },
      () => {
        invalidateVendorsCache();
      }
    )
    .subscribe();

  const aliasesChannel = supabase
    .channel('vendor-registry-aliases-invalidation')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vendor_aliases',
      },
      () => {
        invalidateAliasesCache();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(vendorsChannel);
    supabase.removeChannel(aliasesChannel);
  };
}

// ============================================
// Audit Logging
// ============================================

/**
 * Log a vendor registry change to approval_audit_events.
 */
export async function logVendorRegistryAudit(
  action: string,
  entityId: string,
  actorRole: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('approval_audit_events').insert([{
      entity_type: 'vendor_registry',
      entity_id: entityId,
      action,
      actor_role: actorRole,
      meta: meta as unknown as import('@/integrations/supabase/types').Json,
    }]);
  } catch (err) {
    logger.error('Failed to log vendor registry audit event:', err);
  }
}
