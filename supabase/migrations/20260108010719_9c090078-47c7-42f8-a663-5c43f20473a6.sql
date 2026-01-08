-- A) Fix FY archive columns: rename archived_by to archived_by_user_id and add archived_by_role

-- Rename existing column to clarify it stores user UUID
ALTER TABLE public.fiscal_years 
RENAME COLUMN archived_by TO archived_by_user_id;

-- Add new column for role string
ALTER TABLE public.fiscal_years 
ADD COLUMN archived_by_role text;