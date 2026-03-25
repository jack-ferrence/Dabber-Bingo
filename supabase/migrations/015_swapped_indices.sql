-- =============================================================================
-- 015: Track which card squares the user explicitly paid to swap
-- =============================================================================
-- swapped_indices: jsonb array of square indices (0-24) the user swapped.
-- refresh-odds reconciliation skips these squares so paid swaps are protected.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS swapped_indices jsonb DEFAULT '[]'::jsonb;

-- Update swap_card_square to append the swapped index to swapped_indices
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, int, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, jsonb, int);
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, jsonb, int, jsonb);

CREATE OR REPLACE FUNCTION public.swap_card_square(
  p_room_id      uuid,
  p_square_index int,
  p_roster       jsonb    DEFAULT NULL,
  p_new_square   jsonb    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_card         record;
  v_room         record;
  v_squares      jsonb;
  v_swap_count   int;
  v_cost         int;
  v_balance      int;
  v_new_square   jsonb;
  v_player       jsonb;
  v_stat_types   text[] := ARRAY[
    'pts','reb','ast','stl','blk','to','3pm',
    'pts_reb_ast','pts_reb','pts_ast','reb_ast'
  ];
  v_stat_type    text;
  v_threshold    numeric;
  v_player_name  text;
  v_player_id    uuid;
  v_display_text text;
  v_rand_idx     int;
  v_roster_len   int;
BEGIN
  -- Load room
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'room_not_found');
  END IF;

  -- Only allow swaps in lobby
  IF v_room.status <> 'lobby' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'game_already_started');
  END IF;

  -- Load card
  SELECT * INTO v_card
  FROM public.cards
  WHERE room_id = p_room_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'card_not_found');
  END IF;

  v_squares    := v_card.squares;
  v_swap_count := COALESCE(v_card.swap_count, 0);

  -- Enforce max 2 swaps
  IF v_swap_count >= 2 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'max_swaps_reached');
  END IF;

  -- Determine cost
  v_cost := CASE WHEN v_swap_count = 0 THEN 10 ELSE 50 END;

  -- Check Dabs balance
  SELECT dabs_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_dabs',
      'balance', COALESCE(v_balance, 0),
      'cost', v_cost
    );
  END IF;

  -- Validate square index
  IF p_square_index < 0 OR p_square_index > 24 OR p_square_index = 12 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_square_index');
  END IF;

  -- Build the new square
  IF p_new_square IS NOT NULL THEN
    -- Use caller-provided square (odds-based card swap)
    v_new_square := p_new_square || jsonb_build_object(
      'marked', false,
      'id', gen_random_uuid()
    );
  ELSIF p_roster IS NOT NULL AND jsonb_array_length(p_roster) > 0 THEN
    -- Pick a random player from roster
    v_roster_len := jsonb_array_length(p_roster);
    v_rand_idx   := floor(random() * v_roster_len)::int;
    v_player     := p_roster -> v_rand_idx;

    v_player_name  := v_player ->> 'name';
    v_player_id    := (v_player ->> 'id')::uuid;
    v_stat_type    := v_stat_types[1 + floor(random() * array_length(v_stat_types, 1))::int];
    v_threshold    := CASE
      WHEN v_stat_type = 'pts'         THEN (10 + floor(random() * 25))::numeric
      WHEN v_stat_type = 'reb'         THEN (3  + floor(random() * 10))::numeric
      WHEN v_stat_type = 'ast'         THEN (2  + floor(random() * 10))::numeric
      WHEN v_stat_type = 'stl'         THEN (0  + floor(random() * 4))::numeric + 0.5
      WHEN v_stat_type = 'blk'         THEN (0  + floor(random() * 4))::numeric + 0.5
      WHEN v_stat_type = 'to'          THEN (1  + floor(random() * 4))::numeric
      WHEN v_stat_type = '3pm'         THEN (1  + floor(random() * 4))::numeric
      WHEN v_stat_type = 'pts_reb_ast' THEN (20 + floor(random() * 20))::numeric
      WHEN v_stat_type = 'pts_reb'     THEN (15 + floor(random() * 15))::numeric
      WHEN v_stat_type = 'pts_ast'     THEN (12 + floor(random() * 15))::numeric
      WHEN v_stat_type = 'reb_ast'     THEN (5  + floor(random() * 12))::numeric
      ELSE (10 + floor(random() * 20))::numeric
    END;

    v_display_text := split_part(v_player_name, ' ', 2) || ' ' || v_threshold || '+ ' || v_stat_type;
    IF v_display_text = '' THEN v_display_text := v_player_name || ' ' || v_threshold || '+ ' || v_stat_type; END IF;

    v_new_square := jsonb_build_object(
      'id',           gen_random_uuid(),
      'player_id',    v_player_id,
      'player_name',  v_player_name,
      'stat_type',    v_stat_type,
      'threshold',    v_threshold,
      'display_text', v_display_text,
      'marked',       false
    );
  ELSE
    -- Minimal fallback: generate a generic square
    v_stat_type := v_stat_types[1 + floor(random() * array_length(v_stat_types, 1))::int];
    v_threshold := (10 + floor(random() * 20))::numeric;
    v_new_square := jsonb_build_object(
      'id',           gen_random_uuid(),
      'player_id',    null,
      'player_name',  null,
      'stat_type',    v_stat_type,
      'threshold',    v_threshold,
      'display_text', v_threshold || '+ ' || v_stat_type,
      'marked',       false
    );
  END IF;

  -- Deduct Dabs
  UPDATE public.profiles
  SET dabs_balance = dabs_balance - v_cost
  WHERE id = v_user_id;

  -- Replace the square and record which index was swapped (protected from reconciliation)
  v_squares := jsonb_set(v_squares, ARRAY[p_square_index::text], v_new_square);

  UPDATE public.cards
  SET squares         = v_squares,
      swap_count      = v_swap_count + 1,
      swapped_indices = COALESCE(swapped_indices, '[]'::jsonb) || to_jsonb(p_square_index)
  WHERE id = v_card.id;

  RETURN jsonb_build_object(
    'success',      true,
    'square_index', p_square_index,
    'new_square',   v_new_square,
    'swap_count',   v_swap_count + 1,
    'cost',         v_cost,
    'balance',      v_balance - v_cost
  );
END;
$$;
