-- CLOUD-DATA-5T: Enable realtime publication for cache invalidation tables
-- Also add performance indexes for common queries

-- Add tables to supabase_realtime publication (idempotent)
DO $$
BEGIN
  -- Add fy_forecasts if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fy_forecasts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fy_forecasts;
  END IF;

  -- Add actuals_transactions if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'actuals_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.actuals_transactions;
  END IF;

  -- Add actuals_matching if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'actuals_matching'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.actuals_matching;
  END IF;
END $$;

-- Add performance indexes (idempotent using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_spend_requests_origin_fiscal_year_id 
  ON public.spend_requests(origin_fiscal_year_id);

CREATE INDEX IF NOT EXISTS idx_approval_audit_events_entity_lookup
  ON public.approval_audit_events(entity_type, entity_id, created_at DESC);