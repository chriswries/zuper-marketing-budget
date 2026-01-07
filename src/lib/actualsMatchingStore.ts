/**
 * Storage module for actuals transaction matching and merchant rules.
 * Persists matches and merchant rules to localStorage keyed by fiscal year.
 */

import type { UserRole } from '@/contexts/CurrentUserRoleContext';

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

function getStorageKey(fiscalYearId: string): string {
  return `actuals_matches_${fiscalYearId}`;
}

export function loadActualsMatching(fiscalYearId: string): ActualsMatchingData {
  try {
    const stored = localStorage.getItem(getStorageKey(fiscalYearId));
    if (!stored) {
      return { matchesByTxnId: {}, rulesByMerchantKey: {} };
    }
    return JSON.parse(stored) as ActualsMatchingData;
  } catch {
    console.error('Failed to load actuals matching from localStorage');
    return { matchesByTxnId: {}, rulesByMerchantKey: {} };
  }
}

export function saveActualsMatching(fiscalYearId: string, data: ActualsMatchingData): void {
  try {
    localStorage.setItem(getStorageKey(fiscalYearId), JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save actuals matching to localStorage:', error);
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
export function applyMerchantRules(
  fiscalYearId: string,
  txns: Array<{ id: string; merchantName: string }>,
  role: UserRole
): number {
  const data = loadActualsMatching(fiscalYearId);
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
    saveActualsMatching(fiscalYearId, data);
  }

  return appliedCount;
}

/**
 * Add or update a single transaction match.
 */
export function addTransactionMatch(
  fiscalYearId: string,
  match: TransactionMatch
): void {
  const data = loadActualsMatching(fiscalYearId);
  data.matchesByTxnId[match.txnId] = match;
  saveActualsMatching(fiscalYearId, data);
}

/**
 * Remove a transaction match.
 */
export function removeTransactionMatch(
  fiscalYearId: string,
  txnId: string
): TransactionMatch | undefined {
  const data = loadActualsMatching(fiscalYearId);
  const removed = data.matchesByTxnId[txnId];
  delete data.matchesByTxnId[txnId];
  saveActualsMatching(fiscalYearId, data);
  return removed;
}

/**
 * Add or update a merchant rule.
 */
export function addMerchantRule(
  fiscalYearId: string,
  rule: MerchantRule
): void {
  const data = loadActualsMatching(fiscalYearId);
  data.rulesByMerchantKey[rule.merchantKey] = rule;
  saveActualsMatching(fiscalYearId, data);
}

/**
 * Remove a merchant rule.
 */
export function removeMerchantRule(
  fiscalYearId: string,
  merchantKey: string
): MerchantRule | undefined {
  const data = loadActualsMatching(fiscalYearId);
  const removed = data.rulesByMerchantKey[merchantKey];
  delete data.rulesByMerchantKey[merchantKey];
  saveActualsMatching(fiscalYearId, data);
  return removed;
}
