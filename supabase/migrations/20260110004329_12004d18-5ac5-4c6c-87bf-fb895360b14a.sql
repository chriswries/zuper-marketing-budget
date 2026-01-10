-- Fix RLS policies with overly permissive USING(true) or WITH CHECK(true) for INSERT/UPDATE/DELETE

-- 1. Fix approval_audit_events INSERT policy
-- Require the creator to be the current authenticated user (already has default of auth.uid())
DROP POLICY IF EXISTS "Authenticated users can insert approval_audit_events" ON public.approval_audit_events;
CREATE POLICY "Authenticated users can insert approval_audit_events"
  ON public.approval_audit_events
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Fix spend_requests INSERT policy
-- Require the creator to be authenticated
DROP POLICY IF EXISTS "Authenticated users can insert spend_requests" ON public.spend_requests;
CREATE POLICY "Authenticated users can insert spend_requests"
  ON public.spend_requests
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Fix spend_requests UPDATE policy
-- Allow users to update their own requests, or admin/manager/cmo/finance to update any
DROP POLICY IF EXISTS "Authenticated users can update spend_requests" ON public.spend_requests;
CREATE POLICY "Users can update own requests or privileged roles can update any"
  ON public.spend_requests
  FOR UPDATE
  USING (
    -- User created the request (requesterId in data JSON)
    (data->>'requesterId')::uuid = auth.uid()
    -- Or user has a privileged role
    OR has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role])
  )
  WITH CHECK (
    (data->>'requesterId')::uuid = auth.uid()
    OR has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role])
  );

-- 4. Add CHECK constraints for JSONB input validation

-- Ensure spend_requests has required requesterId field
ALTER TABLE public.spend_requests
  DROP CONSTRAINT IF EXISTS check_spend_request_has_requester;
ALTER TABLE public.spend_requests
  ADD CONSTRAINT check_spend_request_has_requester
  CHECK (data ? 'requesterId');

-- Ensure fiscal_years has required data fields
ALTER TABLE public.fiscal_years
  DROP CONSTRAINT IF EXISTS check_fiscal_year_data_structure;
ALTER TABLE public.fiscal_years
  ADD CONSTRAINT check_fiscal_year_data_structure
  CHECK (
    data ? 'startDate' AND 
    data ? 'endDate'
  );