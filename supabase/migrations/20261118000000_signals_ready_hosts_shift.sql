-- Decisions of 2026-11-18 (see PRD 4, 5b, 5d, 7).

-- 1. Signals ready: a draftable talent can only be drafted once we can track at
--    least one Growth signal and one countable Heat signal. The data job sets
--    this every day, so talent switch on automatically when their signal does.
alter table public.talent
  add column signals_ready boolean not null default false,
  add column signals_checked_at timestamptz,
  add column signals_note text;

-- 4. Accounts can be switched off without deleting history (e.g. a host who
--    left a show). Admins edit this when a lineup changes. `label` names whose
--    page or channel it is ("Andrew Schulz", "Akaash Singh").
alter table public.talent_accounts
  add column is_active boolean not null default true,
  add column label text,
  add column ended_on date;

-- The draft must refuse talent that cannot score yet.
create or replace function public.enforce_roster_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.talent_position;
  v_status public.talent_status;
  v_ready boolean;
  v_total integer;
  v_in_slot integer;
  v_limit integer;
begin
  if new.dropped_at is not null then
    return new;
  end if;

  perform 1 from public.league_members
  where league_id = new.league_id and scout_id = new.scout_id
  for update;

  select t."position", t.status, t.signals_ready into v_position, v_status, v_ready
  from public.talent t where t.id = new.talent_id;

  if tg_op = 'INSERT' and v_status <> 'draftable' then
    raise exception 'This talent is not draftable yet';
  end if;
  if tg_op = 'INSERT' and not v_ready then
    raise exception 'This talent cannot be drafted until we can track their Growth and Heat';
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

-- 3. Wikipedia reports UTC days; US Sunday-night events land on the UTC Monday.
--    For scoring buckets only, each Wikipedia day is moved back by this many
--    days. Stored snapshots keep their real dates.
insert into public.scoring_settings (key, value, description) values
  ('wikiShiftDays', '-1', 'Wikipedia days are moved by this many days before being grouped into scoring weeks (scoring only; stored dates are real)')
on conflict (key) do nothing;
