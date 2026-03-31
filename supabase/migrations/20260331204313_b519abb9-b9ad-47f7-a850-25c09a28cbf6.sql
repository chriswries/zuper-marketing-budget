
-- 1. Drop the old RLS policy that references data JSONB
DROP POLICY IF EXISTS "Users can update own requests or privileged roles can update an" ON public.spend_requests;

-- 2. Recreate using relational requester_id column
CREATE POLICY "Users can update own requests or privileged roles can update"
ON public.spend_requests
FOR UPDATE
TO public
USING (
  (requester_id = auth.uid()) OR has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role])
)
WITH CHECK (
  (requester_id = auth.uid()) OR has_any_role(ARRAY['admin'::user_role, 'manager'::user_role, 'cmo'::user_role])
);

-- 3. Now safe to drop data column from spend_requests
ALTER TABLE public.spend_requests DROP COLUMN IF EXISTS data;

-- 4. Drop actuals_matching table
DROP TABLE IF EXISTS public.actuals_matching;
