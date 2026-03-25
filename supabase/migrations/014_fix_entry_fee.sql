-- =============================================================================
-- 014: Fix deduct_entry_fee — check dabs_transactions instead of room_participants
-- =============================================================================
-- BUG: LobbyPage inserts the room_participants row BEFORE navigating to GamePage,
-- so the old RPC always found an existing participant row and skipped the charge.
-- FIX: Use dabs_transactions (reason='entry_fee') as the idempotency guard.

CREATE OR REPLACE FUNCTION public.deduct_entry_fee(p_user_id uuid, p_room_id uuid, p_amount int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance         int;
  v_room_sport      text;
  v_already_charged boolean;
BEGIN
  -- Idempotency: check if entry fee was already charged for this user+room
  SELECT EXISTS(
    SELECT 1 FROM dabs_transactions
    WHERE user_id = p_user_id
      AND room_id  = p_room_id
      AND reason   = 'entry_fee'
  ) INTO v_already_charged;

  IF v_already_charged THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'already_charged');
  END IF;

  -- NCAA (March Madness) = free
  SELECT sport INTO v_room_sport FROM rooms WHERE id = p_room_id;
  IF v_room_sport = 'ncaa' THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'march_madness_free');
  END IF;

  -- Check balance
  SELECT dabs_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_dabs', 'balance', v_balance, 'cost', p_amount);
  END IF;

  -- Deduct
  UPDATE profiles SET dabs_balance = dabs_balance - p_amount WHERE id = p_user_id;

  -- Record transaction
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
  VALUES (p_user_id, -p_amount, 'entry_fee', p_room_id);

  RETURN jsonb_build_object('success', true, 'charged', p_amount, 'new_balance', v_balance - p_amount);
END;
$$;
