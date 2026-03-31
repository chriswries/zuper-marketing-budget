import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SpendRequest, ApprovalStep, createDefaultApprovalSteps, RequestStatus } from '@/types/requests';
import { resolveForecastRowActionRequest } from '@/lib/forecastRowActionResolver';
import type { Json } from '@/integrations/supabase/types';
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
  // Filter out 'ic' steps from approvalSteps (cast to handle legacy data)
  const filteredSteps = (request.approvalSteps || []).filter(
    (step) => (step.level as string) !== 'ic'
  ) as ApprovalStep[];

  // If no steps remain, use default
  const approvalSteps = filteredSteps.length > 0 ? filteredSteps : createDefaultApprovalSteps();

  // Recompute status based on steps
  let status: SpendRequest['status'] = 'pending';
  if (request.status === 'cancelled') {
    status = 'cancelled';
  } else if (approvalSteps.some((s) => s.status === 'rejected')) {
    status = 'rejected';
  } else if (approvalSteps.every((s) => s.status === 'approved')) {
    status = 'approved';
  }

  return {
    ...request,
    approvalSteps,
    status,
  };
}

// Map DB row to SpendRequest
function rowToRequest(row: { id: string; status: string; origin_fiscal_year_id: string | null; deleted_at: string | null; data: unknown }): SpendRequest {
  const data = row.data as Record<string, unknown>;
  const request: SpendRequest = {
    id: row.id,
    costCenterId: data.costCenterId as string,
    costCenterName: data.costCenterName as string,
    vendorName: data.vendorName as string,
    amount: data.amount as number,
    startMonth: data.startMonth as SpendRequest['startMonth'],
    endMonth: data.endMonth as SpendRequest['endMonth'],
    isContracted: data.isContracted as boolean,
    justification: data.justification as string,
    status: row.status as RequestStatus,
    createdAt: data.createdAt as string,
    approvalSteps: data.approvalSteps as ApprovalStep[],
    requesterId: data.requesterId as string | undefined,
    originSheet: data.originSheet as SpendRequest['originSheet'],
    originFiscalYearId: row.origin_fiscal_year_id,
    originCostCenterId: data.originCostCenterId as string | undefined,
    originLineItemId: data.originLineItemId as string | undefined,
    originKind: data.originKind as SpendRequest['originKind'],
    lineItemName: data.lineItemName as string | undefined,
    targetRequestId: data.targetRequestId as string | undefined,
    targetRequestSnapshot: data.targetRequestSnapshot as SpendRequest['targetRequestSnapshot'],
    deletionPending: data.deletionPending as boolean | undefined,
    deletedAt: row.deleted_at ?? undefined,
    deletedByRole: data.deletedByRole as string | undefined,
    deletedJustification: data.deletedJustification as string | undefined,
  };
  return migrateRequest(request);
}

// Map SpendRequest to DB row
function requestToRow(request: SpendRequest): { id: string; status: string; origin_fiscal_year_id: string | null; deleted_at: string | null; data: Json } {
  // Store everything except id/status/origin_fiscal_year_id/deleted_at in data
  const { id, status, originFiscalYearId, deletedAt, ...rest } = request;
  return {
    id,
    status,
    origin_fiscal_year_id: originFiscalYearId ?? null,
    deleted_at: deletedAt ?? null,
    data: rest as unknown as Json,
  };
}

export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequestsState] = useState<SpendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Track previous statuses to detect transitions
  const prevStatusesRef = useRef<Record<string, RequestStatus>>({});

  // Track IDs that need persistence from setRequests bulk updates
  const pendingPersistRef = useRef<Set<string>>(new Set());

  // Fetch all requests from DB
  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('spend_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch requests:', error);
        return;
      }

      const mapped = (data || []).map(rowToRequest);
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

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('spend_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spend_requests',
        },
        () => {
          // On any change, refetch all requests (simple approach)
          fetchRequests();
        }
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
          // Status changed - try to resolve row action requests
          await resolveForecastRowActionRequest(request, prevStatus, updateRequest);
        }
      }
    };
    resolveTransitions();

    // Update previous statuses
    const newStatuses: Record<string, RequestStatus> = {};
    for (const request of requests) {
      newStatuses[request.id] = request.status;
    }
    prevStatusesRef.current = newStatuses;
  }, [requests]);

  // Add a new request
  const addRequest = useCallback(async (request: SpendRequest) => {
    // Optimistically add to state
    setRequestsState((prev) => [request, ...prev]);

    const row = requestToRow(request);
    const { error } = await supabase
      .from('spend_requests')
      .insert(row);

    if (error) {
      logger.error('Failed to add request:', error);
      setRequestsState((prev) => prev.filter((r) => r.id !== request.id));
      toast({ variant: 'destructive', title: 'Failed to create request', description: 'Your changes could not be saved. Please try again.' });
    }
  }, []);

  // Get a request by ID
  const getRequest = useCallback((id: string) => {
    return requests.find((r) => r.id === id);
  }, [requests]);

  // Update a request
  const updateRequest = useCallback(async (id: string, updater: (r: SpendRequest) => SpendRequest) => {
    let updatedRequest: SpendRequest | null = null;

    // Optimistically update state
    setRequestsState((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          updatedRequest = updater(r);
          return updatedRequest;
        }
        return r;
      })
    );

    if (updatedRequest) {
      const row = requestToRow(updatedRequest);
      const { error } = await supabase
        .from('spend_requests')
        .update({
          status: row.status,
          origin_fiscal_year_id: row.origin_fiscal_year_id,
          deleted_at: row.deleted_at,
          data: row.data,
        })
        .eq('id', id);

      if (error) {
        logger.error('Failed to update request:', error);
        toast({ variant: 'destructive', title: 'Failed to save request changes', description: 'Data has been refreshed from the server.' });
        fetchRequests();
      }
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
        const row = requestToRow(request);
        const { error } = await supabase
          .from('spend_requests')
          .upsert({
            id: row.id,
            status: row.status,
            origin_fiscal_year_id: row.origin_fiscal_year_id,
            deleted_at: row.deleted_at,
            data: row.data,
          });

        if (error) {
          throw error;
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

      // Track changed request IDs by reference equality
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
