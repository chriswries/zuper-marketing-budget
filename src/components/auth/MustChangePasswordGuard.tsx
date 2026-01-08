import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface MustChangePasswordGuardProps {
  children: React.ReactNode;
}

export function MustChangePasswordGuard({ children }: MustChangePasswordGuardProps) {
  const { profile, loading, profileLoading, session } = useAuth();
  const location = useLocation();

  // Don't check while still loading
  if (loading || (session && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user must change password and not already on that page, redirect
  if (profile?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
