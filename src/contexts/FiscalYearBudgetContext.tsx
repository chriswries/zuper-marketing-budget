import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CostCenter, LineItem, MonthlyValues, MONTHS, FiscalYearStatus, createZeroMonthlyValues } from '@/types/budget';
export type { FiscalYearStatus } from '@/types/budget';

import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

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
  year: number;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  targetBudget: number;
  costCenters: CostCenter[];
  approval: BudgetApproval;
  createdAt: string;
  updatedAt: string;
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
    if (stored) return JSON.parse(stored);
  } catch (e) {
    logger.error('Failed to load selected FY from localStorage', e);
  }
  return null;
}

function saveSelectedToStorage(id: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(id));
  } catch (e) {
    logger.error('Failed to save selected FY to localStorage', e);
  }
}

// ─── Relational read: assemble FiscalYearBudget from normalized tables ───

async function fetchSingleFY(fyId: string): Promise<FiscalYearBudget | null> {
  const [fyRes, stepsRes, ccRes, liRes, mvRes] = await Promise.all([
    supabase.from('fiscal_years').select('*').eq('id', fyId).single(),
    supabase.from('budget_approval_steps').select('*').eq('fiscal_year_id', fyId).order('step_order'),
    supabase.from('cost_centers').select('*').eq('fiscal_year_id', fyId),
    supabase.from('line_items').select('*').eq('fiscal_year_id', fyId),
    supabase.from('monthly_values').select('*').eq('fiscal_year_id', fyId).eq('value_type', 'budget'),
  ]);

  if (fyRes.error || !fyRes.data) return null;
  return assembleFromRelational(fyRes.data, stepsRes.data ?? [], ccRes.data ?? [], liRes.data ?? [], mvRes.data ?? []);
}

function assembleFromRelational(
  fyRow: any,
  steps: any[],
  costCenterRows: any[],
  lineItemRows: any[],
  monthlyValueRows: any[],
): FiscalYearBudget {
  // Build monthly values lookup: lineItemId -> { month -> amount }
  const mvByLI: Record<string, MonthlyValues> = {};
  for (const mv of monthlyValueRows) {
    if (!mvByLI[mv.line_item_id]) mvByLI[mv.line_item_id] = createZeroMonthlyValues();
    mvByLI[mv.line_item_id][mv.month as keyof MonthlyValues] = Number(mv.amount);
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
      budgetValues: mvByLI[li.id] ?? createZeroMonthlyValues(),
      forecastValues: createZeroMonthlyValues(), // Forecast loaded separately
      actualValues: createZeroMonthlyValues(),   // Actuals loaded separately
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
  const costCenters: CostCenter[] = costCenterRows.map((cc) => ({
    id: cc.id,
    name: cc.name,
    ownerId: cc.owner_id ?? null,
    annualLimit: Number(cc.annual_limit),
    lineItems: liByCC[cc.id] ?? [],
  }));

  // Build approval
  const approval: BudgetApproval = {
    status: (fyRow.approval_status ?? 'draft') as BudgetApprovalStatus,
    steps: steps.map((s) => ({
      level: s.level as BudgetApprovalLevel,
      status: s.status as 'pending' | 'approved' | 'rejected',
      updatedAt: s.updated_at ?? undefined,
    })),
    submittedAt: fyRow.approval_submitted_at ?? undefined,
    approvedAt: fyRow.approval_approved_at ?? undefined,
    rejectedAt: fyRow.approval_rejected_at ?? undefined,
  };

  return {
    id: fyRow.id,
    name: fyRow.name,
    status: fyRow.status as FiscalYearStatus,
    year: fyRow.year ?? 0,
    startDate: fyRow.start_date ?? '',
    endDate: fyRow.end_date ?? '',
    targetBudget: Number(fyRow.target_budget),
    costCenters,
    approval,
    createdAt: fyRow.created_at,
    updatedAt: fyRow.updated_at,
    archivedAt: fyRow.archived_at ?? undefined,
    archivedByRole: fyRow.archived_by_role ?? undefined,
    archivedJustification: fyRow.archived_justification ?? undefined,
    previousStatusBeforeArchive: fyRow.previous_status_before_archive as FiscalYearStatus | undefined,
  };
}

// ─── Relational write helpers ───

async function persistFYMetadata(fy: FiscalYearBudget): Promise<boolean> {
  const { error } = await supabase
    .from('fiscal_years')
    .update({
      name: fy.name,
      status: fy.status,
      year: fy.year,
      start_date: fy.startDate,
      end_date: fy.endDate,
      target_budget: fy.targetBudget,
      approval_status: fy.approval.status,
      approval_submitted_at: fy.approval.submittedAt ?? null,
      approval_approved_at: fy.approval.approvedAt ?? null,
      approval_rejected_at: fy.approval.rejectedAt ?? null,
      archived_at: fy.archivedAt ?? null,
      archived_by_role: fy.archivedByRole ?? null,
      archived_justification: fy.archivedJustification ?? null,
      previous_status_before_archive: fy.previousStatusBeforeArchive ?? null,
    })
    .eq('id', fy.id);
  return !error;
}

async function persistApprovalSteps(fyId: string, steps: BudgetApprovalStep[]): Promise<void> {
  // Delete existing steps and re-insert
  await supabase.from('budget_approval_steps').delete().eq('fiscal_year_id', fyId);
  if (steps.length > 0) {
    const rows = steps.map((s, i) => ({
      fiscal_year_id: fyId,
      level: s.level,
      status: s.status,
      updated_at: s.updatedAt ?? null,
      step_order: i + 1,
    }));
    await supabase.from('budget_approval_steps').insert(rows);
  }
}

async function persistCostCentersAndLineItems(fyId: string, costCenters: CostCenter[]): Promise<void> {
  // Get existing cost center and line item IDs for this FY
  const [existingCCs, existingLIs] = await Promise.all([
    supabase.from('cost_centers').select('id').eq('fiscal_year_id', fyId),
    supabase.from('line_items').select('id').eq('fiscal_year_id', fyId),
  ]);

  const existingCCIds = new Set((existingCCs.data ?? []).map((r: any) => r.id));
  const existingLIIds = new Set((existingLIs.data ?? []).map((r: any) => r.id));

  const newCCIds = new Set(costCenters.map((cc) => cc.id));
  const allLineItems = costCenters.flatMap((cc) => cc.lineItems);
  const newLIIds = new Set(allLineItems.map((li) => li.id));

  // Delete removed line items first (before cost centers, due to FK)
  const removedLIs = [...existingLIIds].filter((id) => !newLIIds.has(id));
  if (removedLIs.length > 0) {
    await supabase.from('line_items').delete().in('id', removedLIs);
  }

  // Delete removed cost centers
  const removedCCs = [...existingCCIds].filter((id) => !newCCIds.has(id));
  if (removedCCs.length > 0) {
    await supabase.from('cost_centers').delete().in('id', removedCCs);
  }

  // Upsert cost centers
  for (const cc of costCenters) {
    await supabase.from('cost_centers').upsert({
      id: cc.id,
      fiscal_year_id: fyId,
      name: cc.name,
      owner_id: cc.ownerId ?? null,
      annual_limit: cc.annualLimit,
    }, { onConflict: 'id' });
  }

  // Upsert line items
  for (const cc of costCenters) {
    for (const li of cc.lineItems) {
      await supabase.from('line_items').upsert({
        id: li.id,
        cost_center_id: cc.id,
        fiscal_year_id: fyId,
        name: li.name,
        vendor_id: null, // vendor FK not mapped yet
        vendor_name: li.vendor?.name ?? null,
        owner_id: li.ownerId ?? null,
        is_contracted: li.isContracted,
        is_accrual: li.isAccrual,
        is_software_subscription: li.isSoftwareSubscription,
        contract_start_date: li.contractStartDate ?? null,
        contract_end_date: li.contractEndDate ?? null,
        auto_renew: li.autoRenew ?? null,
        cancellation_notice_days: li.cancellationNoticeDays ?? null,
        approval_status: li.approvalStatus ?? null,
        approval_request_id: li.approvalRequestId ?? null,
        adjustment_status: li.adjustmentStatus ?? null,
        adjustment_request_id: li.adjustmentRequestId ?? null,
        adjustment_before_values: li.adjustmentBeforeValues ? (li.adjustmentBeforeValues as any) : null,
        adjustment_sheet: li.adjustmentSheet ?? null,
        deletion_status: li.deletionStatus ?? null,
        deletion_request_id: li.deletionRequestId ?? null,
        cancellation_status: li.cancellationStatus ?? null,
        cancellation_request_id: li.cancellationRequestId ?? null,
      }, { onConflict: 'id' });
    }
  }
}

async function persistBudgetMonthlyValues(fyId: string, costCenters: CostCenter[]): Promise<void> {
  const rows: Array<{ line_item_id: string; fiscal_year_id: string; value_type: string; month: string; amount: number }> = [];
  for (const cc of costCenters) {
    for (const li of cc.lineItems) {
      for (const month of MONTHS) {
        rows.push({
          line_item_id: li.id,
          fiscal_year_id: fyId,
          value_type: 'budget',
          month,
          amount: li.budgetValues[month] ?? 0,
        });
      }
    }
  }

  // Batch upsert in chunks of 500
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await supabase.from('monthly_values').upsert(batch, { onConflict: 'line_item_id,value_type,month' });
  }
}


// ─── Provider ───

export function FiscalYearBudgetProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYearBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiscalYearId, setSelectedFiscalYearIdState] = useState<string | null>(() =>
    loadSelectedFromStorage()
  );

  const initializedForSessionRef = useRef<string | null>(null);

  // Fetch all fiscal years from relational tables
  const fetchFiscalYears = useCallback(async (): Promise<FiscalYearBudget[]> => {
    setLoading(true);
    try {
      const [fyRes, stepsRes, ccRes, liRes, mvRes] = await Promise.all([
        supabase.from('fiscal_years').select('*').order('created_at', { ascending: false }),
        supabase.from('budget_approval_steps').select('*').order('step_order'),
        supabase.from('cost_centers').select('*'),
        supabase.from('line_items').select('*'),
        supabase.from('monthly_values').select('*').eq('value_type', 'budget'),
      ]);

      if (fyRes.error) {
        logger.error('Failed to fetch fiscal years:', fyRes.error);
        return [];
      }

      const allFYs = fyRes.data ?? [];
      const allSteps = stepsRes.data ?? [];
      const allCCs = ccRes.data ?? [];
      const allLIs = liRes.data ?? [];
      const allMVs = mvRes.data ?? [];

      // Group by fiscal_year_id
      const stepsByFY: Record<string, any[]> = {};
      for (const s of allSteps) {
        if (!stepsByFY[s.fiscal_year_id]) stepsByFY[s.fiscal_year_id] = [];
        stepsByFY[s.fiscal_year_id].push(s);
      }
      const ccsByFY: Record<string, any[]> = {};
      for (const cc of allCCs) {
        if (!ccsByFY[cc.fiscal_year_id]) ccsByFY[cc.fiscal_year_id] = [];
        ccsByFY[cc.fiscal_year_id].push(cc);
      }
      const lisByFY: Record<string, any[]> = {};
      for (const li of allLIs) {
        if (!lisByFY[li.fiscal_year_id]) lisByFY[li.fiscal_year_id] = [];
        lisByFY[li.fiscal_year_id].push(li);
      }
      const mvsByFY: Record<string, any[]> = {};
      for (const mv of allMVs) {
        if (!mvsByFY[mv.fiscal_year_id]) mvsByFY[mv.fiscal_year_id] = [];
        mvsByFY[mv.fiscal_year_id].push(mv);
      }

      const mapped = allFYs.map((fy) =>
        assembleFromRelational(
          fy,
          stepsByFY[fy.id] ?? [],
          ccsByFY[fy.id] ?? [],
          lisByFY[fy.id] ?? [],
          mvsByFY[fy.id] ?? [],
        )
      );

      setFiscalYears(mapped);
      return mapped;
    } catch (err) {
      logger.error('Error fetching fiscal years:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch a single FY and merge into state
  const refetchSingleFY = useCallback(async (fyId: string) => {
    const fy = await fetchSingleFY(fyId);
    if (fy) {
      setFiscalYears((prev) => {
        const idx = prev.findIndex((f) => f.id === fyId);
        if (idx === -1) return [fy, ...prev];
        const next = [...prev];
        next[idx] = fy;
        return next;
      });
    }
  }, []);

  // Auth-aware initialization
  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setFiscalYears([]);
      setSelectedFiscalYearIdState(null);
      setLoading(false);
      initializedForSessionRef.current = null;
      return;
    }

    const sessionKey = session.user?.id ?? 'unknown';
    if (initializedForSessionRef.current === sessionKey) return;
    initializedForSessionRef.current = sessionKey;

    const initializeFiscalYears = async () => {
      logger.info('Initializing fiscal years for session:', sessionKey);
      const loadedFYs = await fetchFiscalYears();

      if (loadedFYs.length === 0) {
        setSelectedFiscalYearIdState(null);
        return;
      }

      const storedId = loadSelectedFromStorage();
      const storedIsValid = storedId && loadedFYs.some((fy) => fy.id === storedId);

      if (storedIsValid) {
        setSelectedFiscalYearIdState(storedId);
      } else {
        const activeFYs = loadedFYs.filter((fy) => fy.status === 'active');
        const defaultFY = activeFYs.length > 0 ? activeFYs[0] : loadedFYs[0];
        if (defaultFY) {
          logger.info('Auto-selecting fiscal year:', defaultFY.name);
          setSelectedFiscalYearIdState(defaultFY.id);
          saveSelectedToStorage(defaultFY.id);
        }
      }
    };

    initializeFiscalYears();
  }, [authLoading, session, fetchFiscalYears]);

  // Realtime subscriptions
  useEffect(() => {
    const fyChannel = supabase
      .channel('fy_relational_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_years' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as Record<string, unknown>;
          if (oldRow?.id) {
            setFiscalYears((prev) => prev.filter((fy) => fy.id !== oldRow.id));
          } else {
            fetchFiscalYears();
          }
        } else {
          const row = payload.new as Record<string, unknown>;
          if (row?.id) {
            refetchSingleFY(row.id as string);
          } else {
            fetchFiscalYears();
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cost_centers' }, (payload) => {
        const fyId = (payload.new as any)?.fiscal_year_id || (payload.old as any)?.fiscal_year_id;
        if (fyId) refetchSingleFY(fyId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_items' }, (payload) => {
        const fyId = (payload.new as any)?.fiscal_year_id || (payload.old as any)?.fiscal_year_id;
        if (fyId) refetchSingleFY(fyId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_values' }, (payload) => {
        const row = (payload.new as any) || (payload.old as any);
        if (row?.fiscal_year_id) refetchSingleFY(row.fiscal_year_id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(fyChannel);
    };
  }, [fetchFiscalYears, refetchSingleFY]);

  // Persist selectedFiscalYearId and clear caches
  useEffect(() => {
    saveSelectedToStorage(selectedFiscalYearId);
    if (selectedFiscalYearId) {
      import('@/lib/forecastStore').then(({ clearForecastCacheExcept }) => clearForecastCacheExcept(selectedFiscalYearId));
      import('@/lib/actualsStore').then(({ clearActualsCacheExcept }) => clearActualsCacheExcept(selectedFiscalYearId));
      import('@/lib/actualsMatchingStore').then(({ clearMatchingCacheExcept }) => clearMatchingCacheExcept(selectedFiscalYearId));
    }
  }, [selectedFiscalYearId]);

  const listFiscalYears = useCallback(() => fiscalYears, [fiscalYears]);
  const getSelectedFiscalYearId = useCallback(() => selectedFiscalYearId, [selectedFiscalYearId]);
  const setSelectedFiscalYearId = useCallback((id: string | null) => setSelectedFiscalYearIdState(id), []);

  const createFiscalYearBudget = useCallback(async (draft: FiscalYearBudget): Promise<boolean> => {
    // Optimistically add to state
    setFiscalYears((prev) => [draft, ...prev]);

    try {
      // 1. Insert fiscal_years row
      const { error: fyError } = await supabase.from('fiscal_years').insert({
        id: draft.id,
        name: draft.name,
        status: draft.status,
        year: draft.year,
        start_date: draft.startDate,
        end_date: draft.endDate,
        target_budget: draft.targetBudget,
        approval_status: draft.approval.status,
        approval_submitted_at: draft.approval.submittedAt ?? null,
        approval_approved_at: draft.approval.approvedAt ?? null,
        approval_rejected_at: draft.approval.rejectedAt ?? null,
      } as any);

      if (fyError) {
        logger.error('Failed to create fiscal year:', fyError);
        setFiscalYears((prev) => prev.filter((fy) => fy.id !== draft.id));
        toast({ variant: 'destructive', title: 'Failed to create fiscal year', description: 'Your changes could not be saved.' });
        return false;
      }

      // 2. Insert approval steps
      await persistApprovalSteps(draft.id, draft.approval.steps);

      // 3. Insert cost centers, line items, monthly values
      await persistCostCentersAndLineItems(draft.id, draft.costCenters);
      await persistBudgetMonthlyValues(draft.id, draft.costCenters);

      return true;
    } catch (err) {
      logger.error('Error creating fiscal year:', err);
      setFiscalYears((prev) => prev.filter((fy) => fy.id !== draft.id));
      toast({ variant: 'destructive', title: 'Failed to create fiscal year', description: 'Your changes could not be saved.' });
      return false;
    }
  }, []);

  const updateFiscalYearBudget = useCallback(async (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => {
    let oldFY: FiscalYearBudget | null = null;
    let updatedFY: FiscalYearBudget | null = null;

    // Optimistically update state
    setFiscalYears((prev) =>
      prev.map((fy) => {
        if (fy.id === id) {
          oldFY = fy;
          updatedFY = updater(fy);
          return updatedFY;
        }
        return fy;
      })
    );

    if (!updatedFY || !oldFY) return;
    const updated = updatedFY as FiscalYearBudget;
    const old = oldFY as FiscalYearBudget;

    try {
      // Always persist metadata (includes JSONB backup)
      const metaOk = await persistFYMetadata(updated);
      if (!metaOk) throw new Error('Failed to update fiscal year metadata');

      // Persist approval steps if changed
      if (JSON.stringify(updated.approval.steps) !== JSON.stringify(old.approval.steps)) {
        await persistApprovalSteps(id, updated.approval.steps);
      }

      // Persist cost centers and line items if changed
      const costCentersChanged = JSON.stringify(updated.costCenters) !== JSON.stringify(old.costCenters);
      if (costCentersChanged) {
        await persistCostCentersAndLineItems(id, updated.costCenters);
        await persistBudgetMonthlyValues(id, updated.costCenters);
      }
    } catch (err) {
      logger.error('Failed to update fiscal year:', err);
      toast({ variant: 'destructive', title: 'Failed to save changes', description: 'Data has been refreshed from the server.' });
      fetchFiscalYears();
    }
  }, [fetchFiscalYears]);

  const deleteFiscalYearBudget = useCallback(async (id: string) => {
    setFiscalYears((prev) => prev.filter((fy) => fy.id !== id));

    if (selectedFiscalYearId === id) {
      setSelectedFiscalYearIdState(null);
    }

    const { error } = await supabase.from('fiscal_years').delete().eq('id', id);

    if (error) {
      logger.error('Failed to delete fiscal year:', error);
      toast({ variant: 'destructive', title: 'Failed to delete fiscal year', description: 'Data has been refreshed from the server.' });
      fetchFiscalYears();
    }
  }, [selectedFiscalYearId, fetchFiscalYears]);

  const selectedFiscalYear = fiscalYears.find((fy) => fy.id === selectedFiscalYearId) ?? null;

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
