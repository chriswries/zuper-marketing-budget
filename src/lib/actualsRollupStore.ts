/**
 * Computation module for actuals rollups.
 * No longer caches to sessionStorage — data is passed directly from async loaders.
 */

import type { ActualsRollupResult } from './actualsRollup';
import { loadActuals } from './actualsStore';
import { loadActualsMatching } from './actualsMatchingStore';
import { buildActualsRollup as computeRollup } from './actualsRollup';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import type { ActualsTransaction } from '@/types/actuals';
import type { ActualsMatchingData } from './actualsMatchingStore';

/**
 * Recompute rollup from provided transactions and matches.
 * If transactions/matchingData are not provided, falls back to sync cache (for legacy callers).
 */
export function recomputeAndSaveActualsRollup(
  fiscalYearId: string,
  fiscalYear: FiscalYearBudget,
  transactions?: ActualsTransaction[],
  matchingData?: ActualsMatchingData
): ActualsRollupResult {
  const txns = transactions ?? loadActuals(fiscalYearId);
  const matching = matchingData ?? loadActualsMatching(fiscalYearId);

  return computeRollup({
    fiscalYearId,
    fiscalYear,
    transactions: txns,
    matchesByTxnId: matching.matchesByTxnId,
  });
}

/**
 * Get rollup by computing from provided data.
 * If transactions/matchingData are not provided, falls back to sync cache.
 */
export function getOrBuildActualsRollup(
  fiscalYearId: string,
  fiscalYear: FiscalYearBudget,
  transactions?: ActualsTransaction[],
  matchingData?: ActualsMatchingData
): ActualsRollupResult {
  return recomputeAndSaveActualsRollup(fiscalYearId, fiscalYear, transactions, matchingData);
}

/**
 * No-op kept for backward compatibility (sessionStorage caching removed).
 */
export function deleteActualsRollupForFY(_fiscalYearId: string): void {
  // No-op: sessionStorage caching has been removed
}
