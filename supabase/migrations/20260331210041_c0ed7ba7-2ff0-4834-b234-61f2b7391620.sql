
-- Drop the legacy JSONB column from fiscal_years
ALTER TABLE public.fiscal_years DROP COLUMN IF EXISTS data;

-- Drop the legacy fy_forecasts table (all forecast data now in monthly_values)
DROP TABLE IF EXISTS public.fy_forecasts;
