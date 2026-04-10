-- ── Mini-game daily activity columns ─────────────────────────────────────────
-- Adds 3 new mini-game activity types alongside existing picks/trivia/game.

ALTER TABLE public.daily_activities
  ADD COLUMN IF NOT EXISTS derby_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS derby_dobs_earned int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passer_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passer_dobs_earned int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flick_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flick_dobs_earned int NOT NULL DEFAULT 0;

-- Extend the complete_daily_activity RPC to handle new activity types.
-- This is a CREATE OR REPLACE so it safely updates the existing function.
CREATE OR REPLACE FUNCTION public.complete_daily_activity(
  p_user_id uuid,
  p_activity text,
  p_dobs_earned int DEFAULT 0,
  p_game_type text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_row  daily_activities;
  v_col_completed text;
  v_col_dobs text;
  v_already boolean;
BEGIN
  -- Validate activity type
  IF p_activity NOT IN ('picks', 'trivia', 'game', 'derby', 'passer', 'flick') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_activity');
  END IF;

  -- Upsert today's row
  INSERT INTO daily_activities (user_id, activity_date)
  VALUES (p_user_id, v_today)
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  -- Build column names
  v_col_completed := p_activity || '_completed';
  v_col_dobs := p_activity || '_dobs_earned';

  -- Check if already completed (dynamic SQL)
  EXECUTE format('SELECT %I FROM daily_activities WHERE user_id = $1 AND activity_date = $2', v_col_completed)
    INTO v_already USING p_user_id, v_today;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_completed');
  END IF;

  -- Mark completed and award dobs
  EXECUTE format(
    'UPDATE daily_activities SET %I = true, %I = $1 WHERE user_id = $2 AND activity_date = $3',
    v_col_completed, v_col_dobs
  ) USING p_dobs_earned, p_user_id, v_today;

  -- Award dobs to balance
  IF p_dobs_earned > 0 THEN
    UPDATE profiles SET dabs_balance = dabs_balance + p_dobs_earned WHERE id = p_user_id;
    INSERT INTO dabs_transactions (user_id, amount, reason)
    VALUES (p_user_id, p_dobs_earned, 'daily_' || p_activity);
  END IF;

  -- Check if all 6 activities are now complete for bonus
  SELECT * INTO v_row FROM daily_activities WHERE user_id = p_user_id AND activity_date = v_today;
  IF v_row.picks_completed AND v_row.trivia_completed
     AND v_row.derby_completed AND v_row.passer_completed AND v_row.flick_completed
     AND NOT COALESCE(v_row.all_three_bonus_awarded, false) THEN
    UPDATE daily_activities SET all_three_bonus_awarded = true
    WHERE user_id = p_user_id AND activity_date = v_today;
    UPDATE profiles SET dabs_balance = dabs_balance + 30 WHERE id = p_user_id;
    INSERT INTO dabs_transactions (user_id, amount, reason)
    VALUES (p_user_id, 30, 'daily_all_complete_bonus');
  END IF;

  -- Update streak
  INSERT INTO daily_streaks (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE daily_streaks
  SET current_streak = CASE
        WHEN last_completed_date = v_today THEN current_streak
        WHEN last_completed_date = v_today - 1 THEN current_streak + 1
        ELSE 1
      END,
      longest_streak = GREATEST(longest_streak, CASE
        WHEN last_completed_date = v_today THEN current_streak
        WHEN last_completed_date = v_today - 1 THEN current_streak + 1
        ELSE 1
      END),
      last_completed_date = v_today
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'dobs_earned', p_dobs_earned);
END;
$$;
