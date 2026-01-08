/**
 * Storage module for actuals transaction matching and merchant rules.
 * Persists to Supabase actuals_matching table.
 */

import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';
import type { Json } from '@/integrations/supabase/types';

export interface TransactionMatch {
  txnId: string;
  costCenterId: string;
  lineItemId: string;
  matchSource: 'manual' | 'merchant_rule' | 'auto_suggestion';
  matchedAt: string; // ISO
  matchedByRole: UserRole;
  merchantKey?: string;
}

export interface MerchantRule {
  merchantKey: string;
  costCenterId: string;
  lineItemId: string;
  createdAt: string; // ISO
  createdByRole: UserRole;
}

export interface ActualsMatchingData {
  matchesByTxnId: Record<string, TransactionMatch>;
  rulesByMerchantKey: Record<string, MerchantRule>;
}

const DEFAULT_MATCHING_DATA: ActualsMatchingData = {
  matchesByTxnId: {},
  rulesByMerchantKey: {},
};

// In-memory cache
let matchingCache: Record<string, ActualsMatchingData> = {};

export async function loadActualsMatchingAsync(fiscalYearId: string): Promise<ActualsMatchingData> {
  try {
    const { data, error } = await supabase
      .from('actuals_matching')
      .select('*')
      .eq('fiscal_year_id', fiscalYearId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load actuals matching:', error);
      return DEFAULT_MATCHING_DATA;
    }

    if (!data) {
      matchingCache[fiscalYearId] = DEFAULT_MATCHING_DATA;
      return DEFAULT_MATCHING_DATA;
    }

    const result: ActualsMatchingData = {
      matchesByTxnId: (data.matches_by_txn_id as unknown as Record<string, TransactionMatch>) ?? {},
      rulesByMerchantKey: (data.rules_by_merchant_key as unknown as Record<string, MerchantRule>) ?? {},
    };
    matchingCache[fiscalYearId] = result;
    return result;
  } catch (err) {
    console.error('Error loading actuals matching:', err);
    return DEFAULT_MATCHING_DATA;
  }
}

// Synchronous version for backward compatibility
export function loadActualsMatching(fiscalYearId: string): ActualsMatchingData {
  if (fiscalYearId in matchingCache) {
    return matchingCache[fiscalYearId];
  }
  
  // Trigger async load
  loadActualsMatchingAsync(fiscalYearId).catch(console.error);
  
  return DEFAULT_MATCHING_DATA;
}

export async function saveActualsMatching(fiscalYearId: string, data: ActualsMatchingData): Promise<void> {
  // Update cache
  matchingCache[fiscalYearId] = data;

  try {
    const { error } = await supabase
      .from('actuals_matching')
      .upsert({
        fiscal_year_id: fiscalYearId,
        matches_by_txn_id: data.matchesByTxnId as unknown as Json,
        rules_by_merchant_key: data.rulesByMerchantKey as unknown as Json,
      });

    if (error) {
      console.error('Failed to save actuals matching:', error);
    }
  } catch (err) {
    console.error('Error saving actuals matching:', err);
  }
}

/**
 * Normalize merchant name to a canonical key for matching.
 * Lowercase, trim, remove punctuation, collapse whitespace.
 */
export function normalizeMerchantKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ');   // collapse whitespace
}

/**
 * Apply existing merchant rules to unmatched transactions.
 * Returns count of newly matched transactions.
 */
export async function applyMerchantRules(
  fiscalYearId: string,
  txns: Array<{ id: string; merchantName: string }>,
  role: UserRole
): Promise<number> {
  const data = await loadActualsMatchingAsync(fiscalYearId);
  let appliedCount = 0;

  for (const txn of txns) {
    // Skip if already matched
    if (data.matchesByTxnId[txn.id]) continue;

    const merchantKey = normalizeMerchantKey(txn.merchantName);
    const rule = data.rulesByMerchantKey[merchantKey];

    if (rule) {
      data.matchesByTxnId[txn.id] = {
        txnId: txn.id,
        costCenterId: rule.costCenterId,
        lineItemId: rule.lineItemId,
        matchSource: 'merchant_rule',
        matchedAt: new Date().toISOString(),
        matchedByRole: role,
        merchantKey,
      };
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    await saveActualsMatching(fiscalYearId, data);
  }

  return appliedCount;
}

/**
 * Add or update a single transaction match.
 */
export async function addTransactionMatch(
  fiscalYearId: string,
  match: TransactionMatch
): Promise<void> {
  const data = await loadActualsMatchingAsync(fiscalYearId);
  data.matchesByTxnId[match.txnId] = match;
  await saveActualsMatching(fiscalYearId, data);
}

/**
 * Remove a transaction match.
 */
export async function removeTransactionMatch(
  fiscalYearId: string,
  txnId: string
): Promise<TransactionMatch | undefined> {
  const data = await loadActualsMatchingAsync(fiscalYearId);
  const removed = data.matchesByTxnId[txnId];
  delete data.matchesByTxnId[txnId];
  await saveActualsMatching(fiscalYearId, data);
  return removed;
}

/**
 * Add or update a merchant rule.
 */
export async function addMerchantRule(
  fiscalYearId: string,
  rule: MerchantRule
): Promise<void> {
  const data = await loadActualsMatchingAsync(fiscalYearId);
  data.rulesByMerchantKey[rule.merchantKey] = rule;
  await saveActualsMatching(fiscalYearId, data);
}

/**
 * Remove a merchant rule.
 */
export async function removeMerchantRule(
  fiscalYearId: string,
  merchantKey: string
): Promise<MerchantRule | undefined> {
  const data = await loadActualsMatchingAsync(fiscalYearId);
  const removed = data.rulesByMerchantKey[merchantKey];
  delete data.rulesByMerchantKey[merchantKey];
  await saveActualsMatching(fiscalYearId, data);
  return removed;
}

/**
 * Delete all matching data for a fiscal year.
 */
export async function deleteActualsMatchingForFY(fiscalYearId: string): Promise<void> {
  // Clear cache
  delete matchingCache[fiscalYearId];

  try {
    const { error } = await supabase
      .from('actuals_matching')
      .delete()
      .eq('fiscal_year_id', fiscalYearId);

    if (error) {
      console.error('Failed to delete actuals matching:', error);
    }
  } catch (err) {
    console.error('Error deleting actuals matching:', err);
  }
}

/**
 * Replace all matching data for a fiscal year (used by bundle import).
 */
export async function replaceActualsMatchingForFY(fiscalYearId: string, data: ActualsMatchingData): Promise<void> {
  await saveActualsMatching(fiscalYearId, data);
}

// Preload matching data into cache
export async function preloadActualsMatching(fiscalYearId: string): Promise<void> {
  await loadActualsMatchingAsync(fiscalYearId);
}

// Clear entire cache
export function clearMatchingCache(): void {
  matchingCache = {};
}

// Clear specific FY from cache
export function invalidateMatchingCache(fyId: string): void {
  delete matchingCache[fyId];
}

/**
 * Subscribe to realtime changes on actuals_matching table.
 * Invalidates cache for affected fiscal year.
 * Returns cleanup function.
 */
export function subscribeActualsMatchingRealtimeInvalidation(): () => void {
  const channel = supabase
    .channel('matching-cache-invalidation')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'actuals_matching',
      },
      (payload) => {
        const fyId = (payload.new as { fiscal_year_id?: string })?.fiscal_year_id 
          || (payload.old as { fiscal_year_id?: string })?.fiscal_year_id;
        
        if (fyId) {
          invalidateMatchingCache(fyId);
        } else {
          clearMatchingCache();
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
