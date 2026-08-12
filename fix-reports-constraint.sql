-- ============================================================
-- FIX: Remove unique constraint on user_id in Reports table
-- Run this in: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================

-- Drop the unique constraint on user_id so users can submit multiple reports
ALTER TABLE public."Reports" DROP CONSTRAINT IF EXISTS "Reports_user_id_key";
ALTER TABLE public."Claims" DROP CONSTRAINT IF EXISTS "Claims_user_id_key";

