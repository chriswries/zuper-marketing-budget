/**
 * Storage module for actuals transactions.
 * Persists to Supabase actuals_transactions table.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ActualsTransaction, ActualsSummary } from '@/types/actuals';
import type { Json } from '@/integrations/supabase/types';

// In-memory cache for synchronous access patterns
let actualsCache: Record<string, ActualsTransaction[]> = {};

// Map DB row to ActualsTransaction
function rowToTransaction(row: {
  fiscal_year_id: string;
  txn_id: string;
  txn_date: string | null;
  merchant: string | null;
  amount: number;
  source: string | null;
  raw: Json;
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
} {
  return {
    fiscal_year_id: txn.fiscalYearId,
    txn_id: txn.id,
    txn_date: txn.txnDate || null,
    merchant: txn.merchantName || null,
    amount: txn.amount,
    source: txn.source || null,
    raw: txn as unknown as Json,
  };
}

export async function loadActualsAsync(fiscalYearId: string): Promise<ActualsTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('actuals_transactions')
      .select('*')
      .eq('fiscal_year_id', fiscalYearId);

    if (error) {
      console.error('Failed to load actuals:', error);
      return [];
    }

    const txns = (data || []).map(rowToTransaction);
    actualsCache[fiscalYearId] = txns;
    return txns;
  } catch (err) {
    console.error('Error loading actuals:', err);
    return [];
  }
}

// Synchronous version that returns cached data (for backward compatibility)
export function loadActuals(fiscalYearId: string): ActualsTransaction[] {
  if (fiscalYearId in actualsCache) {
    return actualsCache[fiscalYearId];
  }
  
  // Trigger async load for next time
  loadActualsAsync(fiscalYearId).catch(console.error);
  
  return [];
}

export async function appendActuals(fiscalYearId: string, txns: ActualsTransaction[]): Promise<void> {
  if (txns.length === 0) return;

  // Update cache
  const existing = actualsCache[fiscalYearId] ?? [];
  actualsCache[fiscalYearId] = [...existing, ...txns];

  try {
    const rows = txns.map(transactionToRow);
    const { error } = await supabase
      .from('actuals_transactions')
      .insert(rows);

    if (error) {
      console.error('Failed to append actuals:', error);
    }
  } catch (err) {
    console.error('Error appending actuals:', err);
  }
}

export async function replaceActuals(fiscalYearId: string, txns: ActualsTransaction[]): Promise<void> {
  // Update cache
  actualsCache[fiscalYearId] = txns;

  try {
    // Delete existing
    const { error: deleteError } = await supabase
      .from('actuals_transactions')
      .delete()
      .eq('fiscal_year_id', fiscalYearId);

    if (deleteError) {
      console.error('Failed to delete existing actuals:', deleteError);
      return;
    }

    // Insert new
    if (txns.length > 0) {
      const rows = txns.map(transactionToRow);
      const { error: insertError } = await supabase
        .from('actuals_transactions')
        .insert(rows);

      if (insertError) {
        console.error('Failed to insert actuals:', insertError);
      }
    }
  } catch (err) {
    console.error('Error replacing actuals:', err);
  }
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
      console.error('Failed to delete actuals:', error);
    }
  } catch (err) {
    console.error('Error deleting actuals:', err);
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
