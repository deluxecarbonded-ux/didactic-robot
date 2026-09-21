-- ============================================================================
-- Exotic — 0002 · multiplayer rooms
-- Live rooms for the Core realm: room rows, seats, a running event log, chat
-- and final results. All of these are consumed through realtime subscriptions
-- (assets/js/net/realtime.js + assets/js/net/cloud.js rooms.*).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

create table if not exists public.mp_rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                -- 5-char lobby code
  host_id      uuid not null,
  host_name    text not null default '',
  mode         text not null default 'squad',
  tier         text not null default 'standard',
  ranked       boolean not null default false,
  status       text not null default 'open' check (status in ('open', 'live', 'closed')),
  max_players  integer not null default 4,
  player_count integer not null default 1,
  seed         text not null default '',
  -- { startedAt, endsAt, code, puzzles } — mirrors the client's room.state
  state        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists mp_rooms_open_idx on public.mp_rooms (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Seats at the table
-- ---------------------------------------------------------------------------

create table if not exists public.mp_room_players (
  room_id      uuid not null references public.mp_rooms (id) on delete cascade,
  profile_id   uuid not null,
  name         text not null default '',
  avatar_seed  integer not null default 0,
  ready        boolean not null default false,
  solved       integer not null default 0,
  total        integer not null default 4,
  finished_at  timestamptz,
  placement    integer,
  outcome      text,
  joined_at    timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create index if not exists mp_room_players_room_idx on public.mp_room_players (room_id, joined_at);

-- ---------------------------------------------------------------------------
-- Event log (start / progress / finish / sabotage / emotes …)
-- ---------------------------------------------------------------------------

create table if not exists public.mp_room_events (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.mp_rooms (id) on delete cascade,
  kind        text not null default 'event',
  profile_id  uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists mp_room_events_room_idx on public.mp_room_events (room_id, created_at);

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

create table if not exists public.mp_chat (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.mp_rooms (id) on delete cascade,
  profile_id  uuid,
  name        text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists mp_chat_room_idx on public.mp_chat (room_id, created_at);

-- ---------------------------------------------------------------------------
-- Results (one row per finished player)
-- ---------------------------------------------------------------------------

create table if not exists public.mp_results (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.mp_rooms (id) on delete cascade,
  profile_id  uuid not null,
  name        text not null default '',
  outcome     text not null default 'lost',
  score       integer not null default 0,
  xp          integer not null default 0,
  currency    integer not null default 0,
  solved      integer not null default 0,
  elapsed_ms  bigint not null default 0,
  placement   integer,
  created_at  timestamptz not null default now()
);

create index if not exists mp_results_room_idx on public.mp_results (room_id, created_at);

-- ---------------------------------------------------------------------------
-- Shop watcher tables — the client's Realtime.shop() subscribes to per-realm
-- banners and a purchase feed; they exist so those channels resolve.
-- ---------------------------------------------------------------------------

create table if not exists public.sp_shop_items (
  id          uuid primary key default gen_random_uuid(),
  item_id     text not null,
  discount    numeric not null default 0,
  until       timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.mp_shop_items (
  id          uuid primary key default gen_random_uuid(),
  item_id     text not null,
  discount    numeric not null default 0,
  until       timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.sp_purchases (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null,
  item_id     text not null,
  price       integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.mp_purchases (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null,
  item_id     text not null,
  price       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mp_rooms enable row level security;
alter table public.mp_room_players enable row level security;
alter table public.mp_room_events enable row level security;
alter table public.mp_chat enable row level security;
alter table public.mp_results enable row level security;
alter table public.sp_shop_items enable row level security;
alter table public.mp_shop_items enable row level security;
alter table public.sp_purchases enable row level security;
alter table public.mp_purchases enable row level security;

do $$ begin
  -- Rooms: lobby is public to read; only the host writes the room row; any
  -- seated player may patch it (player_count, status, state while racing).
  create policy mp_rooms_select_any      on public.mp_rooms for select using (true);
  create policy mp_rooms_insert_host     on public.mp_rooms for insert with check (host_id = auth.uid());
  create policy mp_rooms_update_participant on public.mp_rooms
    for update using (
      host_id = auth.uid()
      or exists (select 1 from public.mp_room_players p where p.room_id = id and p.profile_id = auth.uid())
    );
  create policy mp_rooms_delete_host     on public.mp_rooms for delete using (host_id = auth.uid());

  -- Seats: the roster is public-ish (lobby previews show who is seated);
  -- a player only ever touches their own row.
  create policy mp_room_players_select_any on public.mp_room_players for select using (true);
  create policy mp_room_players_insert_own on public.mp_room_players
    for insert with check (profile_id = auth.uid());
  create policy mp_room_players_update_own on public.mp_room_players
    for update using (profile_id = auth.uid());
  create policy mp_room_players_delete_own on public.mp_room_players
    for delete using (profile_id = auth.uid());

  -- Events & chat: only people seated in the room can read or write them.
  create policy mp_room_events_select_seated on public.mp_room_events
    for select using (exists (select 1 from public.mp_room_players p where p.room_id = room_id and p.profile_id = auth.uid()));
  create policy mp_room_events_insert_seated on public.mp_room_events
    for insert with check (exists (select 1 from public.mp_room_players p where p.room_id = room_id and p.profile_id = auth.uid()));

  create policy mp_chat_select_seated on public.mp_chat
    for select using (exists (select 1 from public.mp_room_players p where p.room_id = room_id and p.profile_id = auth.uid()));
  create policy mp_chat_insert_seated on public.mp_chat
    for insert with check (exists (select 1 from public.mp_room_players p where p.room_id = room_id and p.profile_id = auth.uid()));

  -- Results: readable once seated; a player inserts their own row.
  create policy mp_results_select_seated on public.mp_results
    for select using (exists (select 1 from public.mp_room_players p where p.room_id = room_id and p.profile_id = auth.uid()));
  create policy mp_results_insert_own on public.mp_results
    for insert with check (profile_id = auth.uid());

  -- Shop watchers
  create policy sp_shop_items_read on public.sp_shop_items for select using (true);
  create policy sp_shop_items_write on public.sp_shop_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
  create policy mp_shop_items_read on public.mp_shop_items for select using (true);
  create policy mp_shop_items_write on public.mp_shop_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
  create policy sp_purchases_own on public.sp_purchases for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
  create policy mp_purchases_own on public.mp_purchases for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Realtime — the publication the app depends on
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table
    public.mp_rooms,
    public.mp_room_players,
    public.mp_room_events,
    public.mp_chat,
    public.mp_results,
    public.sp_shop_items,
    public.mp_shop_items,
    public.sp_purchases,
    public.mp_purchases;
  exception when duplicate_object then null;
end $$;

commit;