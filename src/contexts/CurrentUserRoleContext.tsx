import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'admin' | 'manager' | 'cmo' | 'finance';

interface CurrentUserRoleContextValue {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
}

const STORAGE_KEY = 'current_user_role_v1';

const CurrentUserRoleContext = createContext<CurrentUserRoleContextValue | undefined>(undefined);

function loadFromStorage(): UserRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['admin', 'manager', 'cmo', 'finance'].includes(stored)) {
      return stored as UserRole;
    }
  } catch {
    // Ignore
  }
  return 'admin';
}

function saveToStorage(role: UserRole): void {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // Ignore
  }
}

export function CurrentUserRoleProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRoleState] = useState<UserRole>(loadFromStorage);

  useEffect(() => {
    saveToStorage(currentRole);
  }, [currentRole]);

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
  };

  return (
    <CurrentUserRoleContext.Provider value={{ currentRole, setCurrentRole }}>
      {children}
    </CurrentUserRoleContext.Provider>
  );
}

export function useCurrentUserRole() {
  const context = useContext(CurrentUserRoleContext);
  if (!context) {
    throw new Error('useCurrentUserRole must be used within a CurrentUserRoleProvider');
  }
  return context;
}
