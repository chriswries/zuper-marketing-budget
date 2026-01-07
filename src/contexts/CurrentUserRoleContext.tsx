import { createContext, useContext, ReactNode } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';

interface CurrentUserRoleContextValue {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
}

const CurrentUserRoleContext = createContext<CurrentUserRoleContextValue | undefined>(undefined);

export type { UserRole };

export function CurrentUserRoleProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  
  // Role is now derived from the database via AuthContext
  // The setCurrentRole is a no-op since role comes from the DB
  const currentRole: UserRole = role ?? 'manager';
  
  const setCurrentRole = (_role: UserRole) => {
    // No-op: role is managed in the database, not localStorage
    console.warn('setCurrentRole is deprecated. Role is now managed in the database.');
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
