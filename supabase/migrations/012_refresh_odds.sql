-- =============================================================================
-- 012: Server-side odds management — schema + refund RPC
-- =============================================================================

-- Add odds columns to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS odds_pool jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odds_updated_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odds_status text DEFAULT 'pending'
    CHECK (odds_status IN ('pending', 'ready', 'insufficient'));

-- Recreate view to include new columns (r.* now includes odds_pool etc.)
DROP VIEW IF EXISTS public.rooms_with_counts;
CREATE OR REPLACE VIEW public.rooms_with_counts AS
SELECT r.*, coalesce(rp.cnt, 0) AS participant_count
FROM public.rooms r
LEFT JOIN (
  SELECT room_id, count(*)::int AS cnt
  FROM public.room_participants
  GROUP BY room_id
) rp ON rp.room_id = r.id;

-- Refund RPC for odds reconciliation when a player is removed from the pool
CREATE OR REPLACE FUNCTION public.refund_dabs(
  p_user_id uuid,
  p_amount   int,
  p_room_id  uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_amount');
  END IF;

  UPDATE profiles SET dabs_balance = dabs_balance + p_amount WHERE id = p_user_id;

  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
  VALUES (p_user_id, p_amount, 'odds_refund', p_room_id);

  RETURN jsonb_build_object('success', true, 'refunded', p_amount);
END;
$$;
