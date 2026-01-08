/**
 * Forecast store - persists to Supabase fy_forecasts table.
 */

import { supabase } from '@/integrations/supabase/client';
import { CostCenter } from '@/types/budget';
import type { Json } from '@/integrations/supabase/types';

// In-memory cache for synchronous access patterns
let forecastCache: Record<string, CostCenter[] | null> = {};

export async function loadForecastForFYAsync(fyId: string): Promise<CostCenter[] | null> {
  try {
    const { data, error } = await supabase
      .from('fy_forecasts')
      .select('data')
      .eq('fiscal_year_id', fyId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load forecast:', error);
      return null;
    }

    if (!data) {
      forecastCache[fyId] = null;
      return null;
    }

    const costCenters = data.data as unknown as CostCenter[];
    forecastCache[fyId] = costCenters;
    return costCenters;
  } catch (err) {
    console.error('Error loading forecast:', err);
    return null;
  }
}

// Synchronous version that returns cached data (for backward compatibility)
export function loadForecastForFY(fyId: string): CostCenter[] | null {
  // Return cached value if available
  if (fyId in forecastCache) {
    return forecastCache[fyId];
  }
  
  // Trigger async load for next time
  loadForecastForFYAsync(fyId).catch(console.error);
  
  return null;
}

export async function saveForecastForFY(fyId: string, costCenters: CostCenter[]): Promise<void> {
  // Update cache immediately
  forecastCache[fyId] = costCenters;

  try {
    const { error } = await supabase
      .from('fy_forecasts')
      .upsert({
        fiscal_year_id: fyId,
        data: costCenters as unknown as Json,
      });

    if (error) {
      console.error('Failed to save forecast:', error);
    }
  } catch (err) {
    console.error('Error saving forecast:', err);
  }
}

export async function clearForecastForFY(fyId: string): Promise<void> {
  // Clear cache
  delete forecastCache[fyId];

  try {
    const { error } = await supabase
      .from('fy_forecasts')
      .delete()
      .eq('fiscal_year_id', fyId);

    if (error) {
      console.error('Failed to clear forecast:', error);
    }
  } catch (err) {
    console.error('Error clearing forecast:', err);
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
