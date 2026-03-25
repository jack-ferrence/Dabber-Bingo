-- =============================================================================
-- 008: Full-sync migration — safe to run on any database state.
-- Brings any existing project fully up to date with all migrations (002–007).
-- Every statement is idempotent. Run this in the Supabase SQL Editor.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES — ensure all columns exist
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: columns added across 003, 005, 006
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dabs_balance   int     NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cosmetics      jsonb   NOT NULL DEFAULT '{"badges":[],"board_skins":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS equipped       jsonb   NOT NULL DEFAULT '{"badge":null,"board_skin":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS equipped_badge text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS board_skin     text    DEFAULT 'default';

-- Remove overly-restrictive name_color check so hex values from the store work.
-- (The original check only allowed #RRGGBB; store items are valid hex already.)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_name_color_check;

-- rooms: sport column added in 002
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba'
  CHECK (sport IN ('nba', 'ncaa'));

-- rooms: odds columns added in 012, game status columns added in 013
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS odds_pool          jsonb       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odds_updated_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odds_status        text        DEFAULT 'pending'
    CHECK (odds_status IN ('pending', 'ready', 'insufficient')),
  ADD COLUMN IF NOT EXISTS oddsapi_event_id   text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS game_period        int         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_clock         text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_score         int         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_score         int         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_status_detail text        DEFAULT NULL;

-- cards: swap_count added in 007
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS swap_count int NOT NULL DEFAULT 0;

-- dabs_transactions: created in 003
CREATE TABLE IF NOT EXISTS public.dabs_transactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     int         NOT NULL,
  reason     text        NOT NULL,
  room_id    uuid        REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- store_items: created in 005, expanded in 006 + 007
CREATE TABLE IF NOT EXISTS public.store_items (
  id          text PRIMARY KEY,
  category    text NOT NULL,
  label       text,
  cost        int,
  value       text,
  preview     text,
  sort_order  int  NOT NULL DEFAULT 0,
  name        text,
  description text,
  price       int,
  metadata    jsonb        DEFAULT '{}'::jsonb,
  is_active   boolean      DEFAULT true,
  created_at  timestamptz  DEFAULT now()
);

-- Drop old category constraint and replace with the 007 version (adds chat_emote)
ALTER TABLE public.store_items DROP CONSTRAINT IF EXISTS store_items_category_check;
ALTER TABLE public.store_items ADD CONSTRAINT store_items_category_check
  CHECK (category IN ('name_color', 'name_font', 'badge', 'board_skin', 'chat_emote'));

-- user_inventory: created in 006
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id      text        NOT NULL REFERENCES public.store_items(id),
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dabs_transactions_user
  ON public.dabs_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user
  ON public.user_inventory(user_id);

-- Rebuild the rooms unique index to include sport (002)
DROP INDEX IF EXISTS idx_rooms_one_public_per_game;
CREATE UNIQUE INDEX idx_rooms_one_public_per_game
  ON public.rooms (game_id, sport)
  WHERE room_type = 'public' AND status != 'finished';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dabs_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dabs_select_own"        ON public.dabs_transactions;
DROP POLICY IF EXISTS "store_items_public_read" ON public.store_items;
DROP POLICY IF EXISTS "inventory_select_own"    ON public.user_inventory;

CREATE POLICY "dabs_select_own"
  ON public.dabs_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "store_items_public_read"
  ON public.store_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_select_own"
  ON public.user_inventory FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dabs_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inventory;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORE ITEMS SEED — full catalog, upsert-safe
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.store_items (id, category, name, description, price, metadata, is_active, sort_order) VALUES
  -- Name Colors
  ('color_orange',   'name_color', 'Blaze Orange',   'The Dabber signature',       50,  '{"hex":"#ff6b35"}', true, 1),
  ('color_gold',     'name_color', 'Gold Rush',      'Winner winner',              50,  '{"hex":"#f59e0b"}', true, 2),
  ('color_emerald',  'name_color', 'Emerald',        'Cool and collected',         50,  '{"hex":"#22c55e"}', true, 3),
  ('color_ice_blue', 'name_color', 'Ice Blue',       'Frost bite',                 50,  '{"hex":"#3b82f6"}', true, 4),
  ('color_purple',   'name_color', 'Royal Purple',   'Crown energy',               50,  '{"hex":"#8b5cf6"}', true, 5),
  ('color_hot_pink', 'name_color', 'Hot Pink',       'Stand out from the crowd',   50,  '{"hex":"#ec4899"}', true, 6),
  ('color_crimson',  'name_color', 'Crimson',        'Blood red intensity',        50,  '{"hex":"#dc2626"}', true, 7),
  ('color_white',    'name_color', 'Clean White',    'Back to basics',             25,  '{"hex":"#f0f0ff"}', true, 8),
  ('color_cyan',     'name_color', 'Cyan',           'Digital ice',                50,  '{"hex":"#06b6d4"}', true, 9),
  ('color_lime',     'name_color', 'Lime',           'Electric green',             50,  '{"hex":"#84cc16"}', true, 10),
  ('color_rose',     'name_color', 'Rose Gold',      'Elegant flex',               75,  '{"hex":"#f43f5e"}', true, 11),
  ('color_amber',    'name_color', 'Amber Alert',    'Warning: dripping',          50,  '{"hex":"#f59e0b"}', true, 12),
  ('color_indigo',   'name_color', 'Indigo',         'Deep space',                 75,  '{"hex":"#6366f1"}', true, 13),
  ('color_teal',     'name_color', 'Teal',           'Ocean floor',                50,  '{"hex":"#14b8a6"}', true, 14),
  ('color_rainbow',  'name_color', 'Rainbow',        'Shifts every game',         200,  '{"hex":"rainbow"}', true, 15),
  -- Name Fonts
  ('font_mono',      'name_font',  'Monospace',  'The default arcade look',        25,  '{"font":"mono"}',    true, 1),
  ('font_display',   'name_font',  'Display',    'Bold and blocky headlines',      75,  '{"font":"display"}', true, 2),
  ('font_serif',     'name_font',  'Serif',      'Old-school newspaper type',      75,  '{"font":"serif"}',   true, 3),
  ('font_rounded',   'name_font',  'Rounded',    'Smooth and friendly',            75,  '{"font":"rounded"}', true, 4),
  -- Badges
  ('badge_flame',    'badge', 'On Fire',        'For hot streaks',            100, '{"emoji":"🔥","label":"ON FIRE"}',   true, 1),
  ('badge_crown',    'badge', 'Champion',       'First place finisher',       150, '{"emoji":"👑","label":"CHAMP"}',     true, 2),
  ('badge_lightning','badge', 'Lightning',      'Speed demon',                100, '{"emoji":"⚡","label":"FAST"}',      true, 3),
  ('badge_diamond',  'badge', 'Diamond Hands',  'Never gives up',             200, '{"emoji":"💎","label":"DIAMOND"}',   true, 4),
  ('badge_ghost',    'badge', 'Ghost',          'Silent but deadly',          100, '{"emoji":"👻","label":"GHOST"}',     true, 5),
  ('badge_rocket',   'badge', 'Rocket',         'To the moon',                100, '{"emoji":"🚀","label":"LAUNCH"}',    true, 6),
  ('badge_skull',    'badge', 'Skull',          'Fear the reaper',            150, '{"emoji":"💀","label":"SKULL"}',     true, 7),
  ('badge_star',     'badge', 'All-Star',       'MVP vibes',                  200, '{"emoji":"⭐","label":"ALL-STAR"}',  true, 8),
  ('badge_100',      'badge', '100',            'Keep it 💯',                 100, '{"emoji":"💯","label":"100"}',       true, 9),
  ('badge_money',    'badge', 'Money',          'Cash money',                 150, '{"emoji":"💰","label":"MONEY"}',     true, 10),
  ('badge_eyes',     'badge', 'Eyes',           'Always watching',            100, '{"emoji":"👀","label":"EYES"}',      true, 11),
  ('badge_goat2',    'badge', 'GOAT',           'Greatest of all time',       250, '{"emoji":"🐐","label":"GOAT"}',      true, 12),
  ('badge_ice',      'badge', 'Ice Cold',       'Clutch performer',           150, '{"emoji":"🧊","label":"ICE"}',       true, 13),
  ('badge_alien',    'badge', 'Alien',          'Out of this world',          100, '{"emoji":"👽","label":"ALIEN"}',     true, 14),
  ('badge_clown',    'badge', 'Clown',          'Class clown energy',          75, '{"emoji":"🤡","label":"CLOWN"}',     true, 15),
  -- Board Skins
  ('skin_default',   'board_skin', 'Default',      'Standard arcade grid',           0,  '{"class":"default"}',    true, 1),
  ('skin_neon',      'board_skin', 'Neon Glow',    'Electric borders that pulse',   150, '{"class":"neon"}',       true, 2),
  ('skin_retro',     'board_skin', 'Retro CRT',    'Scanlines and phosphor glow',   150, '{"class":"retro"}',      true, 3),
  ('skin_minimal',   'board_skin', 'Minimal',      'Thin lines, lots of space',     100, '{"class":"minimal"}',    true, 4),
  ('skin_gold',      'board_skin', 'Gold Edition', 'Luxury gold borders',           200, '{"class":"gold"}',       true, 5),
  ('skin_matrix',    'board_skin', 'Matrix',       'Green rain code',               200, '{"class":"matrix"}',     true, 6),
  ('skin_blueprint', 'board_skin', 'Blueprint',    'Technical drawing',             150, '{"class":"blueprint"}',  true, 7),
  ('skin_fire',      'board_skin', 'On Fire',      'Flames on marked',              250, '{"class":"fire"}',       true, 8),
  -- Chat Emotes
  ('emote_dab',    'chat_emote', 'Dab',      'The signature move',  25, '{"emote":"🫳","code":":dab:"}',    true, 1),
  ('emote_bingo',  'chat_emote', 'Bingo!',   'Celebrate a line',    25, '{"emote":"🎯","code":":bingo:"}',  true, 2),
  ('emote_sweat',  'chat_emote', 'Sweating', 'Close call',          25, '{"emote":"😰","code":":sweat:"}',  true, 3),
  ('emote_gg',     'chat_emote', 'GG',       'Good game',           25, '{"emote":"🤝","code":":gg:"}',     true, 4),
  ('emote_copium', 'chat_emote', 'Copium',   'Coping hard',         50, '{"emote":"🫠","code":":cope:"}',   true, 5),
  ('emote_nuke',   'chat_emote', 'Nuke',     'Board is nuked',      50, '{"emote":"☢️","code":":nuke:"}',  true, 6)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  price       = EXCLUDED.price,
  metadata    = EXCLUDED.metadata,
  is_active   = EXCLUDED.is_active,
  sort_order  = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old swap_card_square signatures before replacing.
-- The 005 version returned SETOF cards (incompatible return type),
-- so CREATE OR REPLACE would fail without dropping it first.
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, int);
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, int, jsonb);

-- award_game_dabs (003)
CREATE OR REPLACE FUNCTION public.award_game_dabs(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card          RECORD;
  v_position_bonus int;
  v_square_dabs   int;
  v_line_dabs     int;
  v_participation int := 3;
  v_total         int;
  v_awarded       int := 0;
  v_already       boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM dabs_transactions WHERE room_id = p_room_id LIMIT 1
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_awarded');
  END IF;

  FOR v_card IN
    SELECT c.user_id, c.lines_completed, c.squares_marked,
      ROW_NUMBER() OVER (
        ORDER BY c.lines_completed DESC, c.squares_marked DESC, c.created_at ASC
      ) AS rank
    FROM public.cards c WHERE c.room_id = p_room_id
  LOOP
    v_position_bonus := CASE v_card.rank
      WHEN 1 THEN 100 WHEN 2 THEN 60 WHEN 3 THEN 40
      WHEN 4 THEN 25  WHEN 5 THEN 15
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

    UPDATE public.profiles SET dabs_balance = dabs_balance + v_total WHERE id = v_card.user_id;
    v_awarded := v_awarded + 1;
  END LOOP;

  RETURN jsonb_build_object('awarded', v_awarded, 'room_id', p_room_id);
END;
$$;

-- deduct_entry_fee (004, fixed in 014)
CREATE OR REPLACE FUNCTION public.deduct_entry_fee(p_user_id uuid, p_room_id uuid, p_amount int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance         int;
  v_room_sport      text;
  v_already_charged boolean;
BEGIN
  -- Idempotency: check dabs_transactions (not room_participants — participant row
  -- is inserted before navigation, so room_participants check always skipped the fee)
  SELECT EXISTS(
    SELECT 1 FROM dabs_transactions
    WHERE user_id = p_user_id
      AND room_id  = p_room_id
      AND reason   = 'entry_fee'
  ) INTO v_already_charged;
  IF v_already_charged THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'already_charged');
  END IF;

  SELECT sport INTO v_room_sport FROM rooms WHERE id = p_room_id;
  IF v_room_sport = 'ncaa' THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'march_madness_free');
  END IF;

  SELECT dabs_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_not_found');
  END IF;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_dabs', 'balance', v_balance, 'cost', p_amount);
  END IF;

  UPDATE profiles SET dabs_balance = dabs_balance - p_amount WHERE id = p_user_id;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
  VALUES (p_user_id, -p_amount, 'entry_fee', p_room_id);

  RETURN jsonb_build_object('success', true, 'charged', p_amount, 'new_balance', v_balance - p_amount);
END;
$$;

-- purchase_store_item (006)
CREATE OR REPLACE FUNCTION public.purchase_store_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid           uuid;
  v_item          store_items;
  v_balance       int;
  v_already_owned boolean;
  v_price         int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = p_item_id AND is_active = true;
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  v_price := COALESCE(v_item.price, v_item.cost, 0);
  IF v_price = 0 THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'free_item');
  END IF;

  SELECT EXISTS(SELECT 1 FROM user_inventory WHERE user_id = v_uid AND item_id = p_item_id)
    INTO v_already_owned;
  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_owned');
  END IF;

  SELECT dabs_balance INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_dabs', 'balance', v_balance, 'cost', v_price);
  END IF;

  UPDATE profiles SET dabs_balance = dabs_balance - v_price WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
    VALUES (v_uid, -v_price, 'store_purchase:' || p_item_id, NULL);
  INSERT INTO user_inventory (user_id, item_id) VALUES (v_uid, p_item_id);

  RETURN jsonb_build_object(
    'success', true, 'charged', v_price,
    'item_id', p_item_id, 'new_balance', v_balance - v_price
  );
END;
$$;

-- equip_store_item (006)
CREATE OR REPLACE FUNCTION public.equip_store_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid;
  v_item  store_items;
  v_owned boolean;
  v_price int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_item FROM store_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'item_not_found');
  END IF;

  v_price := COALESCE(v_item.price, v_item.cost, 0);
  IF v_price > 0 THEN
    SELECT EXISTS(SELECT 1 FROM user_inventory WHERE user_id = v_uid AND item_id = p_item_id)
      INTO v_owned;
    IF NOT v_owned THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_owned');
    END IF;
  END IF;

  CASE v_item.category
    WHEN 'name_color' THEN
      UPDATE profiles SET name_color = COALESCE(v_item.metadata->>'hex', v_item.value) WHERE id = v_uid;
    WHEN 'name_font' THEN
      UPDATE profiles SET name_font = COALESCE(v_item.metadata->>'font', v_item.value) WHERE id = v_uid;
    WHEN 'badge' THEN
      UPDATE profiles SET equipped_badge = p_item_id WHERE id = v_uid;
    WHEN 'board_skin' THEN
      UPDATE profiles SET board_skin = COALESCE(v_item.metadata->>'class', v_item.value) WHERE id = v_uid;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'not_equippable');
  END CASE;

  RETURN jsonb_build_object('success', true, 'equipped', p_item_id, 'category', v_item.category);
END;
$$;

-- unequip_badge (006)
CREATE OR REPLACE FUNCTION public.unequip_badge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET equipped_badge = NULL WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- swap_card_square (007 — tiered pricing, max 2 swaps)
CREATE OR REPLACE FUNCTION public.swap_card_square(
  p_room_id      uuid,
  p_square_index int,
  p_roster       jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid;
  v_room         rooms;
  v_card         cards;
  v_balance      int;
  v_squares      jsonb;
  v_old_square   jsonb;
  v_new_square   jsonb;
  v_player       jsonb;
  v_stat_type    text;
  v_stat_types   text[] := ARRAY[
    'points_10','points_15','points_20','points_25',
    'three_pointer','rebound_5','rebound_10','assist_5','assist_10','steal','block'
  ];
  v_threshold    int;
  v_display      text;
  v_player_count int;
  v_attempts     int := 0;
  v_existing_key text;
  v_new_key      text;
  v_swap_count   int;
  v_swap_cost    int;
  v_player_name  text;
  v_player_last  text;
  i              int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF p_square_index < 0 OR p_square_index > 24 OR p_square_index = 12 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_square_index');
  END IF;

  SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'room_not_found');
  END IF;
  IF v_room.status != 'lobby' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'game_already_started');
  END IF;

  SELECT * INTO v_card FROM cards WHERE room_id = p_room_id AND user_id = v_uid;
  IF v_card.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_card_found');
  END IF;

  v_swap_count := COALESCE(v_card.swap_count, 0);
  IF v_swap_count >= 2 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'max_swaps_reached', 'swap_count', v_swap_count);
  END IF;
  v_swap_cost := CASE WHEN v_swap_count = 0 THEN 10 ELSE 50 END;

  SELECT dabs_balance INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_swap_cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_dabs', 'balance', v_balance, 'cost', v_swap_cost);
  END IF;

  v_squares      := v_card.squares;
  v_old_square   := v_squares->p_square_index;
  v_existing_key := (v_old_square->>'player_id') || ':' || (v_old_square->>'stat_type');

  IF p_roster IS NULL OR jsonb_array_length(p_roster) = 0 THEN
    SELECT jsonb_agg(DISTINCT jsonb_build_object('id', sq->>'player_id', 'name', sq->>'player_name'))
      INTO p_roster
    FROM jsonb_array_elements(v_squares) sq
    WHERE (sq->>'stat_type') != 'free' AND (sq->>'player_id') IS NOT NULL;
  END IF;

  v_player_count := COALESCE(jsonb_array_length(p_roster), 0);
  IF v_player_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_roster_available');
  END IF;

  LOOP
    v_attempts  := v_attempts + 1;
    v_player    := p_roster->(floor(random() * v_player_count)::int);
    v_stat_type := v_stat_types[1 + floor(random() * array_length(v_stat_types, 1))::int];
    v_new_key   := (v_player->>'id') || ':' || v_stat_type;
    EXIT WHEN v_new_key != v_existing_key OR v_attempts >= 20;
  END LOOP;

  v_player_name := v_player->>'name';
  v_player_last := CASE WHEN v_player_name LIKE '% %'
    THEN SUBSTRING(v_player_name FROM POSITION(' ' IN v_player_name) + 1)
    ELSE v_player_name END;

  IF    v_stat_type LIKE 'points!_%'  ESCAPE '!' THEN v_threshold := SUBSTRING(v_stat_type FROM 8)::int;  v_display := v_player_last || ' ' || v_threshold || '+ PTS';
  ELSIF v_stat_type LIKE 'rebound!_%' ESCAPE '!' THEN v_threshold := SUBSTRING(v_stat_type FROM 9)::int;  v_display := v_player_last || ' ' || v_threshold || '+ REB';
  ELSIF v_stat_type LIKE 'assist!_%'  ESCAPE '!' THEN v_threshold := SUBSTRING(v_stat_type FROM 8)::int;  v_display := v_player_last || ' ' || v_threshold || '+ AST';
  ELSIF v_stat_type = 'three_pointer' THEN v_threshold := 1; v_display := v_player_last || ' 1+ 3PM';
  ELSIF v_stat_type = 'steal'         THEN v_threshold := 1; v_display := v_player_last || ' 1+ STL';
  ELSIF v_stat_type = 'block'         THEN v_threshold := 1; v_display := v_player_last || ' 1+ BLK';
  ELSE                                     v_threshold := 1; v_display := v_player_last || ' ' || v_stat_type;
  END IF;

  v_new_square := jsonb_build_object(
    'id',           v_old_square->>'id',
    'player_id',    v_player->>'id',
    'player_name',  v_player_name,
    'stat_type',    v_stat_type,
    'threshold',    v_threshold,
    'display_text', v_display,
    'marked',       false
  );

  v_squares := '[]'::jsonb;
  FOR i IN 0..24 LOOP
    IF i = p_square_index THEN v_squares := v_squares || v_new_square;
    ELSE v_squares := v_squares || (v_card.squares->i); END IF;
  END LOOP;

  UPDATE cards SET squares = v_squares, swap_count = v_swap_count + 1 WHERE id = v_card.id;
  UPDATE profiles SET dabs_balance = dabs_balance - v_swap_cost WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
    VALUES (v_uid, -v_swap_cost, 'card_swap', p_room_id);

  RETURN jsonb_build_object(
    'success',      true,
    'charged',      v_swap_cost,
    'new_balance',  v_balance - v_swap_cost,
    'swap_count',   v_swap_count + 1,
    'old_square',   v_old_square,
    'new_square',   v_new_square,
    'square_index', p_square_index
  );
END;
$$;
