-- Add relational columns to spend_requests
ALTER TABLE public.spend_requests
  ADD COLUMN IF NOT EXISTS cost_center_id UUID,
  ADD COLUMN IF NOT EXISTS cost_center_name TEXT,
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS start_month TEXT,
  ADD COLUMN IF NOT EXISTS end_month TEXT,
  ADD COLUMN IF NOT EXISTS is_contracted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS justification TEXT,
  ADD COLUMN IF NOT EXISTS requester_id UUID,
  ADD COLUMN IF NOT EXISTS origin_sheet TEXT,
  ADD COLUMN IF NOT EXISTS origin_cost_center_id UUID,
  ADD COLUMN IF NOT EXISTS origin_line_item_id UUID,
  ADD COLUMN IF NOT EXISTS origin_kind TEXT,
  ADD COLUMN IF NOT EXISTS line_item_name TEXT,
  ADD COLUMN IF NOT EXISTS target_request_id UUID,
  ADD COLUMN IF NOT EXISTS current_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS revised_amount NUMERIC;

-- Create request_approval_steps table
CREATE TABLE public.request_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.spend_requests(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ,
  comment TEXT,
  step_order INTEGER NOT NULL,
  UNIQUE(request_id, step_order)
);

ALTER TABLE public.request_approval_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read request_approval_steps"
  ON public.request_approval_steps FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert request_approval_steps"
  ON public.request_approval_steps FOR INSERT TO public
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Privileged roles can update request_approval_steps"
  ON public.request_approval_steps FOR UPDATE TO public
  USING (has_any_role(ARRAY['admin','manager','cmo','finance']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['admin','manager','cmo','finance']::user_role[]));

CREATE POLICY "Admins can delete request_approval_steps"
  ON public.request_approval_steps FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin']::user_role[]));

-- Index
CREATE INDEX idx_request_approval_steps_request_id ON public.request_approval_steps(request_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_approval_steps;