-- =============================================================================
-- 013: Live game status columns on rooms
-- =============================================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS game_period int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_clock text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_status_detail text DEFAULT NULL;

-- Recreate view to include new columns
DROP VIEW IF EXISTS public.rooms_with_counts;
CREATE OR REPLACE VIEW public.rooms_with_counts AS
SELECT r.*, coalesce(rp.cnt, 0) AS participant_count
FROM public.rooms r
LEFT JOIN (
  SELECT room_id, count(*)::int AS cnt
  FROM public.room_participants
  GROUP BY room_id
) rp ON rp.room_id = r.id;
