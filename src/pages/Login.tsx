import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, AlertCircle, DollarSign, UserPlus } from 'lucide-react';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';

const authSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [signupAllowed, setSignupAllowed] = useState<boolean | null>(null);
  const [checkingSignup, setCheckingSignup] = useState(true);
  
  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const { signIn, signUp, session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Check if signup is allowed (only for bootstrapping)
  useEffect(() => {
    let mounted = true;
    async function checkSignupAllowed() {
      try {
        const { data, error } = await supabase.rpc('allow_self_signup');
        if (!mounted) return;
        if (error) {
          console.error('Error checking signup status:', error);
          // Default to false on error - admin must create accounts
          setSignupAllowed(false);
        } else {
          setSignupAllowed(data === true);
        }
      } catch (err) {
        console.error('Error checking signup status:', err);
        if (mounted) setSignupAllowed(false);
      } finally {
        if (mounted) setCheckingSignup(false);
      }
    }
    // Add a timeout fallback in case RPC hangs
    const timeout = setTimeout(() => {
      if (mounted && checkingSignup) {
        console.warn('Signup check timed out, defaulting to disabled');
        setSignupAllowed(false);
        setCheckingSignup(false);
      }
    }, 3000);
    
    checkSignupAllowed();
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && session) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/budget';
      navigate(from, { replace: true });
    }
  }, [session, loading, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate input
    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      if (activeTab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError('Invalid email or password. Please try again.');
          } else {
            setError(error.message);
          }
        }
      } else {
        // Guard signup - only allow if signupAllowed is true
        if (!signupAllowed) {
          toast({
            title: 'Signup Disabled',
            description: 'Account creation is managed by an admin.',
            variant: 'destructive',
          });
          setError('Account creation is disabled. Please contact your administrator.');
          setIsLoading(false);
          return;
        }

        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            setError('An account with this email already exists. Please sign in instead.');
          } else {
            setError(error.message);
          }
        } else {
          setSuccess('Account created successfully! You can now sign in.');
          setActiveTab('signin');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast({
        title: 'Error',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });
      return;
    }

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: 'Check Your Email',
        description: 'If an account exists with that email, you will receive a password reset link.',
      });
      setForgotOpen(false);
      setForgotEmail('');
    } catch (err: any) {
      console.error('Password reset error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to send reset email.',
        variant: 'destructive',
      });
    } finally {
      setForgotLoading(false);
    }
  };

  if (loading || checkingSignup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <DollarSign className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Marketing Budget</CardTitle>
          <CardDescription>
            Sign in to manage your marketing budget, forecasts, and actuals
          </CardDescription>
        </CardHeader>

        {signupAllowed ? (
          // Show tabs when signup is allowed (bootstrapping)
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
            <TabsList className="mx-6 grid w-[calc(100%-48px)] grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                <TabsContent value="signin" className="m-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signin">Email</Label>
                    <Input
                      id="email-signin"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signin">Password</Label>
                    <Input
                      id="password-signin"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 text-sm"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotOpen(true);
                    }}
                  >
                    Forgot password?
                  </Button>
                </TabsContent>

                <TabsContent value="signup" className="m-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <Input
                      id="email-signup"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signup">Password</Label>
                    <Input
                      id="password-signup"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By signing up, you agree to use this application for authorized purposes only.
                    The first user to sign up will be granted admin privileges.
                  </p>
                </TabsContent>
              </CardContent>

              <CardFooter>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {activeTab === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </CardFooter>
            </form>
          </Tabs>
        ) : (
          // Sign-in only when signup is disabled
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="button"
                variant="link"
                className="px-0 text-sm"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
              >
                Forgot password?
              </Button>

              <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
                <UserPlus className="h-4 w-4 shrink-0" />
                <span>Account creation is managed by an admin. Contact your administrator for access.</span>
              </div>
            </CardContent>

            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleForgotPassword} disabled={forgotLoading}>
              {forgotLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Reset Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
