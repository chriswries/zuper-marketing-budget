import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

const roleBadgeVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  admin: 'destructive',
  manager: 'secondary',
  cmo: 'default',
  finance: 'outline',
};

export function UserMenu() {
  const { user, profile, role, signOut } = useAuth();
  const { currentRole, isOverrideActive, actualRole } = useCurrentUserRole();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return null;
  }

  const displayName = profile?.first_name && profile?.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile?.email || user.email || 'User';

  const initials = profile?.first_name && profile?.last_name
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : (profile?.email || user.email || 'U')[0].toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Visual indicator when role override is active */}
          {isOverrideActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {profile?.email || user.email}
            </p>
            <div className="flex flex-col gap-1 mt-2">
              {role && (
                <Badge variant={roleBadgeVariants[role]} className="w-fit">
                  {roleLabels[role]}
                </Badge>
              )}
              {isOverrideActive && (
                <Badge variant="outline" className="w-fit border-amber-500 text-amber-600 text-xs">
                  Simulating: {roleLabels[currentRole]}
                </Badge>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
