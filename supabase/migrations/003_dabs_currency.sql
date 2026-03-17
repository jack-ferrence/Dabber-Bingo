-- =============================================================================
-- 003: Dabs currency system
-- Paste into Supabase SQL Editor and execute on existing projects.
-- =============================================================================

-- ── dabs_balance on profiles ──────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dabs_balance int NOT NULL DEFAULT 100;

-- ── dabs_transactions ledger ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dabs_transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     int NOT NULL,  -- positive = earned, negative = spent
  reason     text NOT NULL, -- 'squares_marked', 'lines_completed', 'finish_1', 'participation', etc.
  room_id    uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dabs_transactions_user
  ON public.dabs_transactions(user_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.dabs_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dabs_select_own"
  ON public.dabs_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── award_game_dabs RPC ───────────────────────────────────────────────────────
-- Called when a room transitions to 'finished'. Idempotent: safe to call twice.
-- Ranks players by lines_completed DESC, squares_marked DESC, card created_at ASC.
-- Awards: 2 dabs/square, 10 dabs/line, position bonus, +3 participation.
CREATE OR REPLACE FUNCTION public.award_game_dabs(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card         RECORD;
  v_position_bonus int;
  v_square_dabs  int;
  v_line_dabs    int;
  v_participation int := 3;
  v_total        int;
  v_awarded      int := 0;
  v_already      boolean;
BEGIN
  -- Idempotency: bail if dabs already awarded for this room
  SELECT EXISTS(
    SELECT 1 FROM dabs_transactions WHERE room_id = p_room_id LIMIT 1
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_awarded');
  END IF;

  FOR v_card IN
    SELECT
      c.user_id,
      c.lines_completed,
      c.squares_marked,
      ROW_NUMBER() OVER (
        ORDER BY c.lines_completed DESC, c.squares_marked DESC, c.created_at ASC
      ) AS rank
    FROM public.cards c
    WHERE c.room_id = p_room_id
  LOOP
    v_position_bonus := CASE v_card.rank
      WHEN 1 THEN 100
      WHEN 2 THEN 60
      WHEN 3 THEN 40
      WHEN 4 THEN 25
      WHEN 5 THEN 15
      ELSE CASE WHEN v_card.rank <= 10 THEN 5 ELSE 0 END
    END;

    v_square_dabs := v_card.squares_marked * 2;
    v_line_dabs   := v_card.lines_completed * 10;
    v_total       := v_square_dabs + v_line_dabs + v_position_bonus + v_participation;

    IF v_square_dabs > 0 THEN
      INSERT INTO public.dabs_transactions (user_id, amount, reason, room_id)
      VALUES (v_card.user_id, v_square_dabs, 'squares_marked', p_room_id);
    END IF;

    IF v_line_dabs > 0 THEN
      INSERT INTO public.dabs_transactions (user_id, amount, reason, room_id)
      VALUES (v_card.user_id, v_line_dabs, 'lines_completed', p_room_id);
    END IF;

    IF v_position_bonus > 0 THEN
      INSERT INTO public.dabs_transactions (user_id, amount, reason, room_id)
      VALUES (v_card.user_id, v_position_bonus, 'finish_' || v_card.rank::text, p_room_id);
    END IF;

    INSERT INTO public.dabs_transactions (user_id, amount, reason, room_id)
    VALUES (v_card.user_id, v_participation, 'participation', p_room_id);

    UPDATE public.profiles
      SET dabs_balance = dabs_balance + v_total
      WHERE id = v_card.user_id;

    v_awarded := v_awarded + 1;
  END LOOP;

  RETURN jsonb_build_object('awarded', v_awarded, 'room_id', p_room_id);
END;
$$;

-- ── Realtime publication ──────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dabs_transactions;
