-- =============================================================================
-- 005: Dabs Store — cosmetics, store_items, purchase/equip/swap RPCs
-- Paste into Supabase SQL Editor and execute.
-- =============================================================================

-- ── A. Add cosmetics / equipped columns to profiles ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cosmetics jsonb NOT NULL DEFAULT '{"badges":[],"board_skins":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS equipped  jsonb NOT NULL DEFAULT '{"badge":null,"board_skin":null}'::jsonb;

-- ── B. store_items catalog ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_items (
  id          text PRIMARY KEY,
  category    text NOT NULL
    CHECK (category IN ('name_color','name_font','badge','board_skin','card_swap')),
  label       text NOT NULL,
  cost        int  NOT NULL,
  value       text NOT NULL,
  preview     text,
  sort_order  int  NOT NULL DEFAULT 0
);

-- ── C. Seed ───────────────────────────────────────────────────────────────────

-- Name Colors (50 Dabs each)
INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('color_orange', 'name_color', 'Firestarter', 50, '#ff6b35', 10),
  ('color_green',  'name_color', 'Go Mode',     50, '#22c55e', 11),
  ('color_blue',   'name_color', 'Ice Cold',    50, '#3b82f6', 12),
  ('color_purple', 'name_color', 'Royal',       50, '#8b5cf6', 13),
  ('color_red',    'name_color', 'Red Alert',   50, '#ef4444', 14),
  ('color_gold',   'name_color', 'Top Brass',   50, '#f59e0b', 15),
  ('color_teal',   'name_color', 'Deep Water',  50, '#14b8a6', 16),
  ('color_pink',   'name_color', 'Neon Sign',   50, '#ec4899', 17)
ON CONFLICT (id) DO NOTHING;

-- Name Fonts (75 Dabs each)
INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('font_mono',    'name_font', 'Mono',    75, 'mono',    20),
  ('font_display', 'name_font', 'Display', 75, 'display', 21),
  ('font_serif',   'name_font', 'Serif',   75, 'serif',   22),
  ('font_rounded', 'name_font', 'Rounded', 75, 'rounded', 23)
ON CONFLICT (id) DO NOTHING;

-- Badges (100–200 Dabs each)
INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('badge_fire',  'badge', 'On Fire', 100, '🔥', 30),
  ('badge_goat',  'badge', 'GOAT',    150, '🐐', 31),
  ('badge_crown', 'badge', 'Crown',   200, '👑', 32),
  ('badge_zap',   'badge', 'Zapper',  100, '⚡', 33),
  ('badge_gem',   'badge', 'Gem',     150, '💎', 34)
ON CONFLICT (id) DO NOTHING;

-- Board Skins (150 Dabs each)
INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('skin_neon',    'board_skin', 'Neon Grid', 150, 'neon',    40),
  ('skin_stealth', 'board_skin', 'Stealth',   150, 'stealth', 41),
  ('skin_inferno', 'board_skin', 'Inferno',   150, 'inferno', 42)
ON CONFLICT (id) DO NOTHING;

-- Card Swap
INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('card_swap', 'card_swap', 'Card Swap', 5, 'swap', 50)
ON CONFLICT (id) DO NOTHING;

-- ── D. RLS on store_items ─────────────────────────────────────────────────────
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_items_public_read" ON public.store_items;
CREATE POLICY "store_items_public_read"
  ON public.store_items FOR SELECT TO authenticated USING (true);

-- ── E. purchase_item RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid;
  v_item     public.store_items;
  v_balance  int;
  v_cosmetics jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Fetch item
  SELECT * INTO v_item FROM store_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found: %', p_item_id; END IF;

  -- Fetch caller profile
  SELECT dabs_balance, cosmetics INTO v_balance, v_cosmetics
    FROM profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  -- Validate balance
  IF v_balance < v_item.cost THEN
    RAISE EXCEPTION 'Insufficient Dabs: need %, have %', v_item.cost, v_balance;
  END IF;

  -- Apply cosmetic
  CASE v_item.category
    WHEN 'name_color' THEN
      UPDATE profiles SET name_color = v_item.value WHERE id = v_uid;

    WHEN 'name_font' THEN
      UPDATE profiles SET name_font = v_item.value WHERE id = v_uid;

    WHEN 'badge' THEN
      -- Skip if already owned
      IF v_cosmetics->'badges' @> to_jsonb(p_item_id) THEN
        RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'category', v_item.category,
          'new_balance', v_balance, 'note', 'already_owned');
      END IF;
      UPDATE profiles
        SET cosmetics = jsonb_set(cosmetics, '{badges}', cosmetics->'badges' || to_jsonb(p_item_id))
        WHERE id = v_uid;

    WHEN 'board_skin' THEN
      -- Skip if already owned
      IF v_cosmetics->'board_skins' @> to_jsonb(p_item_id) THEN
        RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'category', v_item.category,
          'new_balance', v_balance, 'note', 'already_owned');
      END IF;
      UPDATE profiles
        SET cosmetics = jsonb_set(cosmetics, '{board_skins}', cosmetics->'board_skins' || to_jsonb(p_item_id))
        WHERE id = v_uid;

    WHEN 'card_swap' THEN
      -- Consumable: just deduct, no inventory
      NULL;

    ELSE
      RAISE EXCEPTION 'Unknown category: %', v_item.category;
  END CASE;

  -- Deduct Dabs
  UPDATE profiles SET dabs_balance = dabs_balance - v_item.cost WHERE id = v_uid;

  -- Log transaction
  INSERT INTO dabs_transactions (user_id, amount, reason)
    VALUES (v_uid, -v_item.cost, 'store_purchase:' || p_item_id);

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'category', v_item.category,
    'new_balance', v_balance - v_item.cost
  );
END;
$$;

-- ── F. equip_item RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.equip_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid;
  v_item     public.store_items;
  v_cosmetics jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM store_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found: %', p_item_id; END IF;

  SELECT cosmetics INTO v_cosmetics FROM profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  CASE v_item.category
    WHEN 'badge' THEN
      -- Validate ownership
      IF NOT (v_cosmetics->'badges' @> to_jsonb(p_item_id)) THEN
        RAISE EXCEPTION 'You do not own this badge';
      END IF;
      UPDATE profiles
        SET equipped = jsonb_set(equipped, '{badge}', to_jsonb(v_item.value))
        WHERE id = v_uid;

    WHEN 'board_skin' THEN
      -- Validate ownership
      IF NOT (v_cosmetics->'board_skins' @> to_jsonb(p_item_id)) THEN
        RAISE EXCEPTION 'You do not own this board skin';
      END IF;
      UPDATE profiles
        SET equipped = jsonb_set(equipped, '{board_skin}', to_jsonb(v_item.value))
        WHERE id = v_uid;

    ELSE
      RAISE EXCEPTION 'Only badge and board_skin items can be equipped';
  END CASE;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── G. swap_card_square RPC ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.swap_card_square(p_room_id uuid, p_square_index int)
RETURNS SETOF public.cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid         uuid;
  v_room        public.rooms;
  v_card        public.cards;
  v_current_sq  jsonb;
  v_players     jsonb;
  v_player_count int;
  v_stat_types  text[] := ARRAY[
    'points_10','points_15','points_20','points_25',
    'rebound_5','rebound_10','assist_5','assist_10',
    'three_pointer','steal','block'
  ];
  v_player      jsonb;
  v_stat_type   text;
  v_threshold   int;
  v_display     text;
  v_new_sq      jsonb;
  v_new_squares jsonb;
  v_player_id   text;
  v_player_name text;
  v_player_last text;
  v_current_combo text;
  v_new_combo   text;
  v_attempts    int := 0;
  i             int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Validate index
  IF p_square_index < 0 OR p_square_index > 24 THEN
    RAISE EXCEPTION 'Square index must be between 0 and 24';
  END IF;
  IF p_square_index = 12 THEN
    RAISE EXCEPTION 'Cannot swap the FREE center square';
  END IF;

  -- Validate room is in lobby
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'lobby' THEN
    RAISE EXCEPTION 'Card swaps are only allowed while the game is in lobby';
  END IF;

  -- Fetch the card
  SELECT * INTO v_card FROM cards WHERE room_id = p_room_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found for this room'; END IF;

  -- Validate balance before generating (avoid wasted work)
  PERFORM 1 FROM profiles WHERE id = v_uid AND dabs_balance >= 5 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not enough Dabs (need 5)'; END IF;

  -- Current square combo to avoid
  v_current_sq    := v_card.squares->p_square_index;
  v_current_combo := (v_current_sq->>'player_id') || ':' || (v_current_sq->>'stat_type');

  -- Build unique players list from existing card squares (exclude FREE)
  SELECT jsonb_agg(DISTINCT jsonb_build_object('id', sq->>'player_id', 'name', sq->>'player_name'))
    INTO v_players
  FROM jsonb_array_elements(v_card.squares) sq
  WHERE (sq->>'stat_type') != 'free' AND (sq->>'player_id') IS NOT NULL;

  v_player_count := jsonb_array_length(v_players);
  IF v_player_count = 0 THEN RAISE EXCEPTION 'No players found on card'; END IF;

  -- Generate new (player, stat_type) different from current
  LOOP
    v_player    := v_players->( floor(random() * v_player_count)::int );
    v_stat_type := v_stat_types[ 1 + floor(random() * 11)::int ];
    v_new_combo := (v_player->>'id') || ':' || v_stat_type;
    v_attempts  := v_attempts + 1;
    EXIT WHEN v_new_combo != v_current_combo OR v_attempts > 50;
  END LOOP;

  v_player_id   := v_player->>'id';
  v_player_name := v_player->>'name';
  -- Extract last name
  v_player_last := CASE
    WHEN v_player_name LIKE '% %'
    THEN SUBSTRING(v_player_name FROM POSITION(' ' IN v_player_name) + 1)
    ELSE v_player_name
  END;

  -- Build display text (mirrors generate_card_for_room logic)
  IF v_stat_type LIKE 'points!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 8)::int;
    v_display   := v_player_last || ' ' || v_threshold || '+ PTS';
  ELSIF v_stat_type LIKE 'rebound!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 9)::int;
    v_display   := v_player_last || ' ' || v_threshold || '+ REB';
  ELSIF v_stat_type LIKE 'assist!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 8)::int;
    v_display   := v_player_last || ' ' || v_threshold || '+ AST';
  ELSIF v_stat_type = 'three_pointer' THEN
    v_threshold := 1; v_display := v_player_last || ' 1+ 3PM';
  ELSIF v_stat_type = 'steal' THEN
    v_threshold := 1; v_display := v_player_last || ' 1+ STL';
  ELSIF v_stat_type = 'block' THEN
    v_threshold := 1; v_display := v_player_last || ' 1+ BLK';
  ELSE
    v_threshold := 1; v_display := v_player_last || ' ' || v_stat_type;
  END IF;

  -- Build replacement square (preserve existing id)
  v_new_sq := jsonb_build_object(
    'id',           v_current_sq->>'id',
    'player_id',    v_player_id,
    'player_name',  v_player_name,
    'stat_type',    v_stat_type,
    'threshold',    v_threshold,
    'display_text', v_display,
    'marked',       false
  );

  -- Rebuild squares array with replacement
  v_new_squares := '[]'::jsonb;
  FOR i IN 0..24 LOOP
    IF i = p_square_index THEN
      v_new_squares := v_new_squares || v_new_sq;
    ELSE
      v_new_squares := v_new_squares || (v_card.squares->i);
    END IF;
  END LOOP;

  -- Persist
  UPDATE cards SET squares = v_new_squares WHERE id = v_card.id;

  -- Deduct Dabs
  UPDATE profiles SET dabs_balance = dabs_balance - 5 WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
    VALUES (v_uid, -5, 'card_swap', p_room_id);

  RETURN QUERY SELECT * FROM cards WHERE id = v_card.id;
END;
$$;
