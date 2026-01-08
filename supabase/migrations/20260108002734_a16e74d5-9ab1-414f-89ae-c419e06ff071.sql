
-- =========================================================
-- CLOUD-DATA-1: Shared Data Schema + RLS
-- =========================================================

-- 1) Helper DB functions (security definer, avoid RLS recursion)
-- =========================================================

-- Get current user's role from profiles
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Check if current user has any of the required roles
CREATE OR REPLACE FUNCTION public.has_any_role(required_roles public.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(required_roles)
  )
$$;

-- Generic set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) admin_settings table (singleton pattern)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_zone text NOT NULL DEFAULT 'America/Los_Angeles',
  increase_approval_absolute_usd numeric NOT NULL DEFAULT 0,
  increase_approval_percent numeric NOT NULL DEFAULT 0,
  admin_override_enabled boolean NOT NULL DEFAULT false,
  show_archived_fiscal_years boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER set_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read admin_settings"
  ON public.admin_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert admin_settings"
  ON public.admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can update admin_settings"
  ON public.admin_settings FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can delete admin_settings"
  ON public.admin_settings FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- Seed default row if empty
INSERT INTO public.admin_settings (time_zone)
SELECT 'America/Los_Angeles'
WHERE NOT EXISTS (SELECT 1 FROM public.admin_settings);

-- 3) fiscal_years table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL,
  archived_at timestamptz,
  archived_by uuid,
  archived_justification text,
  previous_status_before_archive text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER set_fiscal_years_updated_at
  BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read fiscal_years"
  ON public.fiscal_years FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/manager/cmo can insert fiscal_years"
  ON public.fiscal_years FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]));

CREATE POLICY "Admin/manager/cmo can update fiscal_years"
  ON public.fiscal_years FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]));

CREATE POLICY "Admins can delete fiscal_years"
  ON public.fiscal_years FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- 4) fy_forecasts table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.fy_forecasts (
  fiscal_year_id uuid PRIMARY KEY REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER set_fy_forecasts_updated_at
  BEFORE UPDATE ON public.fy_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.fy_forecasts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read fy_forecasts"
  ON public.fy_forecasts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/manager/cmo can insert fy_forecasts"
  ON public.fy_forecasts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]));

CREATE POLICY "Admin/manager/cmo can update fy_forecasts"
  ON public.fy_forecasts FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cmo']::public.user_role[]));

CREATE POLICY "Admins can delete fy_forecasts"
  ON public.fy_forecasts FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- 5) actuals_transactions table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.actuals_transactions (
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  txn_id text NOT NULL,
  txn_date date,
  merchant text,
  amount numeric NOT NULL DEFAULT 0,
  source text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fiscal_year_id, txn_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_actuals_transactions_fy ON public.actuals_transactions(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_actuals_transactions_merchant ON public.actuals_transactions(merchant);

-- Enable RLS
ALTER TABLE public.actuals_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read actuals_transactions"
  ON public.actuals_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert actuals_transactions"
  ON public.actuals_transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can update actuals_transactions"
  ON public.actuals_transactions FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can delete actuals_transactions"
  ON public.actuals_transactions FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- 6) actuals_matching table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.actuals_matching (
  fiscal_year_id uuid PRIMARY KEY REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  matches_by_txn_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_by_merchant_key jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER set_actuals_matching_updated_at
  BEFORE UPDATE ON public.actuals_matching
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.actuals_matching ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read actuals_matching"
  ON public.actuals_matching FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert actuals_matching"
  ON public.actuals_matching FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can update actuals_matching"
  ON public.actuals_matching FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can delete actuals_matching"
  ON public.actuals_matching FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- 7) spend_requests table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.spend_requests (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  origin_fiscal_year_id uuid,
  deleted_at timestamptz,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE TRIGGER set_spend_requests_updated_at
  BEFORE UPDATE ON public.spend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spend_requests_status ON public.spend_requests(status);
CREATE INDEX IF NOT EXISTS idx_spend_requests_origin_fy ON public.spend_requests(origin_fiscal_year_id);

-- Enable RLS
ALTER TABLE public.spend_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read spend_requests"
  ON public.spend_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert spend_requests"
  ON public.spend_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update spend_requests"
  ON public.spend_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete spend_requests"
  ON public.spend_requests FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));

-- 8) approval_audit_events table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.approval_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_role text,
  note text,
  meta jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_approval_audit_entity ON public.approval_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_created_at ON public.approval_audit_events(created_at);

-- Enable RLS
ALTER TABLE public.approval_audit_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read approval_audit_events"
  ON public.approval_audit_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert approval_audit_events"
  ON public.approval_audit_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update approval_audit_events"
  ON public.approval_audit_events FOR UPDATE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin']::public.user_role[]));

CREATE POLICY "Admins can delete approval_audit_events"
  ON public.approval_audit_events FOR DELETE
  TO authenticated
  USING (public.has_any_role(ARRAY['admin']::public.user_role[]));
