import { useNavigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX, Loader2, ArrowLeft } from 'lucide-react';

/**
 * RoleGuard - Client-Side UI Access Control
 * 
 * ⚠️ SECURITY NOTICE: This component is a UI convenience ONLY and does NOT provide security.
 * 
 * RoleGuard controls which UI elements are displayed to users based on their role.
 * It does NOT prevent unauthorized access to data or actions - that security is
 * enforced server-side by:
 * 
 * 1. Row Level Security (RLS) policies on all database tables
 * 2. The has_any_role() and is_admin() database functions used in RLS policies
 * 3. Admin role validation in Edge Functions for privileged operations
 * 4. RESTRICTIVE policies that prevent role escalation
 * 
 * A malicious user CAN bypass this component (e.g., via browser DevTools or direct
 * API calls), but will still be blocked by the server-side authorization listed above.
 * 
 * This component exists to:
 * - Provide a clean UX by hiding inaccessible features from legitimate users
 * - Reduce confusion by not showing admin options to non-admin users
 * - Give immediate feedback when a user lacks required permissions
 * 
 * All REAL security is enforced at the database and edge function level.
 */
interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const navigate = useNavigate();
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
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You need Admin permissions to view this page.
            </p>
            <Button onClick={() => navigate('/reports')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
