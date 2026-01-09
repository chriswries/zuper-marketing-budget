-- ============================================
-- Global Canonical Vendor Registry
-- ============================================

-- 1. Create canonical_vendors table
CREATE TABLE IF NOT EXISTS public.canonical_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Case-insensitive unique index on name
CREATE UNIQUE INDEX IF NOT EXISTS canonical_vendors_name_lower_idx 
  ON public.canonical_vendors (lower(name));

-- Enable RLS
ALTER TABLE public.canonical_vendors ENABLE ROW LEVEL SECURITY;

-- RLS policies for canonical_vendors
CREATE POLICY "Authenticated users can read canonical_vendors"
  ON public.canonical_vendors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert canonical_vendors"
  ON public.canonical_vendors FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role]));

CREATE POLICY "Admins can update canonical_vendors"
  ON public.canonical_vendors FOR UPDATE
  TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role]));

CREATE POLICY "Admins can delete canonical_vendors"
  ON public.canonical_vendors FOR DELETE
  TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- updated_at trigger for canonical_vendors
CREATE TRIGGER set_canonical_vendors_updated_at
  BEFORE UPDATE ON public.canonical_vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. Create vendor_aliases table
CREATE TABLE IF NOT EXISTS public.vendor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_key text NOT NULL,
  alias_display text,
  canonical_vendor_id uuid NOT NULL REFERENCES public.canonical_vendors(id) ON DELETE CASCADE,
  source text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Unique index on alias_key for duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS vendor_aliases_alias_key_idx 
  ON public.vendor_aliases (alias_key);

-- Enable RLS
ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;

-- RLS policies for vendor_aliases
CREATE POLICY "Authenticated users can read vendor_aliases"
  ON public.vendor_aliases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert vendor_aliases"
  ON public.vendor_aliases FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(ARRAY['admin'::user_role]));

CREATE POLICY "Admins can update vendor_aliases"
  ON public.vendor_aliases FOR UPDATE
  TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]))
  WITH CHECK (has_any_role(ARRAY['admin'::user_role]));

CREATE POLICY "Admins can delete vendor_aliases"
  ON public.vendor_aliases FOR DELETE
  TO authenticated
  USING (has_any_role(ARRAY['admin'::user_role]));

-- updated_at trigger for vendor_aliases
CREATE TRIGGER set_vendor_aliases_updated_at
  BEFORE UPDATE ON public.vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. Add canonical_vendor_id to actuals_transactions
ALTER TABLE public.actuals_transactions
  ADD COLUMN IF NOT EXISTS canonical_vendor_id uuid REFERENCES public.canonical_vendors(id) ON DELETE SET NULL;

-- Enable realtime for vendor registry tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.canonical_vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendor_aliases;