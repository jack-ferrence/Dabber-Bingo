-- =============================================================================
-- Cowbell — FRESH MIGRATION (run once on a brand-new Supabase project)
-- Paste this entire file into the Supabase SQL Editor and execute.
-- =============================================================================

-- 001: Extensions
create extension if not exists "pgcrypto";

-- =============================================================================
-- TABLES
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id),
  username text unique not null,
  is_supporter boolean default false,
  supporter_since timestamptz,
  name_color text default '#FFFFFF',
  name_font text default 'default',
  ui_theme text default 'default',
  username_changes_remaining int default 0,
  user_theme text default 'challenger',
  dabs_balance int not null default 100,
  created_at timestamptz default now(),
  constraint profiles_name_font_check check (
    name_font in ('default','mono','display','serif','rounded')
  ),
  constraint profiles_ui_theme_check check (
    ui_theme in ('default','midnight','crimson','ocean','emerald')
  ),
  constraint profiles_name_color_check check (
    name_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_id text not null,
  sport text not null default 'nba' check (sport in ('nba', 'ncaa')),
  status text default 'lobby' check (status in ('lobby', 'live', 'finished')),
  created_at timestamptz default now(),
  starts_at timestamptz,
  room_theme text default null,
  room_type text not null default 'private' check (room_type in ('public', 'private'))
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references public.profiles (id),
  squares jsonb not null,
  lines_completed int default 0,
  squares_marked int default 0,
  created_at timestamptz default now(),
  unique (room_id, user_id)
);

create table if not exists public.stat_events (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  player_id text not null,
  stat_type text not null,
  value numeric not null,
  period int,
  fired_at timestamptz default now(),
  unique (game_id, player_id, stat_type, value, period)
);

create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references public.profiles (id),
  joined_at timestamptz default now(),
  unique (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  message text not null check (char_length(message) <= 280),
  created_at timestamptz default now()
);

create table if not exists public.polling_locks (
  lock_key text primary key,
  locked_at timestamptz not null default now(),
  locked_by text
);

-- =============================================================================
-- INDEXES
-- =============================================================================

create index if not exists idx_stat_events_game_player on public.stat_events (game_id, player_id);
create index if not exists idx_cards_room on public.cards (room_id);
create index if not exists idx_cards_room_user on public.cards (room_id, user_id);
create index if not exists idx_room_participants_room on public.room_participants (room_id);
create index if not exists idx_chat_messages_room_time on public.chat_messages (room_id, created_at desc);

-- At most one active public room per game per sport
create unique index if not exists idx_rooms_one_public_per_game
  on public.rooms (game_id, sport)
  where room_type = 'public' and status != 'finished';

-- =============================================================================
-- VIEW
-- =============================================================================

create or replace view public.rooms_with_counts as
select r.*, coalesce(rp.cnt, 0) as participant_count
from public.rooms r
left join (
  select room_id, count(*)::int as cnt
  from public.room_participants
  group by room_id
) rp on rp.room_id = r.id;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.cards enable row level security;
alter table public.stat_events enable row level security;
alter table public.room_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.polling_locks enable row level security;
-- polling_locks: no policies = service-role only access

-- profiles
create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- rooms
create policy "rooms_select_all" on public.rooms for select to authenticated using (true);

-- cards (leaderboard-aware: can read all cards in rooms you've joined)
create policy "cards_select_same_room" on public.cards for select to authenticated
  using (
    room_id in (
      select rp.room_id from public.room_participants rp where rp.user_id = auth.uid()
    )
  );
create policy "cards_insert_own" on public.cards for insert to authenticated with check (user_id = auth.uid());
create policy "cards_update_own" on public.cards for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cards_delete_own" on public.cards for delete to authenticated using (user_id = auth.uid());

-- room_participants
create policy "room_participants_select_all" on public.room_participants for select to authenticated using (true);
create policy "room_participants_insert_self" on public.room_participants for insert to authenticated with check (user_id = auth.uid());

-- stat_events
create policy "stat_events_select_all" on public.stat_events for select to authenticated using (true);

-- chat_messages (only room participants can read/write)
create policy "chat_select_participants" on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.room_participants rp
      where rp.room_id = chat_messages.room_id
      and rp.user_id = auth.uid()
    )
  );
create policy "chat_insert_participants" on public.chat_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.room_participants rp
      where rp.room_id = chat_messages.room_id
      and rp.user_id = auth.uid()
    )
  );

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- ── check_bingo_lines ────────────────────────────────────────────────────────
create or replace function public.check_bingo_lines(squares jsonb)
returns int language plpgsql immutable as $$
declare
  r int; c int; idx int;
  line_count int := 0;
  all_marked boolean;
begin
  if squares is null or jsonb_array_length(squares) < 25 then return 0; end if;

  -- rows
  for r in 0..4 loop
    all_marked := true;
    for c in 0..4 loop
      if (squares->(r*5+c)->>'marked') is distinct from 'true' then all_marked := false; exit; end if;
    end loop;
    if all_marked then line_count := line_count + 1; end if;
  end loop;

  -- columns
  for c in 0..4 loop
    all_marked := true;
    for r in 0..4 loop
      if (squares->(r*5+c)->>'marked') is distinct from 'true' then all_marked := false; exit; end if;
    end loop;
    if all_marked then line_count := line_count + 1; end if;
  end loop;

  -- main diagonal (0,6,12,18,24)
  all_marked := true;
  for idx in 0..4 loop
    if (squares->(idx*6)->>'marked') is distinct from 'true' then all_marked := false; exit; end if;
  end loop;
  if all_marked then line_count := line_count + 1; end if;

  -- anti-diagonal (4,8,12,16,20)
  all_marked := true;
  for idx in 0..4 loop
    if (squares->(4 + idx*4)->>'marked') is distinct from 'true' then all_marked := false; exit; end if;
  end loop;
  if all_marked then line_count := line_count + 1; end if;

  return line_count;
end; $$;

-- ── mark_squares_for_event ───────────────────────────────────────────────────
create or replace function public.mark_squares_for_event(p_game_id text, p_stat_event jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  rec record;
  new_squares jsonb; sq jsonb;
  i int;
  event_player_id text; event_stat_type text; event_value numeric;
  marked_count int; lines_count int; cards_updated int := 0;
begin
  event_player_id := p_stat_event->>'player_id';
  event_stat_type := p_stat_event->>'stat_type';
  event_value     := (p_stat_event->>'value')::numeric;

  if event_player_id is null or event_stat_type is null or event_value is null then
    return 0;
  end if;

  for rec in
    select c.id as card_id, c.squares
    from public.cards c
    join public.rooms r on r.id = c.room_id
    where r.game_id = p_game_id and r.status = 'live'
  loop
    new_squares := '[]'::jsonb;
    for i in 0..24 loop
      sq := rec.squares->i;
      if sq is not null
         and (sq->>'player_id') = event_player_id
         and (sq->>'stat_type') = event_stat_type
         and (sq->>'marked') is distinct from 'true'
         and event_value >= coalesce((sq->>'threshold')::numeric, 0)
      then
        sq := jsonb_set(sq, '{marked}', 'true'::jsonb);
      end if;
      new_squares := new_squares || sq;
    end loop;

    select count(*)::int into marked_count
    from jsonb_array_elements(new_squares) e
    where (e->>'marked') = 'true';

    lines_count := public.check_bingo_lines(new_squares);

    update public.cards
    set squares = new_squares, squares_marked = marked_count, lines_completed = lines_count
    where id = rec.card_id;

    cards_updated := cards_updated + 1;
  end loop;

  return cards_updated;
end; $$;

-- ── generate_card_for_room ───────────────────────────────────────────────────
create or replace function public.generate_card_for_room(p_room_id uuid, p_players jsonb default null)
returns setof public.cards language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_room_exists boolean;
  v_existing public.cards;
  v_players jsonb;
  v_player_count int;
  v_stat_types text[] := array['points_10','points_15','points_20','points_25','three_pointer','rebound_5','rebound_10','assist_5','assist_10','steal','block'];
  v_sq jsonb; v_free jsonb;
  v_flat jsonb := '[]'::jsonb;
  v_24 jsonb := '[]'::jsonb;
  i int; p_idx int; s_idx int;
  p_id text; p_name text; p_last text; st text; v_threshold int; v_display text;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select exists(select 1 from rooms where id = p_room_id and status in ('lobby','live'))
    into v_room_exists;
  if not v_room_exists then
    raise exception 'Room not found or not joinable (status must be lobby or live)';
  end if;

  select c.* into v_existing from cards c
    where c.room_id = p_room_id and c.user_id = v_uid limit 1;
  if v_existing.id is not null then
    return next v_existing; return;
  end if;

  insert into room_participants (room_id, user_id)
    values (p_room_id, v_uid)
    on conflict (room_id, user_id) do nothing;

  -- Use provided roster or fall back to defaults
  if p_players is not null and jsonb_array_length(p_players) > 0 then
    v_players := p_players;
  else
    v_players := '[
      {"id":"2544","name":"LeBron James","lastName":"James"},
      {"id":"3975","name":"Stephen Curry","lastName":"Curry"},
      {"id":"3032977","name":"Giannis Antetokounmpo","lastName":"Antetokounmpo"},
      {"id":"3112335","name":"Nikola Jokić","lastName":"Jokić"},
      {"id":"3202","name":"Kevin Durant","lastName":"Durant"},
      {"id":"4065648","name":"Jayson Tatum","lastName":"Tatum"},
      {"id":"3945274","name":"Luka Dončić","lastName":"Dončić"},
      {"id":"3059318","name":"Joel Embiid","lastName":"Embiid"},
      {"id":"3136193","name":"Devin Booker","lastName":"Booker"},
      {"id":"3908809","name":"Donovan Mitchell","lastName":"Mitchell"}
    ]'::jsonb;
  end if;

  v_player_count := jsonb_array_length(v_players);

  for i in 0..23 loop
    p_idx  := floor(random() * v_player_count)::int;
    s_idx  := 1 + floor(random() * 11)::int;
    p_id   := v_players->p_idx->>'id';
    p_name := v_players->p_idx->>'name';
    p_last := coalesce(v_players->p_idx->>'lastName', p_name);
    st     := v_stat_types[s_idx];

    if st like 'points\_%' then
      v_threshold := coalesce((regexp_replace(st, '^points_', ''))::int, 0);
      v_display   := p_last || ' ' || v_threshold || '+ PTS';
    elsif st like 'rebound\_%' then
      v_threshold := coalesce((regexp_replace(st, '^rebound_', ''))::int, 0);
      v_display   := p_last || ' ' || v_threshold || '+ REB';
    elsif st like 'assist\_%' then
      v_threshold := coalesce((regexp_replace(st, '^assist_', ''))::int, 0);
      v_display   := p_last || ' ' || v_threshold || '+ AST';
    elsif st = 'three_pointer' then v_threshold := 1; v_display := p_last || ' 1+ 3PM';
    elsif st = 'steal'         then v_threshold := 1; v_display := p_last || ' 1+ STL';
    elsif st = 'block'         then v_threshold := 1; v_display := p_last || ' 1+ BLK';
    else v_threshold := 1; v_display := p_last || ' ' || st;
    end if;

    v_sq := jsonb_build_object(
      'id', gen_random_uuid(),
      'player_id', p_id,
      'player_name', p_name,
      'stat_type', st,
      'threshold', v_threshold,
      'display_text', v_display,
      'marked', false
    );
    v_24 := v_24 || v_sq;
  end loop;

  v_free := jsonb_build_object(
    'id', gen_random_uuid(),
    'player_id', null,
    'player_name', null,
    'stat_type', 'free',
    'threshold', 0,
    'display_text', 'FREE',
    'marked', true
  );

  -- Build flat 25-element array: first 12 squares, FREE at index 12, last 12 squares
  v_flat := '[]'::jsonb;
  for i in 0..11  loop v_flat := v_flat || (v_24->i); end loop;
  v_flat := v_flat || v_free;
  for i in 12..23 loop v_flat := v_flat || (v_24->i); end loop;

  insert into cards (room_id, user_id, squares, lines_completed, squares_marked)
    values (p_room_id, v_uid, v_flat, 0, 1)
    returning * into v_existing;

  return next v_existing;
end; $$;

-- ── acquire_polling_lock ─────────────────────────────────────────────────────
create or replace function public.acquire_polling_lock(
  p_key text,
  p_owner text default 'poll-stats',
  p_ttl_seconds int default 50
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_locked_at timestamptz;
begin
  select locked_at into v_locked_at from polling_locks where lock_key = p_key for update skip locked;

  if not found then
    insert into polling_locks (lock_key, locked_at, locked_by)
      values (p_key, now(), p_owner)
      on conflict (lock_key) do nothing;
    return true;
  end if;

  if v_locked_at < now() - (p_ttl_seconds || ' seconds')::interval then
    update polling_locks set locked_at = now(), locked_by = p_owner where lock_key = p_key;
    return true;
  end if;

  return false;
end; $$;

-- ── release_polling_lock ─────────────────────────────────────────────────────
create or replace function public.release_polling_lock(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from polling_locks where lock_key = p_key;
end; $$;

-- ── prune_chat_messages ──────────────────────────────────────────────────────
create or replace function public.prune_chat_messages()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  select count(*)::int into v_count from chat_messages where room_id = NEW.room_id;
  if v_count <= 250 then
    return NEW;
  end if;
  delete from chat_messages
  where room_id = NEW.room_id
    and id not in (
      select id from chat_messages
      where room_id = NEW.room_id
      order by created_at desc
      limit 200
    );
  return NEW;
end; $$;

drop trigger if exists trigger_prune_chat on public.chat_messages;
create trigger trigger_prune_chat
  after insert on public.chat_messages
  for each row execute function public.prune_chat_messages();

-- ── cleanup_stale_rooms ──────────────────────────────────────────────────────
create or replace function public.cleanup_stale_rooms()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  with stale as (
    select r.id
    from rooms r
    where r.status = 'live'
      and not exists (
        select 1 from stat_events se
        where se.game_id = r.game_id
          and se.fired_at > now() - interval '3 hours'
      )
  )
  update rooms set status = 'finished'
  where id in (select id from stale);

  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- ── cleanup_old_room_data ────────────────────────────────────────────────────
create or replace function public.cleanup_old_room_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_chat int; v_participants int;
begin
  delete from chat_messages
  where room_id in (
    select id from rooms
    where status = 'finished'
      and created_at < now() - interval '7 days'
  );
  get diagnostics v_chat = row_count;

  delete from room_participants
  where room_id in (
    select id from rooms
    where status = 'finished'
      and created_at < now() - interval '7 days'
  );
  get diagnostics v_participants = row_count;

  return jsonb_build_object(
    'chat_deleted', v_chat,
    'participants_deleted', v_participants
  );
end; $$;

-- ── handle_new_user (auto-create profile on signup) ──────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    NEW.id,
    coalesce(
      NEW.raw_user_meta_data->>'username',
      'Guest_' || left(NEW.id::text, 8)
    )
  )
  on conflict (id) do update
  set username = coalesce(
    excluded.username,
    profiles.username
  );

  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- REALTIME PUBLICATION
-- =============================================================================

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.stat_events;
alter publication supabase_realtime add table public.room_participants;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.dabs_transactions;

-- =============================================================================
-- 003: Dabs currency
-- =============================================================================

create table if not exists public.dabs_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null,
  reason     text not null,
  room_id    uuid references public.rooms(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_dabs_transactions_user
  on public.dabs_transactions(user_id, created_at desc);

alter table public.dabs_transactions enable row level security;

create policy "dabs_select_own"
  on public.dabs_transactions
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.award_game_dabs(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_card          record;
  v_position_bonus int;
  v_square_dabs   int;
  v_line_dabs     int;
  v_participation int := 3;
  v_total         int;
  v_awarded       int := 0;
  v_already       boolean;
begin
  select exists(
    select 1 from dabs_transactions where room_id = p_room_id limit 1
  ) into v_already;

  if v_already then
    return jsonb_build_object('skipped', true, 'reason', 'already_awarded');
  end if;

  for v_card in
    select
      c.user_id,
      c.lines_completed,
      c.squares_marked,
      row_number() over (
        order by c.lines_completed desc, c.squares_marked desc, c.created_at asc
      ) as rank
    from public.cards c
    where c.room_id = p_room_id
  loop
    v_position_bonus := case v_card.rank
      when 1 then 100
      when 2 then 60
      when 3 then 40
      when 4 then 25
      when 5 then 15
      else case when v_card.rank <= 10 then 5 else 0 end
    end;

    v_square_dabs := v_card.squares_marked * 2;
    v_line_dabs   := v_card.lines_completed * 10;
    v_total       := v_square_dabs + v_line_dabs + v_position_bonus + v_participation;

    if v_square_dabs > 0 then
      insert into dabs_transactions (user_id, amount, reason, room_id)
      values (v_card.user_id, v_square_dabs, 'squares_marked', p_room_id);
    end if;

    if v_line_dabs > 0 then
      insert into dabs_transactions (user_id, amount, reason, room_id)
      values (v_card.user_id, v_line_dabs, 'lines_completed', p_room_id);
    end if;

    if v_position_bonus > 0 then
      insert into dabs_transactions (user_id, amount, reason, room_id)
      values (v_card.user_id, v_position_bonus, 'finish_' || v_card.rank::text, p_room_id);
    end if;

    insert into dabs_transactions (user_id, amount, reason, room_id)
    values (v_card.user_id, v_participation, 'participation', p_room_id);

    update profiles
      set dabs_balance = dabs_balance + v_total
      where id = v_card.user_id;

    v_awarded := v_awarded + 1;
  end loop;

  return jsonb_build_object('awarded', v_awarded, 'room_id', p_room_id);
end;
$$;

-- =============================================================================
-- 004: Entry fee RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deduct_entry_fee(p_user_id uuid, p_room_id uuid, p_amount int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance int;
  v_room_sport text;
  v_already_joined boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM room_participants WHERE room_id = p_room_id AND user_id = p_user_id
  ) INTO v_already_joined;

  IF v_already_joined THEN
    RETURN jsonb_build_object('success', true, 'charged', 0, 'reason', 'already_joined');
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

-- =============================================================================
-- 005: Dabs Store
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cosmetics jsonb NOT NULL DEFAULT '{"badges":[],"board_skins":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS equipped  jsonb NOT NULL DEFAULT '{"badge":null,"board_skin":null}'::jsonb;

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

INSERT INTO public.store_items (id, category, label, cost, value, sort_order) VALUES
  ('color_orange', 'name_color', 'Firestarter', 50, '#ff6b35', 10),
  ('color_green',  'name_color', 'Go Mode',     50, '#22c55e', 11),
  ('color_blue',   'name_color', 'Ice Cold',    50, '#3b82f6', 12),
  ('color_purple', 'name_color', 'Royal',       50, '#8b5cf6', 13),
  ('color_red',    'name_color', 'Red Alert',   50, '#ef4444', 14),
  ('color_gold',   'name_color', 'Top Brass',   50, '#f59e0b', 15),
  ('color_teal',   'name_color', 'Deep Water',  50, '#14b8a6', 16),
  ('color_pink',   'name_color', 'Neon Sign',   50, '#ec4899', 17),
  ('font_mono',    'name_font', 'Mono',    75, 'mono',    20),
  ('font_display', 'name_font', 'Display', 75, 'display', 21),
  ('font_serif',   'name_font', 'Serif',   75, 'serif',   22),
  ('font_rounded', 'name_font', 'Rounded', 75, 'rounded', 23),
  ('badge_fire',  'badge', 'On Fire', 100, '🔥', 30),
  ('badge_goat',  'badge', 'GOAT',    150, '🐐', 31),
  ('badge_crown', 'badge', 'Crown',   200, '👑', 32),
  ('badge_zap',   'badge', 'Zapper',  100, '⚡', 33),
  ('badge_gem',   'badge', 'Gem',     150, '💎', 34),
  ('skin_neon',    'board_skin', 'Neon Grid', 150, 'neon',    40),
  ('skin_stealth', 'board_skin', 'Stealth',   150, 'stealth', 41),
  ('skin_inferno', 'board_skin', 'Inferno',   150, 'inferno', 42),
  ('card_swap', 'card_swap', 'Card Swap', 5, 'swap', 50)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_items_public_read" ON public.store_items;
CREATE POLICY "store_items_public_read" ON public.store_items FOR SELECT TO authenticated USING (true);

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
  SELECT * INTO v_item FROM store_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found: %', p_item_id; END IF;
  SELECT dabs_balance, cosmetics INTO v_balance, v_cosmetics FROM profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_balance < v_item.cost THEN
    RAISE EXCEPTION 'Insufficient Dabs: need %, have %', v_item.cost, v_balance;
  END IF;
  CASE v_item.category
    WHEN 'name_color' THEN UPDATE profiles SET name_color = v_item.value WHERE id = v_uid;
    WHEN 'name_font'  THEN UPDATE profiles SET name_font  = v_item.value WHERE id = v_uid;
    WHEN 'badge' THEN
      IF v_cosmetics->'badges' @> to_jsonb(p_item_id) THEN
        RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'category', v_item.category, 'new_balance', v_balance, 'note', 'already_owned');
      END IF;
      UPDATE profiles SET cosmetics = jsonb_set(cosmetics, '{badges}', cosmetics->'badges' || to_jsonb(p_item_id)) WHERE id = v_uid;
    WHEN 'board_skin' THEN
      IF v_cosmetics->'board_skins' @> to_jsonb(p_item_id) THEN
        RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'category', v_item.category, 'new_balance', v_balance, 'note', 'already_owned');
      END IF;
      UPDATE profiles SET cosmetics = jsonb_set(cosmetics, '{board_skins}', cosmetics->'board_skins' || to_jsonb(p_item_id)) WHERE id = v_uid;
    WHEN 'card_swap' THEN NULL;
    ELSE RAISE EXCEPTION 'Unknown category: %', v_item.category;
  END CASE;
  UPDATE profiles SET dabs_balance = dabs_balance - v_item.cost WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason) VALUES (v_uid, -v_item.cost, 'store_purchase:' || p_item_id);
  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'category', v_item.category, 'new_balance', v_balance - v_item.cost);
END; $$;

CREATE OR REPLACE FUNCTION public.equip_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_item public.store_items; v_cosmetics jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_item FROM store_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found: %', p_item_id; END IF;
  SELECT cosmetics INTO v_cosmetics FROM profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  CASE v_item.category
    WHEN 'badge' THEN
      IF NOT (v_cosmetics->'badges' @> to_jsonb(p_item_id)) THEN RAISE EXCEPTION 'You do not own this badge'; END IF;
      UPDATE profiles SET equipped = jsonb_set(equipped, '{badge}', to_jsonb(v_item.value)) WHERE id = v_uid;
    WHEN 'board_skin' THEN
      IF NOT (v_cosmetics->'board_skins' @> to_jsonb(p_item_id)) THEN RAISE EXCEPTION 'You do not own this board skin'; END IF;
      UPDATE profiles SET equipped = jsonb_set(equipped, '{board_skin}', to_jsonb(v_item.value)) WHERE id = v_uid;
    ELSE RAISE EXCEPTION 'Only badge and board_skin items can be equipped';
  END CASE;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.swap_card_square(p_room_id uuid, p_square_index int)
RETURNS SETOF public.cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_room public.rooms; v_card public.cards;
  v_current_sq jsonb; v_players jsonb; v_player_count int;
  v_stat_types text[] := ARRAY['points_10','points_15','points_20','points_25','rebound_5','rebound_10','assist_5','assist_10','three_pointer','steal','block'];
  v_player jsonb; v_stat_type text; v_threshold int; v_display text;
  v_new_sq jsonb; v_new_squares jsonb;
  v_player_id text; v_player_name text; v_player_last text;
  v_current_combo text; v_new_combo text; v_attempts int := 0; i int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_square_index < 0 OR p_square_index > 24 THEN RAISE EXCEPTION 'Square index must be between 0 and 24'; END IF;
  IF p_square_index = 12 THEN RAISE EXCEPTION 'Cannot swap the FREE center square'; END IF;
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'lobby' THEN RAISE EXCEPTION 'Card swaps are only allowed while the game is in lobby'; END IF;
  SELECT * INTO v_card FROM cards WHERE room_id = p_room_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found for this room'; END IF;
  PERFORM 1 FROM profiles WHERE id = v_uid AND dabs_balance >= 5 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not enough Dabs (need 5)'; END IF;
  v_current_sq    := v_card.squares->p_square_index;
  v_current_combo := (v_current_sq->>'player_id') || ':' || (v_current_sq->>'stat_type');
  SELECT jsonb_agg(DISTINCT jsonb_build_object('id', sq->>'player_id', 'name', sq->>'player_name'))
    INTO v_players
  FROM jsonb_array_elements(v_card.squares) sq
  WHERE (sq->>'stat_type') != 'free' AND (sq->>'player_id') IS NOT NULL;
  v_player_count := jsonb_array_length(v_players);
  IF v_player_count = 0 THEN RAISE EXCEPTION 'No players found on card'; END IF;
  LOOP
    v_player    := v_players->( floor(random() * v_player_count)::int );
    v_stat_type := v_stat_types[ 1 + floor(random() * 11)::int ];
    v_new_combo := (v_player->>'id') || ':' || v_stat_type;
    v_attempts  := v_attempts + 1;
    EXIT WHEN v_new_combo != v_current_combo OR v_attempts > 50;
  END LOOP;
  v_player_id   := v_player->>'id';
  v_player_name := v_player->>'name';
  v_player_last := CASE WHEN v_player_name LIKE '% %' THEN SUBSTRING(v_player_name FROM POSITION(' ' IN v_player_name) + 1) ELSE v_player_name END;
  IF v_stat_type LIKE 'points!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 8)::int; v_display := v_player_last || ' ' || v_threshold || '+ PTS';
  ELSIF v_stat_type LIKE 'rebound!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 9)::int; v_display := v_player_last || ' ' || v_threshold || '+ REB';
  ELSIF v_stat_type LIKE 'assist!_%' ESCAPE '!' THEN
    v_threshold := SUBSTRING(v_stat_type FROM 8)::int; v_display := v_player_last || ' ' || v_threshold || '+ AST';
  ELSIF v_stat_type = 'three_pointer' THEN v_threshold := 1; v_display := v_player_last || ' 1+ 3PM';
  ELSIF v_stat_type = 'steal'         THEN v_threshold := 1; v_display := v_player_last || ' 1+ STL';
  ELSIF v_stat_type = 'block'         THEN v_threshold := 1; v_display := v_player_last || ' 1+ BLK';
  ELSE v_threshold := 1; v_display := v_player_last || ' ' || v_stat_type;
  END IF;
  v_new_sq := jsonb_build_object('id', v_current_sq->>'id', 'player_id', v_player_id, 'player_name', v_player_name, 'stat_type', v_stat_type, 'threshold', v_threshold, 'display_text', v_display, 'marked', false);
  v_new_squares := '[]'::jsonb;
  FOR i IN 0..24 LOOP
    IF i = p_square_index THEN v_new_squares := v_new_squares || v_new_sq;
    ELSE v_new_squares := v_new_squares || (v_card.squares->i); END IF;
  END LOOP;
  UPDATE cards SET squares = v_new_squares WHERE id = v_card.id;
  UPDATE profiles SET dabs_balance = dabs_balance - 5 WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id) VALUES (v_uid, -5, 'card_swap', p_room_id);
  RETURN QUERY SELECT * FROM cards WHERE id = v_card.id;
END; $$;

-- =============================================================================
-- DONE. Your fresh Supabase project is ready.
-- =============================================================================
-- =============================================================================
-- =============================================================================
-- 006: Dabs Store v2 — user_inventory, equipped_badge, board_skin, new RPCs
-- =============================================================================

-- ── A. Expand store_items with new schema columns ────────────────────────────
ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS name        text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price       int,
  ADD COLUMN IF NOT EXISTS metadata    jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

-- Migrate existing rows: copy label→name, cost→price, value→metadata
UPDATE public.store_items SET
  name        = label,
  price       = cost,
  is_active   = true,
  metadata    = CASE category
    WHEN 'name_color' THEN jsonb_build_object('hex',   value)
    WHEN 'name_font'  THEN jsonb_build_object('font',  value)
    WHEN 'badge'      THEN jsonb_build_object('emoji', value, 'label', upper(label))
    WHEN 'board_skin' THEN jsonb_build_object('class', value)
    ELSE '{}'::jsonb
  END
WHERE name IS NULL;

-- ── B. Upsert new catalog (replaces overlapping IDs with v2 data) ─────────────
INSERT INTO public.store_items (id, category, name, description, price, metadata, sort_order, is_active) VALUES
  -- Name Colors
  ('color_orange',   'name_color', 'Blaze Orange',   'The Dabber signature',       50,  '{"hex":"#ff6b35"}', 1,  true),
  ('color_gold',     'name_color', 'Gold Rush',      'Winner winner',              50,  '{"hex":"#f59e0b"}', 2,  true),
  ('color_emerald',  'name_color', 'Emerald',        'Cool and collected',         50,  '{"hex":"#22c55e"}', 3,  true),
  ('color_ice_blue', 'name_color', 'Ice Blue',       'Frost bite',                 50,  '{"hex":"#3b82f6"}', 4,  true),
  ('color_purple',   'name_color', 'Royal Purple',   'Crown energy',               50,  '{"hex":"#8b5cf6"}', 5,  true),
  ('color_hot_pink', 'name_color', 'Hot Pink',       'Stand out from the crowd',   50,  '{"hex":"#ec4899"}', 6,  true),
  ('color_crimson',  'name_color', 'Crimson',        'Blood red intensity',        50,  '{"hex":"#dc2626"}', 7,  true),
  ('color_white',    'name_color', 'Clean White',    'Back to basics',             25,  '{"hex":"#f0f0ff"}', 8,  true),
  -- Name Fonts
  ('font_mono',      'name_font',  'Monospace',  'The default arcade look',        25,  '{"font":"mono"}',    1,  true),
  ('font_display',   'name_font',  'Display',    'Bold and blocky headlines',      75,  '{"font":"display"}', 2,  true),
  ('font_serif',     'name_font',  'Serif',      'Old-school newspaper type',      75,  '{"font":"serif"}',   3,  true),
  ('font_rounded',   'name_font',  'Rounded',    'Smooth and friendly',            75,  '{"font":"rounded"}', 4,  true),
  -- Badges
  ('badge_flame',    'badge',      'On Fire',        'For hot streaks',            100, '{"emoji":"🔥","label":"ON FIRE"}',  1, true),
  ('badge_crown',    'badge',      'Champion',       'First place finisher',       150, '{"emoji":"👑","label":"CHAMP"}',    2, true),
  ('badge_lightning','badge',      'Lightning',      'Speed demon',                100, '{"emoji":"⚡","label":"FAST"}',     3, true),
  ('badge_diamond',  'badge',      'Diamond Hands',  'Never gives up',             200, '{"emoji":"💎","label":"DIAMOND"}',  4, true),
  ('badge_ghost',    'badge',      'Ghost',          'Silent but deadly',          100, '{"emoji":"👻","label":"GHOST"}',    5, true),
  ('badge_rocket',   'badge',      'Rocket',         'To the moon',                100, '{"emoji":"🚀","label":"LAUNCH"}',   6, true),
  ('badge_skull',    'badge',      'Skull',          'Fear the reaper',            150, '{"emoji":"💀","label":"SKULL"}',    7, true),
  ('badge_star',     'badge',      'All-Star',       'MVP vibes',                  200, '{"emoji":"⭐","label":"ALL-STAR"}', 8, true),
  -- Board Skins
  ('skin_default',   'board_skin', 'Default',      'Standard arcade grid',           0,  '{"class":"default"}', 1, true),
  ('skin_neon',      'board_skin', 'Neon Glow',    'Electric borders that pulse',   150, '{"class":"neon"}',    2, true),
  ('skin_retro',     'board_skin', 'Retro CRT',    'Scanlines and phosphor glow',   150, '{"class":"retro"}',   3, true),
  ('skin_minimal',   'board_skin', 'Minimal',      'Thin lines, lots of space',     100, '{"class":"minimal"}', 4, true),
  ('skin_gold',      'board_skin', 'Gold Edition', 'Luxury gold borders',           200, '{"class":"gold"}',    5, true)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  price       = EXCLUDED.price,
  metadata    = EXCLUDED.metadata,
  sort_order  = EXCLUDED.sort_order,
  is_active   = EXCLUDED.is_active;

-- ── C. User inventory table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id      text NOT NULL REFERENCES public.store_items(id),
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON public.user_inventory(user_id);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_select_own" ON public.user_inventory;
CREATE POLICY "inventory_select_own" ON public.user_inventory
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── D. Add equipped_badge + board_skin columns to profiles ───────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_badge text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS board_skin     text    DEFAULT 'default';

-- ── E. purchase_store_item RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_store_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid            uuid;
  v_item           store_items;
  v_balance        int;
  v_already_owned  boolean;
  v_price          int;
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
    'success',     true,
    'charged',     v_price,
    'item_id',     p_item_id,
    'new_balance', v_balance - v_price
  );
END;
$$;

-- ── F. equip_store_item RPC ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.equip_store_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid;
  v_item   store_items;
  v_owned  boolean;
  v_price  int;
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

-- ── G. unequip_badge RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unequip_badge()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET equipped_badge = NULL WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── H. swap_card_square — updated signature (returns jsonb, accepts roster) ──
CREATE OR REPLACE FUNCTION public.swap_card_square(
  p_room_id     uuid,
  p_square_index int,
  p_roster      jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid         uuid;
  v_room        rooms;
  v_card        cards;
  v_balance     int;
  v_squares     jsonb;
  v_old_square  jsonb;
  v_new_square  jsonb;
  v_player      jsonb;
  v_stat_type   text;
  v_stat_types  text[] := ARRAY[
    'points_10','points_15','points_20','points_25',
    'three_pointer','rebound_5','rebound_10','assist_5','assist_10','steal','block'
  ];
  v_threshold   int;
  v_display     text;
  v_player_count int;
  v_attempts    int := 0;
  v_existing_key text;
  v_new_key     text;
  v_swap_cost   int := 5;
  v_player_name text;
  v_player_last text;
  i             int;
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

  SELECT dabs_balance INTO v_balance FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_swap_cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_dabs', 'balance', v_balance, 'cost', v_swap_cost);
  END IF;

  v_squares    := v_card.squares;
  v_old_square := v_squares->p_square_index;
  v_existing_key := (v_old_square->>'player_id') || ':' || (v_old_square->>'stat_type');

  -- Build roster: prefer passed-in, fall back to extracting from card
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

  -- Generate replacement square
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

  -- Rebuild squares
  v_squares := '[]'::jsonb;
  FOR i IN 0..24 LOOP
    IF i = p_square_index THEN v_squares := v_squares || v_new_square;
    ELSE v_squares := v_squares || (v_card.squares->i); END IF;
  END LOOP;

  UPDATE cards SET squares = v_squares WHERE id = v_card.id;
  UPDATE profiles SET dabs_balance = dabs_balance - v_swap_cost WHERE id = v_uid;
  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
    VALUES (v_uid, -v_swap_cost, 'card_swap', p_room_id);

  RETURN jsonb_build_object(
    'success',      true,
    'charged',      v_swap_cost,
    'new_balance',  v_balance - v_swap_cost,
    'old_square',   v_old_square,
    'new_square',   v_new_square,
    'square_index', p_square_index
  );
END;
$$;

-- ── I. Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inventory;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- =============================================================================
-- 009: Add p_new_square parameter to swap_card_square RPC
-- =============================================================================

DROP FUNCTION IF EXISTS public.swap_card_square(uuid, jsonb, int);
DROP FUNCTION IF EXISTS public.swap_card_square(uuid, int, jsonb);
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
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'room_not_found');
  END IF;

  IF v_room.status <> 'lobby' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'game_already_started');
  END IF;

  SELECT * INTO v_card
  FROM public.cards
  WHERE room_id = p_room_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'card_not_found');
  END IF;

  v_squares    := v_card.squares;
  v_swap_count := COALESCE(v_card.swap_count, 0);

  IF v_swap_count >= 2 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'max_swaps_reached');
  END IF;

  v_cost := CASE WHEN v_swap_count = 0 THEN 10 ELSE 50 END;

  SELECT dabs_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_dabs',
      'balance', COALESCE(v_balance, 0),
      'cost', v_cost
    );
  END IF;

  IF p_square_index < 0 OR p_square_index > 24 OR p_square_index = 12 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_square_index');
  END IF;

  IF p_new_square IS NOT NULL THEN
    v_new_square := p_new_square || jsonb_build_object(
      'marked', false,
      'id', gen_random_uuid()
    );
  ELSIF p_roster IS NOT NULL AND jsonb_array_length(p_roster) > 0 THEN
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

  UPDATE public.profiles
  SET dabs_balance = dabs_balance - v_cost
  WHERE id = v_user_id;

  v_squares := jsonb_set(v_squares, ARRAY[p_square_index::text], v_new_square);

  UPDATE public.cards
  SET squares    = v_squares,
      swap_count = v_swap_count + 1
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

-- =============================================================================
-- 010: Fix "record v_item has no field cost" in store purchase/equip RPCs
-- =============================================================================

ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS cost int;

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

-- =============================================================================
-- SHARE BONUS (024)
-- =============================================================================

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

  IF EXISTS (
    SELECT 1 FROM dabs_transactions
    WHERE user_id = v_uid AND room_id = p_room_id AND reason = 'share_bonus'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_claimed');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_base_dobs
  FROM dabs_transactions
  WHERE user_id = v_uid AND room_id = p_room_id AND amount > 0 AND reason != 'share_bonus';

  IF v_base_dobs <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_earnings');
  END IF;

  v_bonus := ROUND(v_base_dobs * 0.8);

  INSERT INTO dabs_transactions (user_id, amount, reason, room_id)
  VALUES (v_uid, v_bonus, 'share_bonus', p_room_id);

  UPDATE profiles SET dabs_balance = dabs_balance + v_bonus WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'bonus', v_bonus, 'base_dobs', v_base_dobs);
END;
$$;
