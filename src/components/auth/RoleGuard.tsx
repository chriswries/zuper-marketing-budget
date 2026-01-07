import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldX, Loader2 } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { role, loading, profileLoading, session } = useAuth();

  // Show loading while auth is initializing OR while we have a session but profile isn't loaded yet
  if (loading || (session && profileLoading) || (session && role === null)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Only show Access Denied when loading is complete AND role is known AND not allowed
  if (!role || !allowedRoles.includes(role)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex min-h-[400px] items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-md">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don't have permission to access this page. This area is restricted to{' '}
            {allowedRoles.join(', ')} users only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
