import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';

const ROLE_OVERRIDE_KEY = 'testing_role_override_v1';

interface CurrentUserRoleContextValue {
  /** The effective role (override if active, otherwise actual DB role) */
  currentRole: UserRole;
  /** Set a role override (admin-only, stored in localStorage) */
  setCurrentRole: (role: UserRole) => void;
  /** The actual DB role from auth */
  actualRole: UserRole;
  /** The current role override, or null if none */
  roleOverride: UserRole | null;
  /** Clear the role override and return to actual role */
  clearRoleOverride: () => void;
  /** Whether role override is currently active */
  isOverrideActive: boolean;
}

const CurrentUserRoleContext = createContext<CurrentUserRoleContextValue | undefined>(undefined);

export type { UserRole };

export function CurrentUserRoleProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [roleOverride, setRoleOverride] = useState<UserRole | null>(null);

  // Load override from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ROLE_OVERRIDE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserRole;
        if (['admin', 'manager', 'cmo', 'finance'].includes(parsed)) {
          setRoleOverride(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const actualRole: UserRole = role ?? 'manager';
  
  // Only admins can use the override; non-admins always use their actual role
  const isOverrideActive = actualRole === 'admin' && roleOverride !== null;
  const effectiveRole: UserRole = isOverrideActive ? roleOverride! : actualRole;

  const setCurrentRole = (nextRole: UserRole) => {
    // Only allow admin to set role override
    if (actualRole !== 'admin') {
      console.warn('setCurrentRole: Only admins can use role override.');
      return;
    }
    
    setRoleOverride(nextRole);
    localStorage.setItem(ROLE_OVERRIDE_KEY, JSON.stringify(nextRole));
  };

  const clearRoleOverride = () => {
    setRoleOverride(null);
    localStorage.removeItem(ROLE_OVERRIDE_KEY);
  };

  return (
    <CurrentUserRoleContext.Provider 
      value={{ 
        currentRole: effectiveRole, 
        setCurrentRole, 
        actualRole, 
        roleOverride, 
        clearRoleOverride,
        isOverrideActive,
      }}
    >
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
