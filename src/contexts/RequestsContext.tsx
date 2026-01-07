import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { SpendRequest, ApprovalStep, createDefaultApprovalSteps, RequestStatus } from '@/types/requests';
import { resolveForecastRowActionRequest } from '@/lib/forecastRowActionResolver';

interface RequestsContextType {
  requests: SpendRequest[];
  addRequest: (request: SpendRequest) => void;
  getRequest: (id: string) => SpendRequest | undefined;
  updateRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => void;
  setRequests: (updater: (prev: SpendRequest[]) => SpendRequest[]) => void;
}

const RequestsContext = createContext<RequestsContextType | undefined>(undefined);

const STORAGE_KEY = 'spend-requests';

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
  if (approvalSteps.some((s) => s.status === 'rejected')) {
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

export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<SpendRequest[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as SpendRequest[];
      // Migrate all requests on load
      return parsed.map(migrateRequest);
    } catch {
      return [];
    }
  });

  // Track previous statuses to detect transitions
  const prevStatusesRef = useRef<Record<string, RequestStatus>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    
    // Check for status transitions that need resolution
    for (const request of requests) {
      const prevStatus = prevStatusesRef.current[request.id];
      if (prevStatus && prevStatus !== request.status) {
        // Status changed - try to resolve row action requests
        resolveForecastRowActionRequest(request, prevStatus, updateRequest);
      }
    }
    
    // Update previous statuses
    const newStatuses: Record<string, RequestStatus> = {};
    for (const request of requests) {
      newStatuses[request.id] = request.status;
    }
    prevStatusesRef.current = newStatuses;
  }, [requests]);

  const addRequest = (request: SpendRequest) => {
    setRequests((prev) => [...prev, request]);
  };

  const getRequest = (id: string) => {
    return requests.find((r) => r.id === id);
  };

  const updateRequest = (id: string, updater: (r: SpendRequest) => SpendRequest) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? updater(r) : r))
    );
  };

  return (
    <RequestsContext.Provider value={{ requests, addRequest, getRequest, updateRequest, setRequests }}>
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
