import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SpendRequest, ApprovalStep, createDefaultApprovalSteps, RequestStatus } from '@/types/requests';
import { resolveForecastRowActionRequest } from '@/lib/forecastRowActionResolver';

import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface RequestsContextType {
  requests: SpendRequest[];
  addRequest: (request: SpendRequest) => Promise<void>;
  getRequest: (id: string) => SpendRequest | undefined;
  updateRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => Promise<void>;
  setRequests: (updater: (prev: SpendRequest[]) => SpendRequest[]) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const RequestsContext = createContext<RequestsContextType | undefined>(undefined);

// Migrate legacy requests that may have 'ic' approval step
function migrateRequest(request: SpendRequest): SpendRequest {
  const filteredSteps = (request.approvalSteps || []).filter(
    (step) => (step.level as string) !== 'ic'
  ) as ApprovalStep[];

  const approvalSteps = filteredSteps.length > 0 ? filteredSteps : createDefaultApprovalSteps();

  let status: SpendRequest['status'] = 'pending';
  if (request.status === 'cancelled') {
    status = 'cancelled';
  } else if (approvalSteps.some((s) => s.status === 'rejected')) {
    status = 'rejected';
  } else if (approvalSteps.every((s) => s.status === 'approved')) {
    status = 'approved';
  }

  return { ...request, approvalSteps, status };
}

// ─── Relational read: assemble SpendRequest from row + steps ───

function assembleRequest(
  row: Record<string, unknown>,
  stepRows: Array<Record<string, unknown>>,
): SpendRequest {
  const approvalSteps: ApprovalStep[] = stepRows.length > 0
    ? stepRows.map((s) => ({
        level: s.level as ApprovalStep['level'],
        status: s.status as ApprovalStep['status'],
        updatedAt: (s.updated_at as string) ?? undefined,
        comment: (s.comment as string) ?? undefined,
      }))
    : createDefaultApprovalSteps();

  const request: SpendRequest = {
    id: row.id as string,
    costCenterId: (row.cost_center_id as string) ?? '',
    costCenterName: (row.cost_center_name as string) ?? '',
    vendorName: (row.vendor_name as string) ?? '',
    amount: (row.amount as number) ?? 0,
    startMonth: ((row.start_month as string) ?? 'feb') as SpendRequest['startMonth'],
    endMonth: ((row.end_month as string) ?? 'jan') as SpendRequest['endMonth'],
    isContracted: (row.is_contracted as boolean) ?? false,
    justification: (row.justification as string) ?? '',
    status: row.status as RequestStatus,
    createdAt: (row.created_at as string) ?? '',
    approvalSteps,
    requesterId: (row.requester_id as string) ?? undefined,
    originSheet: ((row.origin_sheet as string) ?? undefined) as SpendRequest['originSheet'],
    originFiscalYearId: (row.origin_fiscal_year_id as string) ?? undefined,
    originCostCenterId: (row.origin_cost_center_id as string) ?? undefined,
    originLineItemId: (row.origin_line_item_id as string) ?? undefined,
    originKind: ((row.origin_kind as string) ?? undefined) as SpendRequest['originKind'],
    lineItemName: (row.line_item_name as string) ?? undefined,
    targetRequestId: (row.target_request_id as string) ?? undefined,
    targetRequestSnapshot: undefined,
    deletionPending: undefined,
    deletedAt: (row.deleted_at as string) ?? undefined,
    deletedByRole: undefined,
    deletedJustification: undefined,
    currentAmount: (row.current_amount as number) ?? undefined,
    revisedAmount: (row.revised_amount as number) ?? undefined,
  };

  return migrateRequest(request);
}

// ─── Relational write helpers ───

function buildRelationalColumns(request: SpendRequest) {
  return {
    cost_center_id: request.costCenterId || null,
    cost_center_name: request.costCenterName || null,
    vendor_name: request.vendorName || null,
    amount: request.amount ?? null,
    start_month: request.startMonth || null,
    end_month: request.endMonth || null,
    is_contracted: request.isContracted ?? false,
    justification: request.justification || null,
    requester_id: request.requesterId || null,
    origin_sheet: request.originSheet || null,
    origin_cost_center_id: request.originCostCenterId || null,
    origin_line_item_id: request.originLineItemId || null,
    origin_kind: request.originKind || null,
    line_item_name: request.lineItemName || null,
    target_request_id: request.targetRequestId || null,
    current_amount: request.currentAmount ?? null,
    revised_amount: request.revisedAmount ?? null,
  };
}


export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequestsState] = useState<SpendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Track previous statuses to detect transitions
  const prevStatusesRef = useRef<Record<string, RequestStatus>>({});

  // Track IDs that need persistence from setRequests bulk updates
  const pendingPersistRef = useRef<Set<string>>(new Set());

  // Fetch all requests from DB with their approval steps
  const fetchRequests = useCallback(async () => {
    try {
      const [reqRes, stepsRes] = await Promise.all([
        supabase.from('spend_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('request_approval_steps').select('*').order('step_order'),
      ]);

      if (reqRes.error) {
        logger.error('Failed to fetch requests:', reqRes.error);
        return;
      }

      // Group steps by request_id
      const stepsByRequestId: Record<string, Array<Record<string, unknown>>> = {};
      for (const step of (stepsRes.data ?? [])) {
        const rid = step.request_id as string;
        if (!stepsByRequestId[rid]) stepsByRequestId[rid] = [];
        stepsByRequestId[rid].push(step as Record<string, unknown>);
      }

      const mapped = (reqRes.data || []).map((row) =>
        assembleRequest(row as Record<string, unknown>, stepsByRequestId[row.id] ?? [])
      );
      setRequestsState(mapped);
    } catch (err) {
      logger.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Set up realtime subscriptions for spend_requests and request_approval_steps
  useEffect(() => {
    const channel = supabase
      .channel('spend_requests_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'spend_requests' },
        () => { fetchRequests(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'spend_requests' },
        () => { fetchRequests(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'spend_requests' },
        (payload) => {
          const oldRow = payload.old as Record<string, unknown>;
          if (oldRow && oldRow.id) {
            setRequestsState((prev) => prev.filter((r) => r.id !== oldRow.id));
          } else {
            fetchRequests();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'request_approval_steps' },
        () => { fetchRequests(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  // Check for status transitions that need resolution
  useEffect(() => {
    const resolveTransitions = async () => {
      for (const request of requests) {
        const prevStatus = prevStatusesRef.current[request.id];
        if (prevStatus && prevStatus !== request.status) {
          await resolveForecastRowActionRequest(request, prevStatus, updateRequest);
        }
      }
    };
    resolveTransitions();

    const newStatuses: Record<string, RequestStatus> = {};
    for (const request of requests) {
      newStatuses[request.id] = request.status;
    }
    prevStatusesRef.current = newStatuses;
  }, [requests]);

  // Add a new request - writes to relational columns + approval steps
  const addRequest = useCallback(async (request: SpendRequest) => {
    // Optimistically add to state
    setRequestsState((prev) => [request, ...prev]);

    try {
      // Insert request row with relational columns
      const { error: reqErr } = await supabase
        .from('spend_requests')
        .insert({
          id: request.id,
          status: request.status,
          origin_fiscal_year_id: request.originFiscalYearId ?? null,
          deleted_at: request.deletedAt ?? null,
          ...buildRelationalColumns(request),
        });

      if (reqErr) {
        logger.error('Failed to add request:', reqErr);
        setRequestsState((prev) => prev.filter((r) => r.id !== request.id));
        toast({ variant: 'destructive', title: 'Failed to create request', description: 'Your changes could not be saved. Please try again.' });
        return;
      }

      // Insert approval steps
      if (request.approvalSteps && request.approvalSteps.length > 0) {
        const stepRows = request.approvalSteps.map((step, i) => ({
          request_id: request.id,
          level: step.level,
          status: step.status,
          updated_at: step.updatedAt ?? null,
          comment: step.comment ?? null,
          step_order: i,
        }));

        const { error: stepsErr } = await supabase
          .from('request_approval_steps')
          .insert(stepRows);

        if (stepsErr) {
          logger.error('Failed to insert approval steps:', stepsErr);
        }
      }
    } catch (err) {
      logger.error('Error adding request:', err);
      setRequestsState((prev) => prev.filter((r) => r.id !== request.id));
      toast({ variant: 'destructive', title: 'Failed to create request', description: 'Your changes could not be saved. Please try again.' });
    }
  }, []);

  // Get a request by ID
  const getRequest = useCallback((id: string) => {
    return requests.find((r) => r.id === id);
  }, [requests]);

  // Update a request - writes granularly to relational columns and/or approval steps
  const updateRequest = useCallback(async (id: string, updater: (r: SpendRequest) => SpendRequest) => {
    let oldRequest: SpendRequest | null = null;
    let updatedRequest: SpendRequest | null = null;

    // Optimistically update state
    setRequestsState((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          oldRequest = r;
          updatedRequest = updater(r);
          return updatedRequest;
        }
        return r;
      })
    );

    if (!updatedRequest || !oldRequest) return;

    try {
      // Always update status + relational columns + JSONB backup
      const { error: updateErr } = await supabase
        .from('spend_requests')
        .update({
          status: (updatedRequest as SpendRequest).status,
          origin_fiscal_year_id: (updatedRequest as SpendRequest).originFiscalYearId ?? null,
          deleted_at: (updatedRequest as SpendRequest).deletedAt ?? null,
          data: buildJsonbData(updatedRequest as SpendRequest),
          ...buildRelationalColumns(updatedRequest as SpendRequest),
        })
        .eq('id', id);

      if (updateErr) {
        logger.error('Failed to update request:', updateErr);
        toast({ variant: 'destructive', title: 'Failed to save request changes', description: 'Data has been refreshed from the server.' });
        fetchRequests();
        return;
      }

      // Diff approval steps: update only changed steps
      const oldSteps = (oldRequest as SpendRequest).approvalSteps ?? [];
      const newSteps = (updatedRequest as SpendRequest).approvalSteps ?? [];

      // If step count changed, replace all steps
      if (oldSteps.length !== newSteps.length) {
        // Delete old steps and insert new ones
        await supabase.from('request_approval_steps').delete().eq('request_id', id);
        if (newSteps.length > 0) {
          const stepRows = newSteps.map((step, i) => ({
            request_id: id,
            level: step.level,
            status: step.status,
            updated_at: step.updatedAt ?? null,
            comment: step.comment ?? null,
            step_order: i,
          }));
          const { error: stepsErr } = await supabase
            .from('request_approval_steps')
            .insert(stepRows);
          if (stepsErr) logger.error('Failed to replace approval steps:', stepsErr);
        }
      } else {
        // Update only changed steps
        for (let i = 0; i < newSteps.length; i++) {
          const oldStep = oldSteps[i];
          const newStep = newSteps[i];
          if (
            oldStep.status !== newStep.status ||
            oldStep.comment !== newStep.comment ||
            oldStep.updatedAt !== newStep.updatedAt
          ) {
            const { error: stepErr } = await supabase
              .from('request_approval_steps')
              .update({
                status: newStep.status,
                updated_at: newStep.updatedAt ?? null,
                comment: newStep.comment ?? null,
              })
              .eq('request_id', id)
              .eq('step_order', i);

            if (stepErr) {
              logger.error(`Failed to update approval step ${i}:`, stepErr);
            }
          }
        }
      }
    } catch (err) {
      logger.error('Error updating request:', err);
      toast({ variant: 'destructive', title: 'Failed to save request changes', description: 'Data has been refreshed from the server.' });
      fetchRequests();
    }
  }, [fetchRequests]);

  // Persist pending bulk changes via useEffect (outside setState)
  useEffect(() => {
    if (pendingPersistRef.current.size === 0) return;

    const idsToSync = new Set(pendingPersistRef.current);
    pendingPersistRef.current.clear();

    const toSync = requests.filter((r) => idsToSync.has(r.id));
    if (toSync.length === 0) return;

    Promise.all(
      toSync.map(async (request) => {
        const { error } = await supabase
          .from('spend_requests')
          .upsert({
            id: request.id,
            status: request.status,
            origin_fiscal_year_id: request.originFiscalYearId ?? null,
            deleted_at: request.deletedAt ?? null,
            data: buildJsonbData(request),
            ...buildRelationalColumns(request),
          });

        if (error) throw error;

        // Also upsert approval steps
        if (request.approvalSteps && request.approvalSteps.length > 0) {
          const stepRows = request.approvalSteps.map((step, i) => ({
            request_id: request.id,
            level: step.level,
            status: step.status,
            updated_at: step.updatedAt ?? null,
            comment: step.comment ?? null,
            step_order: i,
          }));
          await supabase
            .from('request_approval_steps')
            .upsert(stepRows, { onConflict: 'request_id,step_order' });
        }
      })
    ).catch((err) => {
      logger.error('Failed to persist bulk request updates:', err);
      toast({ variant: 'destructive', title: 'Failed to save request changes', description: 'Data has been refreshed from the server.' });
      fetchRequests();
    });
  }, [requests, fetchRequests]);

  // Bulk set requests (for compatibility with existing code)
  const setRequests = useCallback((updater: (prev: SpendRequest[]) => SpendRequest[]) => {
    setRequestsState((prev) => {
      const next = updater(prev);

      for (const r of next) {
        const old = prev.find((p) => p.id === r.id);
        if (!old || old !== r) {
          pendingPersistRef.current.add(r.id);
        }
      }

      return next;
    });
  }, []);

  return (
    <RequestsContext.Provider value={{ requests, addRequest, getRequest, updateRequest, setRequests, loading, refetch: fetchRequests }}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  const context = useContext(RequestsContext);
  if (!context) {
    throw new Error('useRequests must be used within a RequestsProvider');
  }
  return context;
}
