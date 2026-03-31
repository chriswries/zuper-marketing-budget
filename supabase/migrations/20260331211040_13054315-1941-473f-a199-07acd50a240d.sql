
-- Add batch tracking columns to actuals_transactions
ALTER TABLE public.actuals_transactions
  ADD COLUMN import_batch_id UUID,
  ADD COLUMN import_filename TEXT;

-- Create import_batches table
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  row_count INTEGER NOT NULL,
  total_amount NUMERIC NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  undone_at TIMESTAMPTZ,
  undone_by_role TEXT
);

-- Indexes
CREATE INDEX idx_actuals_transactions_batch ON public.actuals_transactions(import_batch_id);
CREATE INDEX idx_import_batches_fy ON public.import_batches(fiscal_year_id);

-- RLS
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read import_batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/finance can insert import_batches"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admin/finance can update import_batches"
  ON public.import_batches FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role, 'finance'::user_role]));

CREATE POLICY "Admins can delete import_batches"
  ON public.import_batches FOR DELETE TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));
