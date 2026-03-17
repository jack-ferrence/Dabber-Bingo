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
-- DONE. Your fresh Supabase project is ready.
-- =============================================================================
