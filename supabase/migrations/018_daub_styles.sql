-- =============================================================================
-- 018: Daub styles cosmetic system + new board skins
-- Paste into Supabase SQL Editor and execute.
-- =============================================================================

-- ── 1. Add daub_style column to profiles ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daub_style text NOT NULL DEFAULT 'classic';

-- ── 2. Expand store_items category constraint ──────────────────────────────────
ALTER TABLE public.store_items DROP CONSTRAINT IF EXISTS store_items_category_check;
ALTER TABLE public.store_items ADD CONSTRAINT store_items_category_check
  CHECK (category IN ('name_color', 'name_font', 'badge', 'board_skin', 'chat_emote', 'daub_style'));

-- ── 3. Seed daub style items ───────────────────────────────────────────────────
INSERT INTO public.store_items (id, category, name, description, price, metadata, is_active, sort_order) VALUES
  ('daub_classic',     'daub_style', 'Classic',     'The original checkmark',         0,   '{"style":"classic"}',     true, 500),
  ('daub_stamp',       'daub_style', 'Stamp',       'Bold circular stamp overlay',    75,  '{"style":"stamp"}',       true, 501),
  ('daub_x',           'daub_style', 'X Mark',      'Slashed with an X',              75,  '{"style":"x"}',           true, 502),
  ('daub_star',        'daub_style', 'Star',        'Gold star overlay',              100, '{"style":"star"}',        true, 503),
  ('daub_splatter',    'daub_style', 'Splatter',    'Paint splatter daub',            150, '{"style":"splatter"}',    true, 504),
  ('daub_fire',        'daub_style', 'Ablaze',      'Square burns when marked',       200, '{"style":"fire"}',        true, 505),
  ('daub_lightning',   'daub_style', 'Lightning',   'Electric crack across square',   200, '{"style":"lightning"}',   true, 506),
  ('daub_fingerprint', 'daub_style', 'Fingerprint', 'Smudged thumbprint',             100, '{"style":"fingerprint"}', true, 507)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;

-- ── 4. Deactivate old similar board skins ─────────────────────────────────────
UPDATE public.store_items SET is_active = false
WHERE id IN ('skin_retro', 'skin_matrix', 'skin_fire', 'skin_stealth', 'skin_inferno');

-- ── 5. Insert new distinct board skins ────────────────────────────────────────
INSERT INTO public.store_items (id, category, name, description, price, metadata, is_active, sort_order) VALUES
  ('skin_terminal',   'board_skin', 'Terminal',     'Green-on-black hacker mode',    200, '{"class":"terminal"}',   true, 210),
  ('skin_courtside',  'board_skin', 'Courtside',    'Hardwood floor, chalk circles', 250, '{"class":"courtside"}',  true, 211),
  ('skin_scoreboard', 'board_skin', 'Jumbotron',    'LED display, red glow text',    200, '{"class":"scoreboard"}', true, 212),
  ('skin_scratch',    'board_skin', 'Scratch Card', 'Lottery ticket with reveals',   250, '{"class":"scratch"}',    true, 213)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;

-- ── 6. Update equip_store_item RPC to handle daub_style ───────────────────────
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
    WHEN 'daub_style' THEN
      UPDATE profiles SET daub_style = COALESCE(v_item.metadata->>'style', 'classic') WHERE id = v_uid;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'not_equippable');
  END CASE;

  RETURN jsonb_build_object('success', true, 'equipped', p_item_id, 'category', v_item.category);
END;
$$;
