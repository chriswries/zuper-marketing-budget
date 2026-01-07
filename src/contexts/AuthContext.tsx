import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'manager' | 'cmo' | 'finance';

export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Retry helper for profile fetch (handles trigger race on signup)
async function fetchProfileWithRetry(userId: string, maxRetries = 5, delayMs = 200): Promise<Profile | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      return data as Profile;
    }

    if (error) {
      console.error('Error fetching profile:', error);
    }

    // If not found and we have retries left, wait and try again
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Combined loading state
  const loading = sessionLoading || profileLoading;

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const profileData = await fetchProfileWithRetry(userId);
      setProfile(profileData);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Synchronous updates only inside the callback (prevents auth deadlocks)
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession?.user) {
        setProfile(null);
        return;
      }

      // Defer profile loading outside the callback; still “immediate” for UX
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queueMicrotask(() => {
          void loadProfile(newSession.user.id);
        });
      }
    });

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session: existingSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
        }
        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        
        if (existingSession?.user) {
          await loadProfile(existingSession.user.id);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setSessionLoading(false);
      }
    };

    initializeAuth();

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        profileLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
