import type { ActualsImportBatch } from '@/types/actualsImport';

const STORAGE_KEY = 'lovable_actuals_import_latest';

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
