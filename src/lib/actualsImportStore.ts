import type { ActualsImportBatch } from '@/types/actualsImport';

const STORAGE_KEY = 'lovable_actuals_import_latest';

/**
 * All localStorage keys used by legacy actuals import flows.
 * These may contain data from before DB persistence was implemented.
 */
const LEGACY_ACTUALS_IMPORT_KEYS = [
  'lovable_actuals_import_latest', // Current import batch receipt
  'actuals_transactions_v1',       // Legacy transaction storage
  'actualsTransactions',           // Legacy transaction storage (older)
  'actuals_matching_v1',           // Legacy matching rules
  'actualsMatching',               // Legacy matching rules (older)
];

export function saveLatestActualsImport(batch: ActualsImportBatch): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
  } catch (error) {
    console.error('Failed to save actuals import to localStorage:', error);
  }
}

export function loadLatestActualsImport(): ActualsImportBatch | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ActualsImportBatch;
  } catch (error) {
    console.error('Failed to load actuals import from localStorage:', error);
    return null;
  }
}

export function clearLatestActualsImport(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear actuals import from localStorage:', error);
  }
}

/**
 * Clear ALL legacy actuals import localStorage data.
 * This removes data from before DB persistence was implemented.
 * Does NOT affect any data in the database.
 * 
 * @returns Object with list of keys that were actually cleared (had data)
 */
export function clearLegacyActualsImportLocalStorage(): { clearedKeys: string[] } {
  const clearedKeys: string[] = [];

  for (const key of LEGACY_ACTUALS_IMPORT_KEYS) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        clearedKeys.push(key);
      }
    } catch (error) {
      console.error(`Failed to clear localStorage key "${key}":`, error);
    }
  }

  return { clearedKeys };
}

/**
 * Check if any legacy actuals import data exists in localStorage.
 * @returns true if any legacy keys have data
 */
export function hasLegacyActualsImportData(): boolean {
  for (const key of LEGACY_ACTUALS_IMPORT_KEYS) {
    try {
      if (localStorage.getItem(key) !== null) {
        return true;
      }
    } catch {
      // Ignore errors, just check next key
    }
  }
  return false;
}
