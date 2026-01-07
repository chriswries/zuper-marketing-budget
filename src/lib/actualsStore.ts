/**
 * Storage module for actuals transactions.
 * Persists to localStorage keyed by fiscal year.
 */

import type { ActualsTransaction, ActualsSummary } from '@/types/actuals';

const STORAGE_KEY = 'mkt-actuals-v1';

interface ActualsStorage {
  [fiscalYearId: string]: ActualsTransaction[];
}

function loadAllActuals(): ActualsStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as ActualsStorage;
  } catch {
    console.error('Failed to load actuals from localStorage');
    return {};
  }
}

function saveAllActuals(data: ActualsStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save actuals to localStorage:', error);
  }
}

export function loadActuals(fiscalYearId: string): ActualsTransaction[] {
  const all = loadAllActuals();
  return all[fiscalYearId] ?? [];
}

export function appendActuals(fiscalYearId: string, txns: ActualsTransaction[]): void {
  const all = loadAllActuals();
  const existing = all[fiscalYearId] ?? [];
  all[fiscalYearId] = [...existing, ...txns];
  saveAllActuals(all);
}

export function replaceActuals(fiscalYearId: string, txns: ActualsTransaction[]): void {
  const all = loadAllActuals();
  all[fiscalYearId] = txns;
  saveAllActuals(all);
}

export function deleteActualsForFY(fiscalYearId: string): void {
  const all = loadAllActuals();
  delete all[fiscalYearId];
  saveAllActuals(all);
}

export function getActualsSummary(fiscalYearId: string): ActualsSummary {
  const txns = loadActuals(fiscalYearId);
  
  if (txns.length === 0) {
    return { count: 0, total: 0 };
  }

  let total = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (const txn of txns) {
    total += txn.amount;
    if (!minDate || txn.txnDate < minDate) minDate = txn.txnDate;
    if (!maxDate || txn.txnDate > maxDate) maxDate = txn.txnDate;
  }

  return { count: txns.length, total, minDate, maxDate };
}
