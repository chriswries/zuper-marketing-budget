import { logger } from '@/lib/logger';
/**
 * Forecast store - reads/writes from relational tables:
 *   cost_centers, line_items, monthly_values (value_type = 'forecast' and 'budget')
 */

import { supabase } from '@/integrations/supabase/client';
import { CostCenter, LineItem, MonthlyValues, MONTHS, createZeroMonthlyValues } from '@/types/budget';

// Cache TTL: 10 minutes
const CACHE_TTL = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
}

// In-memory cache for synchronous access patterns
let forecastCache: Record<string, CacheEntry<CostCenter[] | null>> = {};

function isCacheExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.loadedAt > CACHE_TTL;
}

/**
 * Load forecast from relational tables: cost_centers + line_items + monthly_values
 */
export async function loadForecastForFYAsync(fyId: string): Promise<CostCenter[] | null> {
  try {
    // Parallel fetch: cost centers, line items, budget values, forecast values
    const [ccRes, liRes, budgetMvRes, forecastMvRes] = await Promise.all([
      supabase.from('cost_centers').select('*').eq('fiscal_year_id', fyId),
      supabase.from('line_items').select('*').eq('fiscal_year_id', fyId),
      supabase.from('monthly_values').select('*').eq('fiscal_year_id', fyId).eq('value_type', 'budget'),
      supabase.from('monthly_values').select('*').eq('fiscal_year_id', fyId).eq('value_type', 'forecast'),
    ]);

    if (ccRes.error || liRes.error || budgetMvRes.error || forecastMvRes.error) {
      logger.error('Failed to load forecast from relational tables:', {
        cc: ccRes.error, li: liRes.error, bmv: budgetMvRes.error, fmv: forecastMvRes.error
      });
      return null;
    }

    const forecastRows = forecastMvRes.data ?? [];

    // If no forecast monthly_values exist, there's no forecast yet
    if (forecastRows.length === 0) {
      forecastCache[fyId] = { data: null, loadedAt: Date.now() };
      return null;
    }

    const costCenters = assembleForForecast(
      ccRes.data ?? [],
      liRes.data ?? [],
      budgetMvRes.data ?? [],
      forecastRows,
    );

    forecastCache[fyId] = { data: costCenters, loadedAt: Date.now() };
    return costCenters;
  } catch (err) {
    logger.error('Error loading forecast:', err);
    return null;
  }
}

function assembleForForecast(
  costCenterRows: any[],
  lineItemRows: any[],
  budgetMvRows: any[],
  forecastMvRows: any[],
): CostCenter[] {
  // Build budget values lookup: lineItemId -> MonthlyValues
  const budgetByLI: Record<string, MonthlyValues> = {};
  for (const mv of budgetMvRows) {
    if (!budgetByLI[mv.line_item_id]) budgetByLI[mv.line_item_id] = createZeroMonthlyValues();
    budgetByLI[mv.line_item_id][mv.month as keyof MonthlyValues] = Number(mv.amount);
  }

  // Build forecast values lookup: lineItemId -> MonthlyValues
  const forecastByLI: Record<string, MonthlyValues> = {};
  for (const mv of forecastMvRows) {
    if (!forecastByLI[mv.line_item_id]) forecastByLI[mv.line_item_id] = createZeroMonthlyValues();
    forecastByLI[mv.line_item_id][mv.month as keyof MonthlyValues] = Number(mv.amount);
  }

  // Build line items grouped by cost center
  const liByCC: Record<string, LineItem[]> = {};
  for (const li of lineItemRows) {
    const lineItem: LineItem = {
      id: li.id,
      costCenterId: li.cost_center_id,
      name: li.name,
      vendor: li.vendor_name ? { id: li.vendor_id ?? li.id, name: li.vendor_name } : null,
      ownerId: li.owner_id ?? null,
      isContracted: li.is_contracted ?? false,
      isAccrual: li.is_accrual ?? false,
      isSoftwareSubscription: li.is_software_subscription ?? false,
      contractStartDate: li.contract_start_date ?? undefined,
      contractEndDate: li.contract_end_date ?? undefined,
      autoRenew: li.auto_renew ?? undefined,
      cancellationNoticeDays: li.cancellation_notice_days ?? undefined,
      budgetValues: budgetByLI[li.id] ?? createZeroMonthlyValues(),
      forecastValues: forecastByLI[li.id] ?? createZeroMonthlyValues(),
      actualValues: createZeroMonthlyValues(), // Actuals loaded separately
      approvalStatus: li.approval_status ?? undefined,
      approvalRequestId: li.approval_request_id ?? undefined,
      adjustmentStatus: li.adjustment_status ?? undefined,
      adjustmentRequestId: li.adjustment_request_id ?? undefined,
      adjustmentBeforeValues: li.adjustment_before_values ?? undefined,
      adjustmentSheet: li.adjustment_sheet ?? undefined,
      deletionStatus: li.deletion_status ?? undefined,
      deletionRequestId: li.deletion_request_id ?? undefined,
      cancellationStatus: li.cancellation_status ?? undefined,
      cancellationRequestId: li.cancellation_request_id ?? undefined,
    };
    if (!liByCC[li.cost_center_id]) liByCC[li.cost_center_id] = [];
    liByCC[li.cost_center_id].push(lineItem);
  }

  // Build cost centers
  return costCenterRows.map((cc) => ({
    id: cc.id,
    name: cc.name,
    ownerId: cc.owner_id ?? null,
    annualLimit: Number(cc.annual_limit),
    lineItems: liByCC[cc.id] ?? [],
  }));
}

// Synchronous version that returns cached data (for backward compatibility)
export function loadForecastForFY(fyId: string): CostCenter[] | null {
  const entry = forecastCache[fyId];
  if (entry) {
    if (isCacheExpired(entry)) {
      loadForecastForFYAsync(fyId).catch(logger.error);
    }
    return entry.data;
  }

  // Trigger async load for next time
  loadForecastForFYAsync(fyId).catch(logger.error);
  return null;
}

/**
 * Save forecast: diff against cached values and UPSERT only changed monthly_values rows.
 * Also handles new/removed line items.
 */
export async function saveForecastForFY(fyId: string, costCenters: CostCenter[]): Promise<void> {
  const oldData = forecastCache[fyId]?.data;

  // Update cache immediately (optimistic)
  forecastCache[fyId] = { data: costCenters, loadedAt: Date.now() };

  try {
    // Build old forecast lookup for diff
    const oldForecastByLIMonth: Record<string, Record<string, number>> = {};
    if (oldData) {
      for (const cc of oldData) {
        for (const li of cc.lineItems) {
          oldForecastByLIMonth[li.id] = {};
          for (const m of MONTHS) {
            oldForecastByLIMonth[li.id][m] = li.forecastValues[m];
          }
        }
      }
    }

    // Build set of current line item IDs
    const currentLIIds = new Set<string>();
    const upsertRows: { line_item_id: string; fiscal_year_id: string; value_type: string; month: string; amount: number }[] = [];

    for (const cc of costCenters) {
      for (const li of cc.lineItems) {
        currentLIIds.add(li.id);
        for (const m of MONTHS) {
          const newVal = li.forecastValues[m];
          const oldVal = oldForecastByLIMonth[li.id]?.[m];

          // If no old data (first save) or value changed, upsert
          if (oldVal === undefined || oldVal !== newVal) {
            upsertRows.push({
              line_item_id: li.id,
              fiscal_year_id: fyId,
              value_type: 'forecast',
              month: m,
              amount: newVal,
            });
          }
        }
      }
    }

    // Detect removed line items (in old but not in current)
    if (oldData) {
      const oldLIIds = new Set<string>();
      for (const cc of oldData) {
        for (const li of cc.lineItems) {
          oldLIIds.add(li.id);
        }
      }
      for (const oldId of oldLIIds) {
        if (!currentLIIds.has(oldId)) {
          // Delete the line item (cascade deletes monthly_values)
          const { error } = await supabase.from('line_items').delete().eq('id', oldId);
          if (error) logger.error('Failed to delete removed line item:', error);
        }
      }
    }

    // Batch upsert forecast monthly values
    if (upsertRows.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < upsertRows.length; i += batchSize) {
        const batch = upsertRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('monthly_values')
          .upsert(batch, { onConflict: 'line_item_id,value_type,month' });
        if (error) {
          logger.error('Failed to upsert forecast monthly values:', error);
        }
      }
    }

    // Also write to fy_forecasts JSONB as backup during transition
    try {
      const { Json } = await import('@/integrations/supabase/types');
    } catch {}
    await supabase
      .from('fy_forecasts')
      .upsert({
        fiscal_year_id: fyId,
        data: costCenters as any,
      });
  } catch (err) {
    logger.error('Error saving forecast:', err);
  }
}

/**
 * Clear forecast: DELETE forecast monthly_values only (keep budget values, cost_centers, line_items)
 */
export async function clearForecastForFY(fyId: string): Promise<void> {
  delete forecastCache[fyId];

  try {
    const { error } = await supabase
      .from('monthly_values')
      .delete()
      .eq('fiscal_year_id', fyId)
      .eq('value_type', 'forecast');

    if (error) {
      logger.error('Failed to clear forecast monthly values:', error);
    }

    // Also clear legacy JSONB backup
    await supabase
      .from('fy_forecasts')
      .delete()
      .eq('fiscal_year_id', fyId);
  } catch (err) {
    logger.error('Error clearing forecast:', err);
  }
}

// Preload forecast into cache (call this when FY is selected)
export async function preloadForecast(fyId: string): Promise<void> {
  await loadForecastForFYAsync(fyId);
}

// Clear entire cache (useful for testing or logout)
export function clearForecastCache(): void {
  forecastCache = {};
}

// Clear specific FY from cache
export function invalidateForecastCache(fyId: string): void {
  delete forecastCache[fyId];
}

// Clear all cached FYs except the given one
export function clearForecastCacheExcept(fyId: string): void {
  const kept = forecastCache[fyId];
  forecastCache = {};
  if (kept) {
    forecastCache[fyId] = kept;
  }
}

/**
 * Subscribe to realtime changes on relational tables affecting forecasts.
 * Invalidates cache for affected fiscal year.
 * Returns cleanup function.
 */
export function subscribeForecastRealtimeInvalidation(): () => void {
  const channel = supabase
    .channel('forecast-cache-invalidation')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'monthly_values',
      },
      (payload) => {
        const fyId = (payload.new as any)?.fiscal_year_id
          || (payload.old as any)?.fiscal_year_id;
        const valueType = (payload.new as any)?.value_type
          || (payload.old as any)?.value_type;

        // Only invalidate for forecast value changes
        if (valueType === 'forecast' && fyId) {
          invalidateForecastCache(fyId);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'line_items',
      },
      (payload) => {
        const fyId = (payload.new as any)?.fiscal_year_id
          || (payload.old as any)?.fiscal_year_id;
        if (fyId) {
          invalidateForecastCache(fyId);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cost_centers',
      },
      (payload) => {
        const fyId = (payload.new as any)?.fiscal_year_id
          || (payload.old as any)?.fiscal_year_id;
        if (fyId) {
          invalidateForecastCache(fyId);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
