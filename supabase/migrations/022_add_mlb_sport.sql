-- =============================================================================
-- 022: Add MLB as a supported sport in the rooms table
-- Paste into Supabase SQL Editor and execute.
-- =============================================================================

-- PostgreSQL auto-names the check constraint from ADD COLUMN as rooms_sport_check.
-- Drop it and replace with one that includes mlb.
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_sport_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_sport_check CHECK (sport IN ('nba', 'ncaa', 'mlb'));
