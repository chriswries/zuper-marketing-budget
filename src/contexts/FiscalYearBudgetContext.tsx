import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CostCenter } from '@/types/budget';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

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
  loading: boolean;
  listFiscalYears: () => FiscalYearBudget[];
  getSelectedFiscalYearId: () => string | null;
  setSelectedFiscalYearId: (id: string | null) => void;
  createFiscalYearBudget: (draft: FiscalYearBudget) => Promise<boolean>;
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => Promise<void>;
  deleteFiscalYearBudget: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const FiscalYearBudgetContext = createContext<FiscalYearBudgetContextValue | null>(null);

const STORAGE_KEY_SELECTED = 'selected_budget_fy_v1';

function loadSelectedFromStorage(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SELECTED);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load selected FY from localStorage', e);
  }
  return null;
}

function saveSelectedToStorage(id: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(id));
  } catch (e) {
    console.error('Failed to save selected FY to localStorage', e);
  }
}

// Map DB row to FiscalYearBudget
function rowToFiscalYear(row: {
  id: string;
  name: string;
  status: string;
  data: Json;
  archived_at: string | null;
  archived_by_user_id: string | null;
  archived_by_role: string | null;
  archived_justification: string | null;
  previous_status_before_archive: string | null;
}): FiscalYearBudget {
  const data = row.data as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    status: row.status as FiscalYearStatus,
    year: data.year as number,
    startDate: data.startDate as string,
    endDate: data.endDate as string,
    targetBudget: data.targetBudget as number,
    costCenters: data.costCenters as CostCenter[],
    approval: data.approval as BudgetApproval,
    createdAt: data.createdAt as string,
    updatedAt: data.updatedAt as string,
    archivedAt: row.archived_at ?? undefined,
    archivedByRole: row.archived_by_role ?? (data.archivedByRole as string | undefined),
    archivedJustification: row.archived_justification ?? undefined,
    previousStatusBeforeArchive: (row.previous_status_before_archive ?? data.previousStatusBeforeArchive) as FiscalYearStatus | undefined,
  };
}

// Map FiscalYearBudget to DB row
function fiscalYearToRow(fy: FiscalYearBudget): {
  id: string;
  name: string;
  status: string;
  data: Json;
  archived_at: string | null;
  archived_by_role: string | null;
  archived_justification: string | null;
  previous_status_before_archive: string | null;
} {
  const { id, name, status, archivedAt, archivedByRole, archivedJustification, previousStatusBeforeArchive, ...rest } = fy;
  return {
    id,
    name,
    status,
    data: rest as unknown as Json,
    archived_at: archivedAt ?? null,
    archived_by_role: archivedByRole ?? null,
    archived_justification: archivedJustification ?? null,
    previous_status_before_archive: previousStatusBeforeArchive ?? null,
  };
}

export function FiscalYearBudgetProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiscalYearId, setSelectedFiscalYearIdState] = useState<string | null>(() => 
    loadSelectedFromStorage()
  );
  
  // Track if we've initialized for the current session to avoid double-fetches
  const initializedForSessionRef = useRef<string | null>(null);

  // Fetch fiscal years from DB
  const fetchFiscalYears = useCallback(async (): Promise<FiscalYearBudget[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fiscal_years')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch fiscal years:', error);
        return [];
      }

      const mapped = (data || []).map(rowToFiscalYear);
      setFiscalYears(mapped);
      return mapped;
    } catch (err) {
      console.error('Error fetching fiscal years:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth-aware initialization: fetch FYs when session becomes available
  useEffect(() => {
    // Still loading auth - do nothing yet
    if (authLoading) {
      return;
    }

    // No session (logged out) - clear in-memory state
    if (!session) {
      setFiscalYears([]);
      setSelectedFiscalYearIdState(null);
      setLoading(false);
      initializedForSessionRef.current = null;
      return;
    }

    // Session exists - check if we've already initialized for this session
    const sessionKey = session.user?.id ?? 'unknown';
    if (initializedForSessionRef.current === sessionKey) {
      // Already initialized for this session, skip
      return;
    }

    // Mark as initializing for this session
    initializedForSessionRef.current = sessionKey;

    const initializeFiscalYears = async () => {
      console.log('Initializing fiscal years for session:', sessionKey);
      const loadedFYs = await fetchFiscalYears();
      
      if (loadedFYs.length === 0) {
        // No FYs exist - clear any stale selection
        setSelectedFiscalYearIdState(null);
        return;
      }

      // Check if current selection is valid
      const storedId = loadSelectedFromStorage();
      const storedIsValid = storedId && loadedFYs.some(fy => fy.id === storedId);
      
      if (storedIsValid) {
        // Stored selection is valid, ensure state matches
        setSelectedFiscalYearIdState(storedId);
      } else {
        // Auto-select: prefer newest active FY, otherwise newest FY
        const activeFYs = loadedFYs.filter(fy => fy.status === 'active');
        const defaultFY = activeFYs.length > 0 ? activeFYs[0] : loadedFYs[0];
        
        if (defaultFY) {
          console.log('Auto-selecting fiscal year:', defaultFY.name);
          setSelectedFiscalYearIdState(defaultFY.id);
          saveSelectedToStorage(defaultFY.id);
        }
      }
    };
    
    initializeFiscalYears();
  }, [authLoading, session, fetchFiscalYears]);

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('fiscal_years_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fiscal_years',
        },
        () => {
          fetchFiscalYears();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFiscalYears]);

  // Persist selectedFiscalYearId to localStorage
  useEffect(() => {
    saveSelectedToStorage(selectedFiscalYearId);
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

  const createFiscalYearBudget = useCallback(async (draft: FiscalYearBudget): Promise<boolean> => {
    // Optimistically add to state
    setFiscalYears((prev) => [draft, ...prev]);

    const row = fiscalYearToRow(draft);
    const { error } = await supabase
      .from('fiscal_years')
      .insert(row);

    if (error) {
      console.error('Failed to create fiscal year:', error);
      // Remove from state on error
      setFiscalYears((prev) => prev.filter((fy) => fy.id !== draft.id));
      return false;
    }
    return true;
  }, []);

  const updateFiscalYearBudget = useCallback(async (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => {
    let updatedFY: FiscalYearBudget | null = null;

    // Optimistically update state
    setFiscalYears((prev) =>
      prev.map((fy) => {
        if (fy.id === id) {
          updatedFY = updater(fy);
          return updatedFY;
        }
        return fy;
      })
    );

    if (updatedFY) {
      const row = fiscalYearToRow(updatedFY);
      const { error } = await supabase
        .from('fiscal_years')
        .update({
          name: row.name,
          status: row.status,
          data: row.data,
          archived_at: row.archived_at,
          archived_by_role: row.archived_by_role,
          archived_justification: row.archived_justification,
          previous_status_before_archive: row.previous_status_before_archive,
        })
        .eq('id', id);

      if (error) {
        console.error('Failed to update fiscal year:', error);
        // Could refetch to revert
      }
    }
  }, []);

  const deleteFiscalYearBudget = useCallback(async (id: string) => {
    // Optimistically remove from state
    setFiscalYears((prev) => prev.filter((fy) => fy.id !== id));
    
    // Clear selection if deleted FY was selected
    if (selectedFiscalYearId === id) {
      setSelectedFiscalYearIdState(null);
    }

    const { error } = await supabase
      .from('fiscal_years')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete fiscal year:', error);
      // Refetch to restore
      fetchFiscalYears();
    }
  }, [selectedFiscalYearId, fetchFiscalYears]);

  const selectedFiscalYear = fiscalYears.find((fy) => fy.id === selectedFiscalYearId) ?? null;

  // Wrapper to make refetch return Promise<void> for external callers
  const refetch = useCallback(async (): Promise<void> => {
    await fetchFiscalYears();
  }, [fetchFiscalYears]);

  const value: FiscalYearBudgetContextValue = {
    fiscalYears,
    selectedFiscalYearId,
    selectedFiscalYear,
    loading,
    listFiscalYears,
    getSelectedFiscalYearId,
    setSelectedFiscalYearId,
    createFiscalYearBudget,
    updateFiscalYearBudget,
    deleteFiscalYearBudget,
    refetch,
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
