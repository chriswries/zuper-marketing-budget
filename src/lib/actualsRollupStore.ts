/**
 * Storage module for computed actuals rollups.
 * Persists rollups to localStorage keyed by fiscal year.
 */

import type { ActualsRollupResult, buildActualsRollup } from './actualsRollup';
import { loadActuals } from './actualsStore';
import { loadActualsMatching } from './actualsMatchingStore';
import { buildActualsRollup as computeRollup } from './actualsRollup';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

export interface StoredRollup {
  generatedAt: string; // ISO
  rollup: ActualsRollupResult;
}

function getStorageKey(fiscalYearId: string): string {
  return `actuals_rollup_${fiscalYearId}`;
}

export function loadActualsRollup(fiscalYearId: string): StoredRollup | null {
  try {
    const stored = localStorage.getItem(getStorageKey(fiscalYearId));
    if (!stored) return null;
    return JSON.parse(stored) as StoredRollup;
  } catch {
    console.error('Failed to load actuals rollup from localStorage');
    return null;
  }
}

export function saveActualsRollup(fiscalYearId: string, rollup: ActualsRollupResult): void {
  const stored: StoredRollup = {
    generatedAt: new Date().toISOString(),
    rollup,
  };
  try {
    localStorage.setItem(getStorageKey(fiscalYearId), JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to save actuals rollup to localStorage:', error);
  }
}

/**
 * Recompute rollup from current transactions and matches, then save.
 */
export function recomputeAndSaveActualsRollup(
  fiscalYearId: string,
  fiscalYear: FiscalYearBudget
): ActualsRollupResult {
  const transactions = loadActuals(fiscalYearId);
  const matchingData = loadActualsMatching(fiscalYearId);

  const rollup = computeRollup({
    fiscalYearId,
    fiscalYear,
    transactions,
    matchesByTxnId: matchingData.matchesByTxnId,
  });

  saveActualsRollup(fiscalYearId, rollup);
  return rollup;
}

/**
 * Get existing rollup or compute and save a fresh one.
 * For the Actuals view, we always recompute to ensure freshness.
 */
export function getOrBuildActualsRollup(
  fiscalYearId: string,
  fiscalYear: FiscalYearBudget
): ActualsRollupResult {
  // Always recompute to ensure actuals view is fresh
  return recomputeAndSaveActualsRollup(fiscalYearId, fiscalYear);
}

/**
 * Delete actuals rollup cache for a fiscal year.
 */
export function deleteActualsRollupForFY(fiscalYearId: string): void {
  try {
    localStorage.removeItem(getStorageKey(fiscalYearId));
  } catch (error) {
    console.error('Failed to delete actuals rollup from localStorage:', error);
  }
}
