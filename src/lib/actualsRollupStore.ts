/**
 * Storage module for computed actuals rollups.
 * Persists rollups to sessionStorage (instead of localStorage) for better security.
 * Session storage clears on tab close, reducing exposure of financial data.
 * Also includes TTL (time-to-live) for cache expiration.
 */

import type { ActualsRollupResult, buildActualsRollup } from './actualsRollup';
import { loadActuals } from './actualsStore';
import { loadActualsMatching } from './actualsMatchingStore';
import { buildActualsRollup as computeRollup } from './actualsRollup';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

// Cache TTL: 1 hour (in milliseconds)
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface StoredRollup {
  generatedAt: string; // ISO
  rollup: ActualsRollupResult;
  expiresAt: number; // Timestamp for TTL expiration
}

function getStorageKey(fiscalYearId: string): string {
  return `actuals_rollup_${fiscalYearId}`;
}

/**
 * Check if cached data is still valid (not expired).
 */
function isCacheValid(stored: StoredRollup): boolean {
  return Date.now() < stored.expiresAt;
}

export function loadActualsRollup(fiscalYearId: string): StoredRollup | null {
  try {
    // Use sessionStorage instead of localStorage for security
    const stored = sessionStorage.getItem(getStorageKey(fiscalYearId));
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as StoredRollup;
    
    // Check TTL expiration
    if (!isCacheValid(parsed)) {
      // Cache expired, remove it
      sessionStorage.removeItem(getStorageKey(fiscalYearId));
      return null;
    }
    
    return parsed;
  } catch {
    console.error('Failed to load actuals rollup from sessionStorage');
    return null;
  }
}

export function saveActualsRollup(fiscalYearId: string, rollup: ActualsRollupResult): void {
  const stored: StoredRollup = {
    generatedAt: new Date().toISOString(),
    rollup,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  try {
    // Use sessionStorage instead of localStorage for security
    sessionStorage.setItem(getStorageKey(fiscalYearId), JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to save actuals rollup to sessionStorage:', error);
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
    // Use sessionStorage instead of localStorage
    sessionStorage.removeItem(getStorageKey(fiscalYearId));
  } catch (error) {
    console.error('Failed to delete actuals rollup from sessionStorage:', error);
  }
}
