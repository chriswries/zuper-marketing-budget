import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SpendRequest } from '@/types/requests';

interface RequestsContextType {
  requests: SpendRequest[];
  addRequest: (request: SpendRequest) => void;
  getRequest: (id: string) => SpendRequest | undefined;
  updateRequest: (id: string, updater: (r: SpendRequest) => SpendRequest) => void;
}

const RequestsContext = createContext<RequestsContextType | undefined>(undefined);

const STORAGE_KEY = 'spend-requests';

export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<SpendRequest[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
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
    <RequestsContext.Provider value={{ requests, addRequest, getRequest, updateRequest }}>
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
