/**
 * Hook to ensure actuals and matching data are loaded from DB before use.
 * Returns loading state and ready flag for UI to wait on.
 */

import { useState, useEffect, useCallback } from 'react';
import { loadActualsAsync } from '@/lib/actualsStore';
import { loadActualsMatchingAsync } from '@/lib/actualsMatchingStore';
import { getOrBuildActualsRollup } from '@/lib/actualsRollupStore';
import type { ActualsRollupResult } from '@/lib/actualsRollup';
import type { FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';

export interface UseEnsureActualsLoadedResult {
  isLoading: boolean;
  error: string | null;
  actualsReady: boolean;
  rollup: ActualsRollupResult | null;
  refetch: () => Promise<void>;
}

export function useEnsureActualsLoaded(
  fiscalYearId: string | null,
  fiscalYear: FiscalYearBudget | null
): UseEnsureActualsLoadedResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualsReady, setActualsReady] = useState(false);
  const [rollup, setRollup] = useState<ActualsRollupResult | null>(null);

  const loadData = useCallback(async () => {
    // Reset state for new FY
    setRollup(null);
    setActualsReady(false);
    setError(null);

    if (!fiscalYearId || !fiscalYear) {
      setIsLoading(false);
      return;
    }

    // Only load for active FYs
    if (fiscalYear.status !== 'active') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Load actuals and matching data in parallel from DB
      await Promise.all([
        loadActualsAsync(fiscalYearId),
        loadActualsMatchingAsync(fiscalYearId),
      ]);

      // Now that data is in cache, build the rollup
      const computedRollup = getOrBuildActualsRollup(fiscalYearId, fiscalYear);
      setRollup(computedRollup);
      setActualsReady(true);
    } catch (err) {
      console.error('Error loading actuals data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load actuals');
    } finally {
      setIsLoading(false);
    }
  }, [fiscalYearId, fiscalYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    isLoading,
    error,
    actualsReady,
    rollup,
    refetch: loadData,
  };
}
