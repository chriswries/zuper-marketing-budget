import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CostCenter } from '@/types/budget';

export type FiscalYearStatus = 'planning' | 'active' | 'closed' | 'archived';

export type BudgetApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type BudgetApprovalLevel = 'cmo' | 'finance';

export interface BudgetApprovalStep {
  level: BudgetApprovalLevel;
  status: 'pending' | 'approved' | 'rejected';
  updatedAt?: string;
}

export interface BudgetApproval {
  status: BudgetApprovalStatus;
  steps: BudgetApprovalStep[];
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export interface FiscalYearBudget {
  id: string;
  year: number; // e.g., 2027 for FY2027 (Feb 2027 → Jan 2028)
  name: string; // e.g., "FY2027"
  startDate: string; // ISO date (Feb 1 of year)
  endDate: string; // ISO date (Jan 31 of year+1)
  status: FiscalYearStatus;
  targetBudget: number;
  costCenters: CostCenter[];
  approval: BudgetApproval;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  // Archive metadata
  archivedAt?: string;
  archivedByRole?: string;
  archivedJustification?: string;
  previousStatusBeforeArchive?: FiscalYearStatus;
}

interface FiscalYearBudgetContextValue {
  fiscalYears: FiscalYearBudget[];
  selectedFiscalYearId: string | null;
  selectedFiscalYear: FiscalYearBudget | null;
  listFiscalYears: () => FiscalYearBudget[];
  getSelectedFiscalYearId: () => string | null;
  setSelectedFiscalYearId: (id: string | null) => void;
  createFiscalYearBudget: (draft: FiscalYearBudget) => void;
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => void;
  deleteFiscalYearBudget: (id: string) => void;
}

const FiscalYearBudgetContext = createContext<FiscalYearBudgetContextValue | null>(null);

const STORAGE_KEY_BUDGETS = 'fy_budgets_v1';
const STORAGE_KEY_SELECTED = 'selected_budget_fy_v1';

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage`, e);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage`, e);
  }
}

export function FiscalYearBudgetProvider({ children }: { children: ReactNode }) {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearBudget[]>(() => 
    loadFromStorage<FiscalYearBudget[]>(STORAGE_KEY_BUDGETS, [])
  );
  
  const [selectedFiscalYearId, setSelectedFiscalYearIdState] = useState<string | null>(() => 
    loadFromStorage<string | null>(STORAGE_KEY_SELECTED, null)
  );

  // Persist fiscalYears to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEY_BUDGETS, fiscalYears);
  }, [fiscalYears]);

  // Persist selectedFiscalYearId to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEY_SELECTED, selectedFiscalYearId);
  }, [selectedFiscalYearId]);

  const listFiscalYears = useCallback(() => {
    return fiscalYears;
  }, [fiscalYears]);

  const getSelectedFiscalYearId = useCallback(() => {
    return selectedFiscalYearId;
  }, [selectedFiscalYearId]);

  const setSelectedFiscalYearId = useCallback((id: string | null) => {
    setSelectedFiscalYearIdState(id);
  }, []);

  const createFiscalYearBudget = useCallback((draft: FiscalYearBudget) => {
    setFiscalYears((prev) => [...prev, draft]);
  }, []);

  const updateFiscalYearBudget = useCallback((id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => {
    setFiscalYears((prev) => 
      prev.map((fy) => (fy.id === id ? updater(fy) : fy))
    );
  }, []);

  const deleteFiscalYearBudget = useCallback((id: string) => {
    setFiscalYears((prev) => prev.filter((fy) => fy.id !== id));
    // Clear selection if deleted FY was selected
    if (selectedFiscalYearId === id) {
      setSelectedFiscalYearIdState(null);
    }
  }, [selectedFiscalYearId]);

  const selectedFiscalYear = fiscalYears.find((fy) => fy.id === selectedFiscalYearId) ?? null;

  const value: FiscalYearBudgetContextValue = {
    fiscalYears,
    selectedFiscalYearId,
    selectedFiscalYear,
    listFiscalYears,
    getSelectedFiscalYearId,
    setSelectedFiscalYearId,
    createFiscalYearBudget,
    updateFiscalYearBudget,
    deleteFiscalYearBudget,
  };

  return (
    <FiscalYearBudgetContext.Provider value={value}>
      {children}
    </FiscalYearBudgetContext.Provider>
  );
}

export function useFiscalYearBudget() {
  const context = useContext(FiscalYearBudgetContext);
  if (!context) {
    throw new Error('useFiscalYearBudget must be used within a FiscalYearBudgetProvider');
  }
  return context;
}
