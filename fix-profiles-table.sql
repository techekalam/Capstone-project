-- ============================================================
--  FIX PROFILES TABLE SCHEMA & RLS POLICIES
--  Run this in: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================

-- 1) Ensure all required columns exist on Profiles table
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public."Profiles" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2) Enable Row Level Security
ALTER TABLE public."Profiles" ENABLE ROW LEVEL SECURITY;

-- 3) Grant full table access permissions to authenticated users & service role
GRANT ALL ON TABLE public."Profiles" TO authenticated;
GRANT ALL ON TABLE public."Profiles" TO service_role;
GRANT SELECT ON TABLE public."Profiles" TO anon;

-- 4) Re-create clean RLS Policies for Profiles

-- SELECT Policy: Authenticated users can view all profiles
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public."Profiles";
DROP POLICY IF EXISTS "profiles_select_own" ON public."Profiles";
DROP POLICY IF EXISTS "profiles_select_admin_all" ON public."Profiles";

CREATE POLICY "profiles_select_authenticated" ON public."Profiles"
  FOR SELECT TO authenticated
  USING (true);

-- INSERT Policy: Users can insert their own profile
DROP POLICY IF EXISTS "profiles_insert_own" ON public."Profiles";
CREATE POLICY "profiles_insert_own" ON public."Profiles"
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = id::text OR auth.uid() = id);

-- UPDATE Policy: Users can update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON public."Profiles";
DROP POLICY IF EXISTS "profiles_update_admin_all" ON public."Profiles";

CREATE POLICY "profiles_update_own" ON public."Profiles"
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = id::text OR auth.uid() = id)
  WITH CHECK (auth.uid()::text = id::text OR auth.uid() = id);

-- 5) Verification SELECT
SELECT id, full_name, email, phone, role FROM public."Profiles" LIMIT 5;
