-- Fix RLS policies for defense in depth: add explicit auth.uid() IS NOT NULL checks
-- This provides an additional layer of security beyond TO authenticated

-- Fix actuals_transactions: update SELECT policy to include explicit auth check
DROP POLICY IF EXISTS "Authenticated users can read actuals_transactions" ON public.actuals_transactions;

CREATE POLICY "Authenticated users can read actuals_transactions"
  ON public.actuals_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Fix spend_requests: update SELECT policy to include explicit auth check
DROP POLICY IF EXISTS "Authenticated users can read spend_requests" ON public.spend_requests;

CREATE POLICY "Authenticated users can read spend_requests"
  ON public.spend_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Fix other tables for completeness (defense in depth):

-- actuals_matching
DROP POLICY IF EXISTS "Authenticated users can read actuals_matching" ON public.actuals_matching;

CREATE POLICY "Authenticated users can read actuals_matching"
  ON public.actuals_matching
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- admin_settings
DROP POLICY IF EXISTS "Authenticated users can read admin_settings" ON public.admin_settings;

CREATE POLICY "Authenticated users can read admin_settings"
  ON public.admin_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- approval_audit_events
DROP POLICY IF EXISTS "Authenticated users can read approval_audit_events" ON public.approval_audit_events;

CREATE POLICY "Authenticated users can read approval_audit_events"
  ON public.approval_audit_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- canonical_vendors
DROP POLICY IF EXISTS "Authenticated users can read canonical_vendors" ON public.canonical_vendors;

CREATE POLICY "Authenticated users can read canonical_vendors"
  ON public.canonical_vendors
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- fiscal_years
DROP POLICY IF EXISTS "Authenticated users can read fiscal_years" ON public.fiscal_years;

CREATE POLICY "Authenticated users can read fiscal_years"
  ON public.fiscal_years
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- fy_forecasts
DROP POLICY IF EXISTS "Authenticated users can read fy_forecasts" ON public.fy_forecasts;

CREATE POLICY "Authenticated users can read fy_forecasts"
  ON public.fy_forecasts
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- vendor_aliases
DROP POLICY IF EXISTS "Authenticated users can read vendor_aliases" ON public.vendor_aliases;

CREATE POLICY "Authenticated users can read vendor_aliases"
  ON public.vendor_aliases
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);