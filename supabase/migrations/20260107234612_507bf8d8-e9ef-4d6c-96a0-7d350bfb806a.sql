-- A) Add RPC function to check if self-signup is allowed (only when no profiles exist)
CREATE OR REPLACE FUNCTION public.allow_self_signup()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1)
$$;

-- B) Harden is_admin function with explicit search_path (already has SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND role = 'admin'
  )
$$;

-- C) Add trigger to prevent non-admins from escalating their own role
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is updating their own profile and is NOT an admin
  IF auth.uid() = NEW.id AND NOT public.is_admin(auth.uid()) THEN
    -- Prevent role changes
    NEW.role := OLD.role;
    -- Prevent setting must_change_password back to true (can only go false -> stay false)
    IF OLD.must_change_password = false AND NEW.must_change_password = true THEN
      NEW.must_change_password := false;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();