import { CostCenter } from '@/types/budget';

const FORECAST_BY_FY_KEY = 'forecast_cost_centers_by_fy_v1';

function loadForecasts(): Record<string, CostCenter[]> {
  try {
    const stored = localStorage.getItem(FORECAST_BY_FY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load forecasts from localStorage', e);
  }
  return {};
}

function saveForecasts(forecasts: Record<string, CostCenter[]>): void {
  try {
    localStorage.setItem(FORECAST_BY_FY_KEY, JSON.stringify(forecasts));
  } catch (e) {
    console.error('Failed to save forecasts to localStorage', e);
  }
}

export function loadForecastForFY(fyId: string): CostCenter[] | null {
  const all = loadForecasts();
  return all[fyId] ?? null;
}

export function saveForecastForFY(fyId: string, costCenters: CostCenter[]): void {
  const all = loadForecasts();
  all[fyId] = costCenters;
  saveForecasts(all);
}

export function clearForecastForFY(fyId: string): void {
  const all = loadForecasts();
  delete all[fyId];
  saveForecasts(all);
}
