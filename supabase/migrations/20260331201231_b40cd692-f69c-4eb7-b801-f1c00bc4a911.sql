
-- 1. Add columns to fiscal_years
ALTER TABLE public.fiscal_years
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS target_budget NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_rejected_at TIMESTAMPTZ;

-- 2. Budget approval steps
CREATE TABLE public.budget_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ,
  step_order INTEGER NOT NULL,
  UNIQUE (fiscal_year_id, level)
);

-- 3. Cost centers
CREATE TABLE public.cost_centers (
  id UUID PRIMARY KEY,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id UUID,
  annual_limit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Line items
CREATE TABLE public.line_items (
  id UUID PRIMARY KEY,
  cost_center_id UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vendor_id UUID REFERENCES public.canonical_vendors(id),
  vendor_name TEXT,
  owner_id UUID,
  is_contracted BOOLEAN NOT NULL DEFAULT false,
  is_accrual BOOLEAN NOT NULL DEFAULT false,
  is_software_subscription BOOLEAN NOT NULL DEFAULT false,
  contract_start_date DATE,
  contract_end_date DATE,
  auto_renew BOOLEAN,
  cancellation_notice_days INTEGER,
  approval_status TEXT,
  approval_request_id UUID,
  adjustment_status TEXT,
  adjustment_request_id UUID,
  adjustment_before_values JSONB,
  adjustment_sheet TEXT,
  deletion_status TEXT,
  deletion_request_id UUID,
  cancellation_status TEXT,
  cancellation_request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Monthly values
CREATE TABLE public.monthly_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID NOT NULL REFERENCES public.line_items(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  value_type TEXT NOT NULL,
  month TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (line_item_id, value_type, month)
);

-- 6. Indexes
CREATE INDEX idx_cost_centers_fy ON public.cost_centers(fiscal_year_id);
CREATE INDEX idx_line_items_cc ON public.line_items(cost_center_id);
CREATE INDEX idx_line_items_fy ON public.line_items(fiscal_year_id);
CREATE INDEX idx_monthly_values_li ON public.monthly_values(line_item_id);
CREATE INDEX idx_monthly_values_fy_type ON public.monthly_values(fiscal_year_id, value_type);

-- 7. Enable RLS
ALTER TABLE public.budget_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_values ENABLE ROW LEVEL SECURITY;

-- 8. RLS: budget_approval_steps
CREATE POLICY "Authenticated users can read budget_approval_steps"
  ON public.budget_approval_steps FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/manager/cmo can insert budget_approval_steps"
  ON public.budget_approval_steps FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admin/manager/cmo can update budget_approval_steps"
  ON public.budget_approval_steps FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admins can delete budget_approval_steps"
  ON public.budget_approval_steps FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- 9. RLS: cost_centers
CREATE POLICY "Authenticated users can read cost_centers"
  ON public.cost_centers FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/manager/cmo can insert cost_centers"
  ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admin/manager/cmo can update cost_centers"
  ON public.cost_centers FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admins can delete cost_centers"
  ON public.cost_centers FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- 10. RLS: line_items
CREATE POLICY "Authenticated users can read line_items"
  ON public.line_items FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/manager/cmo can insert line_items"
  ON public.line_items FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admin/manager/cmo can update line_items"
  ON public.line_items FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admins can delete line_items"
  ON public.line_items FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- 11. RLS: monthly_values
CREATE POLICY "Authenticated users can read monthly_values"
  ON public.monthly_values FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/manager/cmo can insert monthly_values"
  ON public.monthly_values FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admin/manager/cmo can update monthly_values"
  ON public.monthly_values FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role]));
CREATE POLICY "Admins can delete monthly_values"
  ON public.monthly_values FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- 12. updated_at triggers
CREATE TRIGGER set_cost_centers_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_line_items_updated_at
  BEFORE UPDATE ON public.line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
