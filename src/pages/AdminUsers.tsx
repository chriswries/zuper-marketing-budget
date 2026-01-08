import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Search, UserPlus, MoreHorizontal, KeyRound, UserX, UserCheck, Copy, Check, RefreshCw } from 'lucide-react';

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  created_at: string;
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

const roleBadgeVariants: Record<UserRole, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  admin: 'destructive',
  manager: 'default',
  cmo: 'secondary',
  finance: 'outline',
};

function generatePassword(length = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  
  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('manager');
  const [newPassword, setNewPassword] = useState(() => generatePassword());
  
  // Credentials display dialog
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialsData, setCredentialsData] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Reset password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetUser, setResetUser] = useState<ProfileRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error('Error loading profiles:', err);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      // Filter by active status
      if (!showInactive && !p.is_active) return false;
      
      // Filter by role
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      
      // Filter by search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
        const email = (p.email || '').toLowerCase();
        if (!name.includes(query) && !email.includes(query)) return false;
      }
      
      return true;
    });
  }, [profiles, showInactive, roleFilter, searchQuery]);

  const handleCreateUser = async () => {
    if (!newEmail) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }
    
    setCreateLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin_create_user', {
        body: {
          email: newEmail,
          tempPassword: newPassword,
          firstName: newFirstName,
          lastName: newLastName,
          role: newRole,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Success', description: `User ${newEmail} created` });
      setCreateOpen(false);
      setCredentialsData({ email: newEmail, password: newPassword });
      setCredentialsOpen(true);
      
      // Reset form
      setNewEmail('');
      setNewFirstName('');
      setNewLastName('');
      setNewRole('manager');
      setNewPassword(generatePassword());
      
      loadProfiles();
    } catch (err: any) {
      console.error('Create user error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to create user',
        variant: 'destructive',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin_reset_user_password', {
        body: {
          userId: resetUser.id,
          tempPassword: resetPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Success', description: `Password reset for ${resetUser.email}` });
      setResetOpen(false);
      setCredentialsData({ email: resetUser.email || '', password: resetPassword });
      setCredentialsOpen(true);
      
      // Reset
      setResetUser(null);
      setResetPassword(generatePassword());
      
      loadProfiles();
    } catch (err: any) {
      console.error('Reset password error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to reset password',
        variant: 'destructive',
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleActive = async (profile: ProfileRow) => {
    // Prevent deactivating self
    if (profile.id === user?.id) {
      toast({
        title: 'Error',
        description: 'You cannot deactivate your own account',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !profile.is_active })
        .eq('id', profile.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User ${profile.is_active ? 'deactivated' : 'activated'}`,
      });
      loadProfiles();
    } catch (err: any) {
      console.error('Toggle active error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to update user',
        variant: 'destructive',
      });
    }
  };

  const handleRoleChange = async (profile: ProfileRow, newRole: UserRole) => {
    // Prevent changing own role
    if (profile.id === user?.id) {
      toast({
        title: 'Error',
        description: 'You cannot change your own role',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profile.id);

      if (error) throw error;

      toast({ title: 'Success', description: `Role updated to ${roleLabels[newRole]}` });
      loadProfiles();
    } catch (err: any) {
      console.error('Role change error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to update role',
        variant: 'destructive',
      });
    }
  };

  const copyCredentials = () => {
    if (!credentialsData) return;
    const text = `Email: ${credentialsData.email}\nTemporary Password: ${credentialsData.password}\nLogin URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Create and manage user accounts, roles, and access."
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-1 gap-4 items-center w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cmo">CMO</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-inactive"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                <Label htmlFor="show-inactive" className="text-sm whitespace-nowrap">
                  Show inactive
                </Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={loadProfiles} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No users found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => (
                  <TableRow key={profile.id} className={!profile.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {profile.first_name || profile.last_name
                        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                        : '—'}
                    </TableCell>
                    <TableCell>{profile.email || '—'}</TableCell>
                    <TableCell>
                      <Select
                        value={profile.role}
                        onValueChange={(v) => handleRoleChange(profile, v as UserRole)}
                        disabled={profile.id === user?.id}
                      >
                        <SelectTrigger className="w-[110px] h-8">
                          <Badge variant={roleBadgeVariants[profile.role]} className="pointer-events-none">
                            {roleLabels[profile.role]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="cmo">CMO</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.is_active ? 'outline' : 'secondary'}>
                        {profile.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {profile.must_change_password && (
                        <Badge variant="secondary" className="text-amber-600">
                          Must Change
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(profile.invited_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(profile.last_login_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setResetUser(profile);
                              setResetPassword(generatePassword());
                              setResetOpen(true);
                            }}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(profile)}
                            disabled={profile.id === user?.id}
                          >
                            {profile.is_active ? (
                              <>
                                <UserX className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account. They will be required to change their password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-first-name">First Name</Label>
                <Input
                  id="new-first-name"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-last-name">Last Name</Label>
                <Input
                  id="new-last-name"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cmo">CMO</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Temporary Password</Label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={createLoading}>
              {createLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Reset password for {resetUser?.email}. They will be required to change it on next login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">New Temporary Password</Label>
              <div className="flex gap-2">
                <Input
                  id="reset-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetPassword(generatePassword())}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={resetLoading}>
              {resetLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Display Dialog */}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Credentials</DialogTitle>
            <DialogDescription>
              Share these credentials with the user. They will be required to change their password on first login.
            </DialogDescription>
          </DialogHeader>
          {credentialsData && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm space-y-2">
                <div><span className="text-muted-foreground">Email:</span> {credentialsData.email}</div>
                <div><span className="text-muted-foreground">Password:</span> {credentialsData.password}</div>
                <div><span className="text-muted-foreground">Login URL:</span> {window.location.origin}/login</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialsOpen(false)}>
              Close
            </Button>
            <Button onClick={copyCredentials}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
