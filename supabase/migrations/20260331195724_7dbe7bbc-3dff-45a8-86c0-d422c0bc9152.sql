
-- 1. Create actuals_matches table
CREATE TABLE public.actuals_matches (
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  txn_id TEXT NOT NULL,
  cost_center_id UUID NOT NULL,
  line_item_id UUID NOT NULL,
  match_source TEXT NOT NULL DEFAULT 'manual',
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_by_role TEXT NOT NULL,
  merchant_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fiscal_year_id, txn_id),
  FOREIGN KEY (fiscal_year_id, txn_id) REFERENCES public.actuals_transactions(fiscal_year_id, txn_id) ON DELETE CASCADE
);

-- 2. Create merchant_rules table
CREATE TABLE public.merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  cost_center_id UUID NOT NULL,
  line_item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_role TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year_id, merchant_key)
);

-- 3. Indexes
CREATE INDEX idx_actuals_matches_fy ON public.actuals_matches(fiscal_year_id);
CREATE INDEX idx_actuals_matches_cost_center ON public.actuals_matches(cost_center_id);
CREATE INDEX idx_merchant_rules_fy ON public.merchant_rules(fiscal_year_id);
CREATE INDEX idx_merchant_rules_merchant ON public.merchant_rules(merchant_key);

-- 4. Enable RLS
ALTER TABLE public.actuals_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for actuals_matches
CREATE POLICY "Authenticated users can read actuals_matches"
  ON public.actuals_matches FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/finance can insert actuals_matches"
  ON public.actuals_matches FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admin/finance can update actuals_matches"
  ON public.actuals_matches FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admin/finance can delete actuals_matches"
  ON public.actuals_matches FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

-- 6. RLS policies for merchant_rules
CREATE POLICY "Authenticated users can read merchant_rules"
  ON public.merchant_rules FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/finance can insert merchant_rules"
  ON public.merchant_rules FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admin/finance can update merchant_rules"
  ON public.merchant_rules FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admin/finance can delete merchant_rules"
  ON public.merchant_rules FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

-- 7. updated_at trigger for merchant_rules
CREATE TRIGGER set_merchant_rules_updated_at
  BEFORE UPDATE ON public.merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
