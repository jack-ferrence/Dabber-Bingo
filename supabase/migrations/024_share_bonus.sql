-- ── Share bonus RPC ──────────────────────────────────────────────────────────
-- Awards a one-time 1.8x share bonus (0.8x of base game dobs) when a player
-- shares their post-game card. Idempotent: returns early if already claimed.

CREATE OR REPLACE FUNCTION public.claim_share_bonus(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_base_dobs int;
  v_bonus     int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Check if already claimed
  IF EXISTS (
    SELECT 1 FROM dabs_transactions
    WHERE user_id = v_uid AND room_id = p_room_id AND reason = 'share_bonus'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_claimed');
  END IF;

  -- Sum all positive dobs earned in this room (squares, lines, position, participation)
  SELECT COALESCE(SUM(amount), 0) INTO v_base_dobs
  FROM dabs_transactions
  WHERE user_id = v_uid AND room_id = p_room_id AND amount > 0 AND reason != 'share_bonus';

  IF v_base_dobs <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_earnings');
  END IF;

  v_bonus := ROUND(v_base_dobs * 0.8);

  -- Award bonus
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
  VALUES (v_uid, v_bonus, 'share_bonus', p_room_id);

  UPDATE profiles SET dabs_balance = dabs_balance + v_bonus WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'bonus', v_bonus, 'base_dobs', v_base_dobs);
END;
$$;
