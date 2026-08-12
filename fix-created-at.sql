-- ============================================================
--  FIXED: Add DEFAULT now() to created_at on all tables
--  and backfill any existing NULL created_at values.
--  Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- PROFILES
ALTER TABLE public."Profiles"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public."Profiles"
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE public."Profiles"
  SET created_at = now()
  WHERE created_at IS NULL;

-- REPORTS
ALTER TABLE public."Reports"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public."Reports"
  ALTER COLUMN created_at SET DEFAULT now();

-- Backfill using the user-entered 'date' column if it's set, otherwise now()
-- Note: 'date' might be a DATE type or a TEXT type. We use a safe cast.
UPDATE public."Reports"
  SET created_at = COALESCE(
    CASE 
      WHEN "date" IS NOT NULL AND "date"::text <> '' AND "date"::text <> 'null'
      THEN 
        CASE 
          -- Try to cast to timestamptz safely
          WHEN "date"::text ~ '^\d{4}-\d{2}-\d{2}' THEN "date"::timestamptz
          ELSE NULL
        END
      ELSE NULL
    END,
    now()
  )
  WHERE created_at IS NULL;

-- ITEMS
ALTER TABLE public."Items"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public."Items"
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE public."Items"
  SET created_at = now()
  WHERE created_at IS NULL;

-- CLAIMS
ALTER TABLE public."Claims"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public."Claims"
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE public."Claims"
  SET created_at = now()
  WHERE created_at IS NULL;

-- Verify: total vs rows-with-date count per table
SELECT 'Profiles' AS tbl, COUNT(*) AS total, COUNT(created_at) AS with_date FROM public."Profiles"
UNION ALL
SELECT 'Reports',  COUNT(*), COUNT(created_at) FROM public."Reports"
UNION ALL
SELECT 'Items',    COUNT(*), COUNT(created_at) FROM public."Items"
UNION ALL
SELECT 'Claims',   COUNT(*), COUNT(created_at) FROM public."Claims";
