import { logger } from '@/lib/logger';
/**
 * Storage module for actuals transactions.
 * Persists to Supabase actuals_transactions table.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ActualsTransaction, ActualsSummary } from '@/types/actuals';
import type { Json } from '@/integrations/supabase/types';

// Cache TTL: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
}

// In-memory cache for synchronous access patterns
let actualsCache: Record<string, CacheEntry<ActualsTransaction[]>> = {};

function isCacheExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.loadedAt > CACHE_TTL;
}

// Map DB row to ActualsTransaction
function rowToTransaction(row: {
  fiscal_year_id: string;
  txn_id: string;
  txn_date: string | null;
  merchant: string | null;
  amount: number;
  source: string | null;
  raw: Json;
  canonical_vendor_id?: string | null;
  import_batch_id?: string | null;
  import_filename?: string | null;
}): ActualsTransaction {
  const raw = row.raw as Record<string, unknown>;
  return {
    id: row.txn_id,
    source: (row.source ?? 'unknown') as ActualsTransaction['source'],
    fiscalYearId: row.fiscal_year_id,
    txnDate: row.txn_date ?? (raw.txnDate as string) ?? '',
    postedDate: raw.postedDate as string | undefined,
    merchantName: row.merchant ?? (raw.merchantName as string) ?? '',
    description: raw.description as string | undefined,
    amount: row.amount,
    currency: (raw.currency as string) ?? 'USD',
    category: raw.category as string | undefined,
    externalId: raw.externalId as string | undefined,
    raw: raw.raw as Record<string, unknown> ?? raw,
    createdAt: raw.createdAt as string ?? new Date().toISOString(),
    canonicalVendorId: row.canonical_vendor_id ?? (raw.canonicalVendorId as string | undefined) ?? null,
    importBatchId: row.import_batch_id ?? null,
    importFilename: row.import_filename ?? null,
  };
}

// Map ActualsTransaction to DB row
function transactionToRow(txn: ActualsTransaction): {
  fiscal_year_id: string;
  txn_id: string;
  txn_date: string | null;
  merchant: string | null;
  amount: number;
  source: string | null;
  raw: Json;
  canonical_vendor_id: string | null;
  import_batch_id: string | null;
  import_filename: string | null;
} {
  return {
    fiscal_year_id: txn.fiscalYearId,
    txn_id: txn.id,
    txn_date: txn.txnDate || null,
    merchant: txn.merchantName || null,
    amount: txn.amount,
    source: txn.source || null,
    raw: txn as unknown as Json,
    canonical_vendor_id: txn.canonicalVendorId ?? null,
    import_batch_id: txn.importBatchId ?? null,
    import_filename: txn.importFilename ?? null,
  };
}

export async function loadActualsAsync(fiscalYearId: string): Promise<ActualsTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('actuals_transactions')
      .select('*')
      .eq('fiscal_year_id', fiscalYearId);

    if (error) {
      logger.error('Failed to load actuals:', error);
      return [];
    }

    const txns = (data || []).map(rowToTransaction);
    actualsCache[fiscalYearId] = { data: txns, loadedAt: Date.now() };
    return txns;
  } catch (err) {
    logger.error('Error loading actuals:', err);
    return [];
  }
}

// Synchronous version that returns cached data (for backward compatibility)
export function loadActuals(fiscalYearId: string): ActualsTransaction[] {
  const entry = actualsCache[fiscalYearId];
  if (entry) {
    if (isCacheExpired(entry)) {
      loadActualsAsync(fiscalYearId).catch(logger.error);
    }
    return entry.data;
  }
  
  // Trigger async load for next time
  loadActualsAsync(fiscalYearId).catch(logger.error);
  
  return [];
}

export async function appendActuals(fiscalYearId: string, txns: ActualsTransaction[]): Promise<void> {
  if (txns.length === 0) return;

  // Update cache
  const existing = actualsCache[fiscalYearId]?.data ?? [];
  actualsCache[fiscalYearId] = { data: [...existing, ...txns], loadedAt: Date.now() };

  try {
    const rows = txns.map(transactionToRow);
    const { error } = await supabase
      .from('actuals_transactions')
      .upsert(rows, { onConflict: 'fiscal_year_id,txn_id' });

    if (error) {
      logger.error('Failed to append actuals:', error);
    }
  } catch (err) {
    logger.error('Error appending actuals:', err);
  }
}

export async function replaceActuals(fiscalYearId: string, txns: ActualsTransaction[]): Promise<void> {
  const rows = txns.map(transactionToRow);

  const { data, error } = await supabase.functions.invoke('replace_actuals', {
    body: { fiscalYearId, transactions: rows },
  });

  if (error) {
    const message = typeof error === 'object' && 'message' in error ? error.message : String(error);
    throw new Error(`Failed to replace actuals: ${message}`);
  }

  if (data?.error) {
    throw new Error(`Failed to replace actuals: ${data.error}`);
  }

  // Update cache only after successful server-side transaction
  actualsCache[fiscalYearId] = { data: txns, loadedAt: Date.now() };
}

export async function deleteActualsForFY(fiscalYearId: string): Promise<void> {
  // Clear cache
  delete actualsCache[fiscalYearId];

  try {
    const { error } = await supabase
      .from('actuals_transactions')
      .delete()
      .eq('fiscal_year_id', fiscalYearId);

    if (error) {
      logger.error('Failed to delete actuals:', error);
    }
  } catch (err) {
    logger.error('Error deleting actuals:', err);
  }
}

export function getActualsSummary(fiscalYearId: string): ActualsSummary {
  const txns = loadActuals(fiscalYearId);
  
  if (txns.length === 0) {
    return { count: 0, total: 0 };
  }

  let total = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (const txn of txns) {
    total += txn.amount;
    if (!minDate || txn.txnDate < minDate) minDate = txn.txnDate;
    if (!maxDate || txn.txnDate > maxDate) maxDate = txn.txnDate;
  }

  return { count: txns.length, total, minDate, maxDate };
}

// Preload actuals into cache
export async function preloadActuals(fiscalYearId: string): Promise<void> {
  await loadActualsAsync(fiscalYearId);
}

// Clear entire cache
export function clearActualsCache(): void {
  actualsCache = {};
}

// Clear specific FY from cache
export function invalidateActualsCache(fyId: string): void {
  delete actualsCache[fyId];
}

// Clear all cached FYs except the given one
export function clearActualsCacheExcept(fyId: string): void {
  const kept = actualsCache[fyId];
  actualsCache = {};
  if (kept) {
    actualsCache[fyId] = kept;
  }
}

/**
 * Subscribe to realtime changes on actuals_transactions table.
 * Invalidates cache for affected fiscal year.
 * Returns cleanup function.
 */
export function subscribeActualsRealtimeInvalidation(): () => void {
  const channel = supabase
    .channel('actuals-cache-invalidation')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'actuals_transactions',
      },
      (payload) => {
        const fyId = (payload.new as { fiscal_year_id?: string })?.fiscal_year_id 
          || (payload.old as { fiscal_year_id?: string })?.fiscal_year_id;
        
        if (fyId) {
          invalidateActualsCache(fyId);
        } else {
          clearActualsCache();
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
