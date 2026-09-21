-- ============================================================================
-- Exotic — 0001 · realm core
-- The two realms are served by separate tables (sp_* vs mp_*) so currencies,
-- progression and shops never bleed into each other. Everything here mirrors
-- exactly what assets/js/net/cloud.js writes and reads through PostgREST.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user per realm)
-- ---------------------------------------------------------------------------

create table if not exists public.sp_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null default '',
  display_name  text not null default '',
  email         text not null default '',
  avatar_seed   integer not null default 0,

  -- timestamps are epoch-milliseconds (the client stores Date.now())
  created_at    bigint not null default 0,
  last_seen     bigint not null default 0,

  level         integer not null default 1,
  xp            integer not null default 0,

  runs_played   integer not null default 0,
  runs_won      integer not null default 0,
  puzzles_solved integer not null default 0,
  puzzles_failed integer not null default 0,
  hints_used    integer not null default 0,
  perfects      integer not null default 0,
  no_hint_wins  integer not null default 0,
  streak        integer not null default 0,
  best_streak   integer not null default 0,
  best_time_ms  bigint  not null default 0,
  total_score   integer not null default 0,
  category_stats jsonb not null default '{}'::jsonb,
  tier_clears   jsonb   not null default '{}'::jsonb,
  badges        jsonb   not null default '[]'::jsonb,
  equipped      jsonb   not null default '{}'::jsonb,
  ai_uses       integer not null default 0,
  dailies_done  integer not null default 0,
  daily_streak  integer not null default 0,
  spent         integer not null default 0,

  -- single-player only columns
  shards        integer not null default 500,
  owned         integer not null default 0
);

create table if not exists public.mp_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null default '',
  display_name  text not null default '',
  email         text not null default '',
  avatar_seed   integer not null default 0,
  created_at    bigint not null default 0,
  last_seen     bigint not null default 0,

  level         integer not null default 1,
  xp            integer not null default 0,

  runs_played   integer not null default 0,
  runs_won      integer not null default 0,
  puzzles_solved integer not null default 0,
  puzzles_failed integer not null default 0,
  hints_used    integer not null default 0,
  perfects      integer not null default 0,
  no_hint_wins  integer not null default 0,
  streak        integer not null default 0,
  best_streak   integer not null default 0,
  best_time_ms  bigint  not null default 0,
  total_score   integer not null default 0,
  category_stats jsonb not null default '{}'::jsonb,
  tier_clears   jsonb   not null default '{}'::jsonb,
  badges        jsonb   not null default '[]'::jsonb,
  equipped      jsonb   not null default '{}'::jsonb,
  ai_uses       integer not null default 0,
  dailies_done  integer not null default 0,
  daily_streak  integer not null default 0,
  spent         integer not null default 0,

  -- multiplayer-only columns
  cores         integer not null default 250,
  elo           integer not null default 1000,
  rank_id       text    not null default 'iron',
  matches       integer not null default 0,
  wins          integer not null default 0,
  losses        integer not null default 0,
  ranked_wins   integer not null default 0,
  host_wins     integer not null default 0,
  owned         integer not null default 0,
  season        text    not null default ''
);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table if not exists public.sp_inventory (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.sp_profiles (id) on delete cascade,
  item_id     text not null,
  quantity    integer not null default 1,
  equipped    boolean not null default false,
  unique (profile_id, item_id)
);

create table if not exists public.mp_inventory (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.mp_profiles (id) on delete cascade,
  item_id     text not null,
  quantity    integer not null default 1,
  equipped    boolean not null default false,
  unique (profile_id, item_id)
);

-- ---------------------------------------------------------------------------
-- History (one row per finished run)
-- ---------------------------------------------------------------------------

create table if not exists public.sp_history (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.sp_profiles (id) on delete cascade,
  realm       text not null default 'single',
  tier        text not null default 'warmup',
  mode        text not null default 'solo',
  outcome     text not null default 'lost',
  score       integer not null default 0,
  xp          integer not null default 0,
  currency    integer not null default 0,
  solved      integer not null default 0,
  total       integer not null default 0,
  hints       integer not null default 0,
  elapsed_ms  bigint not null default 0,
  code        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.mp_history (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.mp_profiles (id) on delete cascade,
  realm       text not null default 'multi',
  tier        text not null default 'standard',
  mode        text not null default 'squad',
  outcome     text not null default 'lost',
  score       integer not null default 0,
  xp          integer not null default 0,
  currency    integer not null default 0,
  solved      integer not null default 0,
  total       integer not null default 0,
  hints       integer not null default 0,
  elapsed_ms  bigint not null default 0,
  code        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists sp_history_profile_idx on public.sp_history (profile_id, created_at desc);
create index if not exists mp_history_profile_idx on public.mp_history (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Saved runs (single snapshot per profile; the client upserts on profile_id)
-- ---------------------------------------------------------------------------

create table if not exists public.sp_runs (
  profile_id  uuid primary key references public.sp_profiles (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.mp_runs (
  profile_id  uuid primary key references public.mp_profiles (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared catalogue mirror — the server-side copy of assets/js/data/catalog.js
-- so purchase_item() can validate ids, prices and stack caps without trusting
-- the browser. The client catalog and this seed must stay in lockstep.
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_items (
  id        text primary key,
  realm     text not null check (realm in ('single', 'multi')),
  type      text not null check (type in ('power', 'perk', 'cosmetic')),
  name      text not null,
  price     integer not null,
  stack     integer not null default 1,
  advantage numeric not null default 0, -- (0.2 core dividend = 0.25) mirror for clarity
  meta      jsonb not null default '{}'::jsonb -- {desc, icon, rarity, effect}
);

insert into public.catalog_items (id, realm, type, name, price, stack, advantage, meta) values
  -- single-player shelf (Shards)
  ('sp-nudge',           'single', 'power',    'Nudge',            120,  9, 0,    '{"desc":"Reveals a guiding nudge for the puzzle you are staring at.","icon":"lightbulb","rarity":"common","effect":{"key":"nudge","value":1}}'),
  ('sp-fifty',           'single', 'power',    'Fifty-Fifty',      180,  9, 0,    '{"desc":"Strikes out half the wrong digits on one slot.","icon":"split","rarity":"common","effect":{"key":"fifty","value":1}}'),
  ('sp-time',            'single', 'power',    'Extra Time',       220,  9, 0,    '{"desc":"Adds 45 seconds to the running clock.","icon":"timer","rarity":"common","effect":{"key":"time","value":45000}}'),
  ('sp-skip',            'single', 'power',    'Swap Puzzle',      240,  9, 0,    '{"desc":"Retires the current puzzle and deals a fresh one from the same shelf.","icon":"refresh","rarity":"rare","effect":{"key":"swap","value":1}}'),
  ('sp-attempt',         'single', 'power',    'Spare Attempt',    260,  9, 0,    '{"desc":"One more guess against the vault.","icon":"plus","rarity":"rare","effect":{"key":"attempt","value":1}}'),
  ('sp-pause',           'single', 'power',    'Hold The Clock',   300,  9, 0,    '{"desc":"Freezes the timer for twenty seconds.","icon":"snowflake","rarity":"rare","effect":{"key":"pause","value":20000}}'),
  ('sp-reveal',          'single', 'power',    'Reveal A Digit',   340,  9, 0,    '{"desc":"Straight-up hands you one digit of the cipher.","icon":"eye","rarity":"epic","effect":{"key":"reveal","value":1}}'),
  ('sp-shield',          'single', 'power',    'Streak Shield',    450,  5, 0,    '{"desc":"Survives one loss without breaking your win streak.","icon":"shield","rarity":"epic","effect":{"key":"shield","value":1}}'),
  ('sp-double',          'single', 'power',    'Double Yield',     520,  5, 0,    '{"desc":"Doubles every shard you earn for the rest of the run.","icon":"trending","rarity":"epic","effect":{"key":"double","value":1}}'),
  ('sp-oracle',          'single', 'power',    'Oracle Solve',     680,  3, 0,    '{"desc":"The Oracle reads the puzzle and answers it outright.","icon":"bot","rarity":"mythic","effect":{"key":"oracle","value":1}}'),
  ('sp-perk-secondwind', 'single', 'perk',     'Second Wind',     1400,  1, 0,    '{"desc":"Every run begins with 15 bonus seconds.","icon":"hourglass","rarity":"rare","effect":{"key":"startBonusTime","value":15000}}'),
  ('sp-perk-cheaphints', 'single', 'perk',     'Frugal Mind',     1200,  1, 0,    '{"desc":"Hints cost 40% less in every run.","icon":"coins","rarity":"rare","effect":{"key":"hintDiscount","value":0.4}}'),
  ('sp-perk-scholar',    'single', 'perk',     'Scholar''s Path',  1800,  1, 0.15, '{"desc":"Permanently earn 15% more experience.","icon":"graduationCap","rarity":"epic","effect":{"key":"xpBonus","value":0.15}}'),
  ('sp-perk-dividend',   'single', 'perk',     'Shard Dividend',  2000,  1, 0.2,  '{"desc":"Permanently earn 20% more shards.","icon":"gem","rarity":"epic","effect":{"key":"currencyBonus","value":0.2}}'),
  ('sp-perk-precision',  'single', 'perk',     'Precision Instinct', 3200, 1, 0, '{"desc":"Every run starts with the first puzzle already cracked.","icon":"crosshair","rarity":"mythic","effect":{"key":"headStart","value":1}}'),
  ('sp-skin-obsidian',   'single', 'cosmetic', 'Board Skin — Obsidian', 900, 1, 0, '{"desc":"A deeper, quieter vault board with heavier shadows.","icon":"layers","rarity":"rare","effect":{"key":"boardSkin","value":"obsidian"}}'),
  ('sp-trail-comet',     'single', 'cosmetic', 'Trail — Comet',    700,  1, 0,    '{"desc":"Pixel dust follows every correct answer.","icon":"orbit","rarity":"rare","effect":{"key":"trail","value":"comet"}}'),
  ('sp-frame-cipher',    'single', 'cosmetic', 'Frame — Cipher',   650,  1, 0,    '{"desc":"An engraved frame around your avatar.","icon":"hash","rarity":"common","effect":{"key":"frame","value":"cipher"}}'),
  ('sp-title-locksmith', 'single', 'cosmetic', 'Title — Locksmith', 1100, 1, 0,   '{"desc":"Wear the word above your name.","icon":"award","rarity":"epic","effect":{"key":"title","value":"Locksmith"}}'),
  ('sp-title-polymath',  'single', 'cosmetic', 'Title — Polymath', 2600,  1, 0,   '{"desc":"For the ones who never specialise.","icon":"crown","rarity":"mythic","effect":{"key":"title","value":"Polymath"}}'),
  -- multiplayer shelf (Cores)
  ('mp-scan',            'multi',  'power',    'Scan',             240,  9, 0,    '{"desc":"Reveals how many puzzles each rival has cracked.","icon":"radar","rarity":"common","effect":{"key":"scan","value":1}}'),
  ('mp-ward',            'multi',  'power',    'Ward',             280,  9, 0,    '{"desc":"Blocks the next sabotage thrown at you.","icon":"shield","rarity":"common","effect":{"key":"ward","value":1}}'),
  ('mp-cloak',           'multi',  'power',    'Cloak',            320,  9, 0,    '{"desc":"Hides your progress bar from everyone for 12 seconds.","icon":"ghost","rarity":"rare","effect":{"key":"cloak","value":12000}}'),
  ('mp-fog',             'multi',  'power',    'Fog',              380,  9, 0,    '{"desc":"Blurs one rival''s keypad for five seconds.","icon":"cloudOff","rarity":"rare","effect":{"key":"fog","value":5000}}'),
  ('mp-freeze',          'multi',  'power',    'Freeze',           440,  9, 0,    '{"desc":"Stops a rival''s clock dead for three seconds.","icon":"snowflake","rarity":"epic","effect":{"key":"freeze","value":3000}}'),
  ('mp-thief',           'multi',  'power',    'Time Thief',       520,  9, 0,    '{"desc":"Takes 10 seconds for you and 5 from a rival.","icon":"hourglass","rarity":"epic","effect":{"key":"thief","value":10000}}'),
  ('mp-solve',           'multi',  'power',    'Instant Solve',    660,  5, 0,    '{"desc":"The Oracle cracks one of your puzzles mid-match.","icon":"wand","rarity":"epic","effect":{"key":"solve","value":1}}'),
  ('mp-double',          'multi',  'power',    'Double Cores',     760,  5, 0,    '{"desc":"Doubles the cores this match pays out.","icon":"orbit","rarity":"mythic","effect":{"key":"double","value":1}}'),
  ('mp-perk-rankshield', 'multi',  'perk',     'Rank Shield',     1500,  3, 0,    '{"desc":"Your next ranked defeat costs no rating.","icon":"shieldCheck","rarity":"rare","effect":{"key":"rankShield","value":1}}'),
  ('mp-perk-study',      'multi',  'perk',     'Rival''s Study',   1900,  1, 0.2,  '{"desc":"Permanently earn 20% more multiplayer experience.","icon":"brain","rarity":"rare","effect":{"key":"xpBonus","value":0.2}}'),
  ('mp-perk-dividend',   'multi',  'perk',     'Core Dividend',   2400,  1, 0.25, '{"desc":"Permanently earn 25% more cores.","icon":"coins","rarity":"epic","effect":{"key":"currencyBonus","value":0.25}}'),
  ('mp-perk-headstart',  'multi',  'perk',     'Head Start',      2800,  1, 0,    '{"desc":"Every match opens with one puzzle already solved.","icon":"rocket","rarity":"mythic","effect":{"key":"headStart","value":1}}'),
  ('mp-perk-recon',      'multi',  'perk',     'Recon Suite',     3400,  1, 0,    '{"desc":"Rival progress is always visible to you — cloaks do not work.","icon":"satellite","rarity":"mythic","effect":{"key":"recon","value":1}}'),
  ('mp-emote-respect',   'multi',  'cosmetic', 'Emote Pack — Respect', 400, 1, 0, '{"desc":"Four in-match emotes that say more than words.","icon":"heart","rarity":"common","effect":{"key":"emotes","value":"respect"}}'),
  ('mp-trail-glitch',    'multi',  'cosmetic', 'Trail — Glitch',   820,  1, 0,    '{"desc":"Corrupted pixels spill from every correct answer.","icon":"zap","rarity":"rare","effect":{"key":"trail","value":"glitch"}}'),
  ('mp-title-cipherbreaker', 'multi', 'cosmetic', 'Title — Cipherbreaker', 980, 1, 0, '{"desc":"Wear it in the lobby. Earn the fear.","icon":"crown","rarity":"epic","effect":{"key":"title","value":"Cipherbreaker"}}'),
  ('mp-frame-vault',     'multi',  'cosmetic', 'Frame — Vault',    950,  1, 0,    '{"desc":"A reinforced frame for a reinforced record.","icon":"lock","rarity":"epic","effect":{"key":"frame","value":"vault"}}'),
  ('mp-title-oracle',    'multi',  'cosmetic', 'Title — Oracle',  2900,  1, 0,    '{"desc":"Reserved for those who see the answer early.","icon":"telescope","rarity":"mythic","effect":{"key":"title","value":"Oracle"}}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS — profiles readable by everyone (leaderboards), writable only by owner
-- ---------------------------------------------------------------------------

alter table public.sp_profiles enable row level security;
alter table public.mp_profiles enable row level security;
alter table public.sp_inventory enable row level security;
alter table public.mp_inventory enable row level security;
alter table public.sp_history enable row level security;
alter table public.mp_history enable row level security;
alter table public.sp_runs enable row level security;
alter table public.mp_runs enable row level security;
alter table public.catalog_items enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sp_profiles' and policyname = 'sp_profiles_select_any') then
    create policy sp_profiles_select_any on public.sp_profiles for select using (true);
    create policy sp_profiles_insert_own on public.sp_profiles for insert with check (id = auth.uid());
    create policy sp_profiles_update_own on public.sp_profiles for update using (id = auth.uid());
    create policy mp_profiles_select_any on public.mp_profiles for select using (true);
    create policy mp_profiles_insert_own on public.mp_profiles for insert with check (id = auth.uid());
    create policy mp_profiles_update_own on public.mp_profiles for update using (id = auth.uid());

    create policy sp_inventory_own on public.sp_inventory for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
    create policy mp_inventory_own on public.mp_inventory for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

    create policy sp_history_own on public.sp_history for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
    create policy mp_history_own on public.mp_history for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

    create policy sp_runs_own on public.sp_runs for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
    create policy mp_runs_own on public.mp_runs for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

    create policy catalog_items_read on public.catalog_items for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- grant_currency(p_realm, p_amount, p_reason)
-- One round of run rewards. Security definer so only the balance column moves;
-- the amount is clamped to [0, 5000] per call. Returns the NEW balance integer,
-- exactly what Realm.prototype.grant expects back.
create or replace function public.grant_currency(
  p_realm  text,
  p_amount integer,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  amt   integer := greatest(least(coalesce(p_amount, 0), 5000), 0);
  bal   integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if amt = 0 then
    return 0;
  end if;

  if p_realm = 'single' then
    update public.sp_profiles set shards = shards + amt where id = uid returning shards into bal;
  elsif p_realm = 'multi' then
    update public.mp_profiles set cores = cores + amt where id = uid returning cores into bal;
  else
    raise exception 'Unknown realm: %', p_realm;
  end if;

  if not found then
    raise exception 'No profile in the % realm. Sign in there first.', p_realm;
  end if;
  return bal;
end;
$$;

-- spend_currency(p_realm, p_amount, p_reason)
-- Hint purchases, entrance fees, item charges. Raises SQLSTATE 22000 when the
-- wallet is short, which PostgREST surfaces as HTTP 400 — the client turns
-- exactly that status into "Not enough currency."
create or replace function public.spend_currency(
  p_realm  text,
  p_amount integer,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  amt integer := greatest(coalesce(p_amount, 0), 0);
  bal integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if amt = 0 then
    return 0;
  end if;

  if p_realm = 'single' then
    update public.sp_profiles set shards = shards - amt, spent = spent + amt
      where id = uid and shards >= amt returning shards into bal;
  elsif p_realm = 'multi' then
    update public.mp_profiles set cores = cores - amt, spent = spent + amt
      where id = uid and cores >= amt returning cores into bal;
  else
    raise exception 'Unknown realm: %', p_realm;
  end if;

  if not found then
    if exists (select 1 from public.sp_profiles where id = uid)
       or exists (select 1 from public.mp_profiles where id = uid) then
      raise exception 'Not enough currency.' using errcode = '22000';
    end if;
    raise exception 'No profile in the % realm. Sign in there first.', p_realm;
  end if;
  return bal;
end;
$$;

-- purchase_item(p_item_id)
-- Validates the item against the server-side catalogue, checks the wallet for
-- the correct realm, deducts, and upserts the inventory row. Returns
-- {balance, currency, item_id, quantity} for the client to echo into its
-- local profile.
create or replace function public.purchase_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  item   record;
  bal    integer;
  qty    integer;
  col    text;
  cur    text;
  inv_t  text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, realm, type, name, price, stack
    into item
    from public.catalog_items
   where id = p_item_id;
  if not found then
    raise exception 'Unknown item: %', p_item_id;
  end if;

  if item.realm = 'single' then
    col := 'shards'; cur := 'sp'; inv_t := 'public.sp_inventory';
    select shards into bal from public.sp_profiles where id = uid;
    if bal is null then
      raise exception 'No profile in the single realm. Sign in there first.';
    end if;
    if bal < item.price then
      raise exception 'You need % more shards.' using errcode = '22000';
    end if;
    update public.sp_profiles set shards = shards - item.price, spent = spent + item.price
      where id = uid;
    bal := bal - item.price;
  else
    col := 'cores'; cur := 'mp'; inv_t := 'public.mp_inventory';
    select cores into bal from public.mp_profiles where id = uid;
    if bal is null then
      raise exception 'No profile in the multi realm. Sign in there first.';
    end if;
    if bal < item.price then
      raise exception 'You need % more cores.' using errcode = '22000';
    end if;
    update public.mp_profiles set cores = cores - item.price, spent = spent + item.price
      where id = uid;
    bal := bal - item.price;
  end if;

  if item.stack > 1 then
    execute format('select quantity from %s where profile_id = %L and item_id = %L', inv_t, uid, p_item_id) into qty;
    if qty is not null and qty >= item.stack then
      raise exception 'You already hold the maximum stack of that.' using errcode = '22000';
    end if;
  end if;

  execute format(
    'insert into %s (profile_id, item_id, quantity) values (%L, %L, 1)
       on conflict (profile_id, item_id)
       do update set quantity = %s.quantity + 1
       returning quantity',
    inv_t, uid, p_item_id, inv_t
  ) into qty;

  return jsonb_build_object('balance', bal, 'currency', cur, 'item_id', p_item_id, 'quantity', qty);
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table
    public.sp_profiles,
    public.mp_profiles,
    public.sp_inventory,
    public.mp_inventory;
  exception when duplicate_object then null;
end $$;

commit;