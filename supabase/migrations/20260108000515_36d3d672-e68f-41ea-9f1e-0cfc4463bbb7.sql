-- A) Add new columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS invited_at timestamptz,
ADD COLUMN IF NOT EXISTS invited_by uuid,
ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- B) Drop existing RLS policies and recreate with proper access
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Users can update their own profile (limited fields via trigger)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- C) Update the prevent_role_escalation trigger to allow admins
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- If user is updating their own profile and is NOT an admin
  IF auth.uid() = NEW.id AND NOT public.is_admin(auth.uid()) THEN
    -- Prevent role changes
    NEW.role := OLD.role;
    -- Prevent is_active changes
    NEW.is_active := OLD.is_active;
    -- Prevent setting must_change_password back to true (can only go false -> stay false)
    IF OLD.must_change_password = false AND NEW.must_change_password = true THEN
      NEW.must_change_password := false;
    END IF;
    -- Prevent changes to invited_at, invited_by
    NEW.invited_at := OLD.invited_at;
    NEW.invited_by := OLD.invited_by;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_role_escalation_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();