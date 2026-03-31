import { logger } from '@/lib/logger';
/**
 * Storage module for actuals transaction matching and merchant rules.
 * Reads/writes to relational actuals_matches and merchant_rules tables.
 */

import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';

// Cache TTL: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
}

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
let matchingCache: Record<string, CacheEntry<ActualsMatchingData>> = {};

function isCacheExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.loadedAt > CACHE_TTL;
}

function getOrCreateCacheEntry(fiscalYearId: string): ActualsMatchingData {
  const entry = matchingCache[fiscalYearId];
  if (entry) return entry.data;
  const fresh = { matchesByTxnId: {}, rulesByMerchantKey: {} };
  matchingCache[fiscalYearId] = { data: fresh, loadedAt: 0 };
  return fresh;
}

export async function loadActualsMatchingAsync(fiscalYearId: string): Promise<ActualsMatchingData> {
  try {
    const [matchesRes, rulesRes] = await Promise.all([
      supabase
        .from('actuals_matches')
        .select('txn_id, cost_center_id, line_item_id, match_source, matched_at, matched_by_role, merchant_key')
        .eq('fiscal_year_id', fiscalYearId),
      supabase
        .from('merchant_rules')
        .select('merchant_key, cost_center_id, line_item_id, created_at, created_by_role')
        .eq('fiscal_year_id', fiscalYearId),
    ]);

    if (matchesRes.error) {
      logger.error('Failed to load actuals_matches:', matchesRes.error);
      return DEFAULT_MATCHING_DATA;
    }
    if (rulesRes.error) {
      logger.error('Failed to load merchant_rules:', rulesRes.error);
      return DEFAULT_MATCHING_DATA;
    }

    const matchesByTxnId: Record<string, TransactionMatch> = {};
    for (const row of matchesRes.data ?? []) {
      matchesByTxnId[row.txn_id] = {
        txnId: row.txn_id,
        costCenterId: row.cost_center_id,
        lineItemId: row.line_item_id,
        matchSource: row.match_source as TransactionMatch['matchSource'],
        matchedAt: row.matched_at,
        matchedByRole: row.matched_by_role as UserRole,
        merchantKey: row.merchant_key ?? undefined,
      };
    }

    const rulesByMerchantKey: Record<string, MerchantRule> = {};
    for (const row of rulesRes.data ?? []) {
      rulesByMerchantKey[row.merchant_key] = {
        merchantKey: row.merchant_key,
        costCenterId: row.cost_center_id,
        lineItemId: row.line_item_id,
        createdAt: row.created_at,
        createdByRole: row.created_by_role as UserRole,
      };
    }

    const result: ActualsMatchingData = { matchesByTxnId, rulesByMerchantKey };
    matchingCache[fiscalYearId] = { data: result, loadedAt: Date.now() };
    return result;
  } catch (err) {
    logger.error('Error loading actuals matching:', err);
    return DEFAULT_MATCHING_DATA;
  }
}

// Synchronous version for backward compatibility
export function loadActualsMatching(fiscalYearId: string): ActualsMatchingData {
  const entry = matchingCache[fiscalYearId];
  if (entry) {
    if (isCacheExpired(entry)) {
      loadActualsMatchingAsync(fiscalYearId).catch(logger.error);
    }
    return entry.data;
  }
  
  // Trigger async load
  loadActualsMatchingAsync(fiscalYearId).catch(logger.error);
  
  return DEFAULT_MATCHING_DATA;
}

/**
 * @deprecated Use individual CRUD functions instead.
 * Kept for backward compatibility with callers that import it.
 * Now performs individual inserts/deletes to match the relational model.
 */
export async function saveActualsMatching(fiscalYearId: string, data: ActualsMatchingData): Promise<void> {
  // Update cache
  matchingCache[fiscalYearId] = { data, loadedAt: Date.now() };
  // Note: callers should migrate to individual CRUD functions.
  // This function is kept only so existing imports don't break.
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
  const newMatches: Array<{
    fiscal_year_id: string;
    txn_id: string;
    cost_center_id: string;
    line_item_id: string;
    match_source: string;
    matched_by_role: string;
    merchant_key: string;
  }> = [];

  for (const txn of txns) {
    if (data.matchesByTxnId[txn.id]) continue;

    const merchantKey = normalizeMerchantKey(txn.merchantName);
    const rule = data.rulesByMerchantKey[merchantKey];

    if (rule) {
      const match: TransactionMatch = {
        txnId: txn.id,
        costCenterId: rule.costCenterId,
        lineItemId: rule.lineItemId,
        matchSource: 'merchant_rule',
        matchedAt: new Date().toISOString(),
        matchedByRole: role,
        merchantKey,
      };
      data.matchesByTxnId[txn.id] = match;
      newMatches.push({
        fiscal_year_id: fiscalYearId,
        txn_id: txn.id,
        cost_center_id: rule.costCenterId,
        line_item_id: rule.lineItemId,
        match_source: 'merchant_rule',
        matched_by_role: role,
        merchant_key: merchantKey,
      });
    }
  }

  if (newMatches.length > 0) {
    // Bulk insert in batches of 500
    const batchSize = 500;
    for (let i = 0; i < newMatches.length; i += batchSize) {
      const batch = newMatches.slice(i, i + batchSize);
      const { error } = await supabase.from('actuals_matches').upsert(batch, { onConflict: 'fiscal_year_id,txn_id' });
      if (error) {
        logger.error('Failed to bulk insert matches from merchant rules:', error);
      }
    }
    matchingCache[fiscalYearId] = { data, loadedAt: Date.now() };
  }

  return newMatches.length;
}

/**
 * Add or update a single transaction match.
 */
export async function addTransactionMatch(
  fiscalYearId: string,
  match: TransactionMatch
): Promise<void> {
  // Update cache optimistically
  const cached = getOrCreateCacheEntry(fiscalYearId);
  cached.matchesByTxnId[match.txnId] = match;
  matchingCache[fiscalYearId] = { data: cached, loadedAt: Date.now() };

  const { error } = await supabase.from('actuals_matches').upsert({
    fiscal_year_id: fiscalYearId,
    txn_id: match.txnId,
    cost_center_id: match.costCenterId,
    line_item_id: match.lineItemId,
    match_source: match.matchSource,
    matched_at: match.matchedAt,
    matched_by_role: match.matchedByRole,
    merchant_key: match.merchantKey ?? null,
  }, { onConflict: 'fiscal_year_id,txn_id' });

  if (error) {
    logger.error('Failed to add transaction match:', error);
    // Revert cache
    delete cached.matchesByTxnId[match.txnId];
  }
}

/**
 * Remove a transaction match.
 */
export async function removeTransactionMatch(
  fiscalYearId: string,
  txnId: string
): Promise<TransactionMatch | undefined> {
  const cached = getOrCreateCacheEntry(fiscalYearId);
  const removed = cached.matchesByTxnId[txnId];
  delete cached.matchesByTxnId[txnId];
  matchingCache[fiscalYearId] = { data: cached, loadedAt: Date.now() };

  const { error } = await supabase
    .from('actuals_matches')
    .delete()
    .eq('fiscal_year_id', fiscalYearId)
    .eq('txn_id', txnId);

  if (error) {
    logger.error('Failed to remove transaction match:', error);
    // Revert cache
    if (removed) cached.matchesByTxnId[txnId] = removed;
  }

  return removed;
}

/**
 * Add or update a merchant rule.
 */
export async function addMerchantRule(
  fiscalYearId: string,
  rule: MerchantRule
): Promise<void> {
  const cached = getOrCreateCacheEntry(fiscalYearId);
  cached.rulesByMerchantKey[rule.merchantKey] = rule;
  matchingCache[fiscalYearId] = { data: cached, loadedAt: Date.now() };

  const { error } = await supabase.from('merchant_rules').upsert({
    fiscal_year_id: fiscalYearId,
    merchant_key: rule.merchantKey,
    cost_center_id: rule.costCenterId,
    line_item_id: rule.lineItemId,
    created_by_role: rule.createdByRole,
  }, { onConflict: 'fiscal_year_id,merchant_key' });

  if (error) {
    logger.error('Failed to add merchant rule:', error);
    delete cached.rulesByMerchantKey[rule.merchantKey];
  }
}

/**
 * Remove a merchant rule.
 */
export async function removeMerchantRule(
  fiscalYearId: string,
  merchantKey: string
): Promise<MerchantRule | undefined> {
  const cached = getOrCreateCacheEntry(fiscalYearId);
  const removed = cached.rulesByMerchantKey[merchantKey];
  delete cached.rulesByMerchantKey[merchantKey];
  matchingCache[fiscalYearId] = { data: cached, loadedAt: Date.now() };

  const { error } = await supabase
    .from('merchant_rules')
    .delete()
    .eq('fiscal_year_id', fiscalYearId)
    .eq('merchant_key', merchantKey);

  if (error) {
    logger.error('Failed to remove merchant rule:', error);
    if (removed) cached.rulesByMerchantKey[merchantKey] = removed;
  }

  return removed;
}

/**
 * Delete all matching data for a fiscal year.
 */
export async function deleteActualsMatchingForFY(fiscalYearId: string): Promise<void> {
  delete matchingCache[fiscalYearId];

  try {
    const [matchErr, rulesErr] = await Promise.all([
      supabase.from('actuals_matches').delete().eq('fiscal_year_id', fiscalYearId),
      supabase.from('merchant_rules').delete().eq('fiscal_year_id', fiscalYearId),
    ]);

    if (matchErr.error) logger.error('Failed to delete actuals_matches:', matchErr.error);
    if (rulesErr.error) logger.error('Failed to delete merchant_rules:', rulesErr.error);
  } catch (err) {
    logger.error('Error deleting actuals matching:', err);
  }
}

/**
 * Replace all matching data for a fiscal year (used by bundle import).
 * Deletes existing data then inserts the provided data.
 */
export async function replaceActualsMatchingForFY(fiscalYearId: string, data: ActualsMatchingData): Promise<void> {
  // Delete existing
  await deleteActualsMatchingForFY(fiscalYearId);

  // Insert matches
  const matchEntries = Object.values(data.matchesByTxnId);
  if (matchEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < matchEntries.length; i += batchSize) {
      const batch = matchEntries.slice(i, i + batchSize).map((m) => ({
        fiscal_year_id: fiscalYearId,
        txn_id: m.txnId,
        cost_center_id: m.costCenterId,
        line_item_id: m.lineItemId,
        match_source: m.matchSource,
        matched_at: m.matchedAt,
        matched_by_role: m.matchedByRole,
        merchant_key: m.merchantKey ?? null,
      }));
      const { error } = await supabase.from('actuals_matches').insert(batch);
      if (error) logger.error('Failed to insert matches during replace:', error);
    }
  }

  // Insert rules
  const ruleEntries = Object.values(data.rulesByMerchantKey);
  if (ruleEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < ruleEntries.length; i += batchSize) {
      const batch = ruleEntries.slice(i, i + batchSize).map((r) => ({
        fiscal_year_id: fiscalYearId,
        merchant_key: r.merchantKey,
        cost_center_id: r.costCenterId,
        line_item_id: r.lineItemId,
        created_by_role: r.createdByRole,
      }));
      const { error } = await supabase.from('merchant_rules').insert(batch);
      if (error) logger.error('Failed to insert rules during replace:', error);
    }
  }

  // Update cache
  matchingCache[fiscalYearId] = { data, loadedAt: Date.now() };
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

// Clear all cached FYs except the given one
export function clearMatchingCacheExcept(fyId: string): void {
  const kept = matchingCache[fyId];
  matchingCache = {};
  if (kept) {
    matchingCache[fyId] = kept;
  }
}

/**
 * Subscribe to realtime changes on actuals_matches and merchant_rules tables.
 * Invalidates cache for affected fiscal year.
 * Returns cleanup function.
 */
export function subscribeActualsMatchingRealtimeInvalidation(): () => void {
  const matchesChannel = supabase
    .channel('matches-cache-invalidation')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'actuals_matches' },
      (payload) => {
        const fyId = (payload.new as { fiscal_year_id?: string })?.fiscal_year_id 
          || (payload.old as { fiscal_year_id?: string })?.fiscal_year_id;
        if (fyId) invalidateMatchingCache(fyId);
        else clearMatchingCache();
      }
    )
    .subscribe();

  const rulesChannel = supabase
    .channel('rules-cache-invalidation')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'merchant_rules' },
      (payload) => {
        const fyId = (payload.new as { fiscal_year_id?: string })?.fiscal_year_id 
          || (payload.old as { fiscal_year_id?: string })?.fiscal_year_id;
        if (fyId) invalidateMatchingCache(fyId);
        else clearMatchingCache();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(matchesChannel);
    supabase.removeChannel(rulesChannel);
  };
}
