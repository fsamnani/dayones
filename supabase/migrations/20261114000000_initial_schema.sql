-- DayOnes initial schema (v1)
-- See PRD.md for vocabulary. Plain-English summary of each table is in the comments.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.talent_position as enum ('musician', 'creator', 'streamer');
create type public.talent_status as enum ('nominated', 'draftable', 'retired');
create type public.roster_slot as enum ('musician', 'creator', 'streamer', 'flex');

-- Weeks run Monday through Sunday, Pacific time. Returns the Monday of the week.
create function public.week_start_of(ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('week', ts at time zone 'America/Los_Angeles'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Platforms: every place a talent can have an account.
-- is_tracked = we pull stats from it. Otherwise it is link-only (shown on the
-- profile). Turning on a new data source later is a one-row change.
-- ---------------------------------------------------------------------------
create table public.platforms (
  id text primary key,
  name text not null,
  is_tracked boolean not null default false,
  audience_metric text,          -- which stat counts as "audience size" here
  notes text
);

insert into public.platforms (id, name, is_tracked, audience_metric, notes) values
  ('youtube',     'YouTube',     true,  'subscribers', 'YouTube Data API'),
  ('lastfm',      'Last.fm',     true,  'listeners',   'Last.fm API'),
  ('wikipedia',   'Wikipedia',   true,  null,          'Pageviews API. Heat signal only'),
  ('twitch',      'Twitch',      true,  'followers',   'Twitch API. Verify access'),
  ('kick',        'Kick',        false, 'followers',   'Link-only until a public API is verified'),
  ('spotify',     'Spotify',     false, null,          'Link-only. Artist stats removed from API for new apps (Feb 2026)'),
  ('apple_music', 'Apple Music', false, null,          'Link-only. No audience stats available'),
  ('soundcloud',  'SoundCloud',  false, 'followers',   'Link-only for now'),
  ('instagram',   'Instagram',   false, 'followers',   'Link-only. Restricted API; paid aggregator in v2'),
  ('tiktok',      'TikTok',      false, 'followers',   'Link-only. Restricted API; paid aggregator in v2'),
  ('x',           'X',           false, 'followers',   'Link-only. API too expensive');

-- ---------------------------------------------------------------------------
-- Talent and their linked accounts
-- ---------------------------------------------------------------------------
create table public.talent (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  "position" public.talent_position not null,
  tags text[] not null default '{}',
  image_url text,
  bio text,
  status public.talent_status not null default 'nominated',
  created_at timestamptz not null default now()
);

create table public.talent_accounts (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent (id) on delete cascade,
  platform_id text not null references public.platforms (id),
  external_id text,              -- channel id, artist name, page title, etc.
  url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (talent_id, platform_id, url)
);
create index talent_accounts_talent_idx on public.talent_accounts (talent_id);
-- A talent has at most one primary platform.
create unique index talent_accounts_one_primary on public.talent_accounts (talent_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Stat snapshots: one row per account, per stat, per day. Append-only.
-- ---------------------------------------------------------------------------
create table public.stat_snapshots (
  id bigint generated always as identity primary key,
  talent_account_id uuid not null references public.talent_accounts (id) on delete restrict,
  metric text not null,          -- subscribers, total_views, listeners, pageviews, ...
  value numeric not null check (value >= 0),
  snapshot_date date not null,
  fetched_at timestamptz not null default now(),
  source text not null,          -- e.g. youtube_data_api_v3
  source_url text,
  unique (talent_account_id, metric, snapshot_date)
);
create index stat_snapshots_date_idx on public.stat_snapshots (snapshot_date);

create function public.block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: rows cannot be changed or deleted', tg_table_name;
end;
$$;

create trigger stat_snapshots_append_only
  before update or delete on public.stat_snapshots
  for each row execute function public.block_changes();

-- ---------------------------------------------------------------------------
-- Milestones: the "touchdowns"
-- ---------------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent (id) on delete restrict,
  kind text not null,            -- billboard_first_entry, crossed_100k, ...
  description text,
  points integer not null,
  occurred_on date not null,
  source_url text,
  logged_by text not null default 'admin' check (logged_by in ('system', 'admin')),
  created_at timestamptz not null default now()
);
create index milestones_talent_idx on public.milestones (talent_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Scouts (user profiles), created automatically at sign-up
-- ---------------------------------------------------------------------------
create table public.scouts (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scouts (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Scout'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.scouts where id = (select auth.uid()) and is_admin);
$$;

-- ---------------------------------------------------------------------------
-- Leagues, members, seasons
-- ---------------------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.scouts (id) on delete restrict,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  is_solo boolean not null default false,   -- private one-person league for solo play
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  scout_id uuid not null references public.scouts (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (league_id, scout_id)
);
create index league_members_scout_idx on public.league_members (scout_id);

create function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and scout_id = (select auth.uid())
  );
$$;

-- The league creator is automatically its first member.
create function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.league_members (league_id, scout_id) values (new.id, new.owner_id);
  return new;
end;
$$;

create trigger leagues_add_owner
  after insert on public.leagues
  for each row execute function public.add_owner_as_member();

-- Join a league from an invite link.
create function public.join_league(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to join a league';
  end if;
  select id into v_league_id from public.leagues
  where invite_code = p_invite_code and not is_solo;
  if v_league_id is null then
    raise exception 'Invite code not found';
  end if;
  insert into public.league_members (league_id, scout_id)
  values (v_league_id, (select auth.uid()))
  on conflict do nothing;
  return v_league_id;
end;
$$;

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  number integer not null check (number >= 1),
  starts_on date not null check (extract(isodow from starts_on) = 1),  -- a Monday
  weeks integer not null default 12 check (weeks between 1 and 52),
  playoff_weeks integer not null default 2 check (playoff_weeks >= 0),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'complete')),
  created_at timestamptz not null default now(),
  unique (league_id, number)
);

-- ---------------------------------------------------------------------------
-- Picks = the Ledger. Every pick ever made. Never deleted.
-- Current roster = picks where dropped_at is null.
-- ---------------------------------------------------------------------------
create table public.picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  scout_id uuid not null references public.scouts (id) on delete restrict,
  talent_id uuid not null references public.talent (id) on delete restrict,
  slot public.roster_slot not null,
  picked_at timestamptz not null default now(),
  dropped_at timestamptz,
  size_at_draft numeric not null check (size_at_draft >= 1000),   -- minimum draftable size
  multiplier numeric(4, 2) not null check (multiplier >= 1),      -- Day One multiplier, locked
  foreign key (league_id, scout_id) references public.league_members (league_id, scout_id) on delete restrict,
  check (dropped_at is null or dropped_at >= picked_at)
);
create index picks_scout_idx on public.picks (scout_id, picked_at);
create index picks_talent_idx on public.picks (talent_id);
create index picks_roster_idx on public.picks (league_id, scout_id) where dropped_at is null;
-- Exclusive within a league: a talent can be on only one active roster per league.
create unique index picks_exclusive_in_league on public.picks (league_id, talent_id) where dropped_at is null;

-- Ledger guard: no deletes; the only allowed edits are dropping and changing slot.
create function public.guard_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'The Ledger is permanent: picks cannot be deleted';
  end if;
  if new.league_id is distinct from old.league_id
     or new.scout_id is distinct from old.scout_id
     or new.talent_id is distinct from old.talent_id
     or new.picked_at is distinct from old.picked_at
     or new.size_at_draft is distinct from old.size_at_draft
     or new.multiplier is distinct from old.multiplier then
    raise exception 'The Ledger is permanent: pick details cannot be changed';
  end if;
  if old.dropped_at is not null
     and (new.dropped_at is distinct from old.dropped_at or new.slot is distinct from old.slot) then
    raise exception 'The Ledger is permanent: a dropped pick cannot be changed';
  end if;
  return new;
end;
$$;

create trigger picks_a_guard_ledger
  before update or delete on public.picks
  for each row execute function public.guard_ledger();

-- Roster rules: 10 slots = 4 musician, 3 creator, 1 streamer, 2 flex.
create function public.enforce_roster_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.talent_position;
  v_status public.talent_status;
  v_total integer;
  v_in_slot integer;
  v_limit integer;
begin
  if new.dropped_at is not null then
    return new;
  end if;

  -- Lock this roster so two picks made at the same moment can't both squeeze in.
  perform 1 from public.league_members
  where league_id = new.league_id and scout_id = new.scout_id
  for update;

  select t."position", t.status into v_position, v_status
  from public.talent t where t.id = new.talent_id;

  if tg_op = 'INSERT' and v_status <> 'draftable' then
    raise exception 'This talent is not draftable yet';
  end if;
  if new.slot <> 'flex' and new.slot::text <> v_position::text then
    raise exception 'A % cannot fill a % slot', v_position, new.slot;
  end if;

  select count(*), count(*) filter (where p.slot = new.slot)
  into v_total, v_in_slot
  from public.picks p
  where p.league_id = new.league_id
    and p.scout_id = new.scout_id
    and p.dropped_at is null
    and p.id <> new.id;

  v_limit := case new.slot
    when 'musician' then 4
    when 'creator' then 3
    when 'streamer' then 1
    when 'flex' then 2
  end;

  if v_total >= 10 then
    raise exception 'Roster is full (10 talent)';
  end if;
  if v_in_slot >= v_limit then
    raise exception 'No open % slot (limit %)', new.slot, v_limit;
  end if;
  return new;
end;
$$;

create trigger picks_b_roster_rules
  before insert or update of slot on public.picks
  for each row execute function public.enforce_roster_rules();

-- ---------------------------------------------------------------------------
-- Scores
-- ---------------------------------------------------------------------------
-- Per talent, per week, before any multiplier. Same for everyone.
create table public.talent_weekly_scores (
  talent_id uuid not null references public.talent (id) on delete restrict,
  week_start date not null check (extract(isodow from week_start) = 1),
  audience_index numeric,
  growth_points numeric not null default 0,
  heat_points numeric not null default 0,
  milestone_points numeric not null default 0,
  total_points numeric generated always as (growth_points + heat_points + milestone_points) stored,
  details jsonb not null default '{}',   -- the inputs behind the numbers (the "why")
  is_final boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (talent_id, week_start)
);
create index talent_weekly_scores_week_idx on public.talent_weekly_scores (week_start);

-- Per pick, per week, after the Day One multiplier.
create table public.scout_weekly_points (
  pick_id uuid not null references public.picks (id) on delete restrict,
  week_start date not null check (extract(isodow from week_start) = 1),
  base_points numeric not null,
  multiplier numeric(4, 2) not null,
  points numeric not null,
  computed_at timestamptz not null default now(),
  primary key (pick_id, week_start)
);
create index scout_weekly_points_week_idx on public.scout_weekly_points (week_start);

create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  week integer not null check (week >= 1),
  home_scout_id uuid not null references public.scouts (id) on delete restrict,
  away_scout_id uuid references public.scouts (id) on delete restrict,   -- null = bye week
  home_points numeric,
  away_points numeric,
  winner_scout_id uuid references public.scouts (id) on delete restrict, -- null = tie or not final
  is_playoff boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'final')),
  unique (season_id, week, home_scout_id),
  check (away_scout_id is null or away_scout_id <> home_scout_id)
);

-- ---------------------------------------------------------------------------
-- League posts: weekly recaps (who won, top scorers and why), announcements,
-- and scout messages.
-- ---------------------------------------------------------------------------
create table public.league_posts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  kind text not null check (kind in ('recap', 'announcement', 'message')),
  author_id uuid references public.scouts (id) on delete set null,   -- null = written by the system
  week_start date check (week_start is null or extract(isodow from week_start) = 1),
  title text,
  body text not null,
  data jsonb not null default '{}',      -- structured recap: winners, top scorers, reasons
  created_at timestamptz not null default now()
);
create index league_posts_league_idx on public.league_posts (league_id, created_at desc);
-- One recap per league per week.
create unique index league_posts_one_recap on public.league_posts (league_id, week_start) where kind = 'recap';

-- ---------------------------------------------------------------------------
-- Nominations
-- ---------------------------------------------------------------------------
create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  scout_id uuid not null references public.scouts (id) on delete cascade,
  name text not null,
  "position" public.talent_position,
  links text[] not null default '{}',
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  talent_id uuid references public.talent (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Views (live saved queries)
-- ---------------------------------------------------------------------------
-- Latest value of every stat for every account.
create view public.talent_latest_stats
with (security_invoker = true) as
select distinct on (s.talent_account_id, s.metric)
  a.talent_id,
  a.platform_id,
  s.talent_account_id,
  s.metric,
  s.value,
  s.snapshot_date,
  s.fetched_at,
  s.source,
  s.source_url
from public.stat_snapshots s
join public.talent_accounts a on a.id = s.talent_account_id
order by s.talent_account_id, s.metric, s.snapshot_date desc;

-- Rankings and trending: who is hot, who is growing, who is being picked up.
create view public.talent_rankings
with (security_invoker = true) as
with rostered as (
  select talent_id, count(*) as rostered_count
  from public.picks where dropped_at is null
  group by talent_id
),
active_leagues as (
  select count(distinct league_id) as n from public.picks where dropped_at is null
),
adds as (
  select talent_id, public.week_start_of(picked_at) as week_start, count(*) as adds
  from public.picks
  group by 1, 2
)
select
  t.id as talent_id,
  t.name,
  t.slug,
  t."position",
  t.tags,
  t.image_url,
  s.week_start,
  s.audience_index,
  s.growth_points,
  s.heat_points,
  s.milestone_points,
  s.total_points,
  rank() over (partition by s.week_start order by s.total_points desc) as points_rank,
  rank() over (partition by s.week_start order by s.heat_points desc) as heat_rank,
  rank() over (partition by s.week_start order by s.growth_points desc) as growth_rank,
  coalesce(r.rostered_count, 0) as rostered_count,
  coalesce(round(100.0 * r.rostered_count / nullif(al.n, 0), 1), 0) as rostered_pct,
  coalesce(ad.adds, 0) as adds_this_week
from public.talent_weekly_scores s
join public.talent t on t.id = s.talent_id
cross join active_leagues al
left join rostered r on r.talent_id = s.talent_id
left join adds ad on ad.talent_id = s.talent_id and ad.week_start = s.week_start;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
alter table public.platforms enable row level security;
alter table public.talent enable row level security;
alter table public.talent_accounts enable row level security;
alter table public.stat_snapshots enable row level security;
alter table public.milestones enable row level security;
alter table public.scouts enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.seasons enable row level security;
alter table public.picks enable row level security;
alter table public.talent_weekly_scores enable row level security;
alter table public.scout_weekly_points enable row level security;
alter table public.matchups enable row level security;
alter table public.league_posts enable row level security;
alter table public.nominations enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant execute on function public.week_start_of(timestamptz) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.join_league(text) to authenticated;

-- Not signed in: can see the talent directory only.
grant select on public.platforms, public.talent to anon;

-- Signed-in scouts: read access (row rules below narrow it further).
grant select on all tables in schema public to authenticated;

-- Public game data: any signed-in scout can read. The Ledger is public proof.
create policy "anyone can read platforms" on public.platforms for select to anon, authenticated using (true);
create policy "anyone can read talent" on public.talent for select to anon, authenticated using (true);
create policy "scouts can read talent accounts" on public.talent_accounts for select to authenticated using (true);
create policy "scouts can read stats" on public.stat_snapshots for select to authenticated using (true);
create policy "scouts can read milestones" on public.milestones for select to authenticated using (true);
create policy "scouts can read talent scores" on public.talent_weekly_scores for select to authenticated using (true);
create policy "scouts can read scout points" on public.scout_weekly_points for select to authenticated using (true);
create policy "scouts can read the ledger" on public.picks for select to authenticated using (true);
create policy "scouts can read profiles" on public.scouts for select to authenticated using (true);

-- Own profile: name and avatar only (never is_admin).
grant update (display_name, avatar_url) on public.scouts to authenticated;
create policy "scouts can edit own profile" on public.scouts for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Leagues: visible to members; anyone signed in can create one; owner can rename.
grant insert (name, owner_id, is_solo) on public.leagues to authenticated;
grant update (name) on public.leagues to authenticated;
create policy "members can read league" on public.leagues for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_league_member(id));
create policy "scouts can create leagues" on public.leagues for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owner can rename league" on public.leagues for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "members can read members" on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
create policy "members can read seasons" on public.seasons for select to authenticated
  using (public.is_league_member(league_id));
create policy "members can read matchups" on public.matchups for select to authenticated
  using (exists (
    select 1 from public.seasons se
    where se.id = season_id and public.is_league_member(se.league_id)
  ));

-- League posts: members read; members can post messages as themselves.
grant insert (league_id, kind, author_id, body) on public.league_posts to authenticated;
create policy "members can read posts" on public.league_posts for select to authenticated
  using (public.is_league_member(league_id));
create policy "members can post messages" on public.league_posts for insert to authenticated
  with check (
    kind = 'message'
    and author_id = (select auth.uid())
    and public.is_league_member(league_id)
  );

-- Nominations: scouts submit and see their own; admins see and review all.
grant insert (scout_id, name, "position", links, note) on public.nominations to authenticated;
grant update (status, talent_id, reviewed_at) on public.nominations to authenticated;
create policy "scouts can read own nominations" on public.nominations for select to authenticated
  using (scout_id = (select auth.uid()) or public.is_admin());
create policy "scouts can nominate" on public.nominations for insert to authenticated
  with check (scout_id = (select auth.uid()));
create policy "admins can review nominations" on public.nominations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins curate talent, accounts, and milestones.
grant insert, update on public.talent, public.talent_accounts, public.milestones to authenticated;
create policy "admins can add talent" on public.talent for insert to authenticated with check (public.is_admin());
create policy "admins can edit talent" on public.talent for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins can add accounts" on public.talent_accounts for insert to authenticated with check (public.is_admin());
create policy "admins can edit accounts" on public.talent_accounts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins can add milestones" on public.milestones for insert to authenticated with check (public.is_admin());
create policy "admins can edit milestones" on public.milestones for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Everything else (stats, scores, picks, matchups, recaps) is written only by
-- server-side jobs using the service role. Drafting goes through server code
-- in the draft step so the Day One multiplier can't be tampered with.
