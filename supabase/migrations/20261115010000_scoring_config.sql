-- Scoring config: every tuning knob lives in the database, so formulas can be
-- tuned after the backtest without a code change (PRD 5a, 5b).

-- One row per platform per position.
--   audience_weight: how much this platform counts in the Audience Index (null = not an audience).
--   heat_floor: the Heat baseline must be at least this for the signal to count (null = not a Heat signal).
create table public.scoring_platform_config (
  "position" public.talent_position not null,
  platform_id text not null references public.platforms (id),
  audience_weight numeric check (audience_weight is null or audience_weight >= 0),
  heat_floor numeric check (heat_floor is null or heat_floor >= 0),
  heat_floor_unit text,
  updated_at timestamptz not null default now(),
  primary key ("position", platform_id)
);

insert into public.scoring_platform_config ("position", platform_id, audience_weight, heat_floor, heat_floor_unit)
select p.pos, c.platform_id, c.audience_weight, c.heat_floor, c.unit
from unnest(enum_range(null::public.talent_position)) as p(pos)
cross join (values
  ('youtube',   1.0,           1000, 'views per week on uploads from the last 7 days'),
  ('lastfm',    1.0,           null, null),
  ('twitch',    1.0,           50,   'peak live viewers'),
  ('wikipedia', null::numeric, 100,  'pageviews per day')
) as c(platform_id, audience_weight, heat_floor, unit);

-- Everything else: one row per setting.
create table public.scoring_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);

insert into public.scoring_settings (key, value, description) values
  ('growthPointsPer10x',    '100', 'Growth: points for a 10x increase in Audience Index'),
  ('heatPointsPerDoubling', '10',  'Heat: points each time attention doubles versus baseline'),
  ('heatCap',               '50',  'Heat: maximum points per week'),
  ('baselineWeeks',         '8',   'Heat: how many past weeks make up the baseline'),
  ('minBaselineWeeks',      '4',   'Heat: a signal needs at least this many past weeks of data to count'),
  ('minDraftableSize',      '1000','Smallest primary-platform size that can be drafted'),
  ('multiplierTiers',       '[{"minSize":1000000,"multiplier":1},{"minSize":100000,"multiplier":1.5},{"minSize":10000,"multiplier":2},{"minSize":1000,"multiplier":3}]', 'Day One multiplier by primary-platform size at draft'),
  ('sizeMilestones',        '[{"threshold":100000,"points":20},{"threshold":1000000,"points":40},{"threshold":10000000,"points":60}]', 'Bonus for crossing a size on the primary platform');

-- The formula is published (PRD 5f): anyone can read the config. Only admins and the job change it.
alter table public.scoring_platform_config enable row level security;
alter table public.scoring_settings enable row level security;
grant select on public.scoring_platform_config, public.scoring_settings to anon, authenticated;
grant update on public.scoring_platform_config, public.scoring_settings to authenticated;
grant all on public.scoring_platform_config, public.scoring_settings to service_role;
create policy "anyone can read platform config" on public.scoring_platform_config for select to anon, authenticated using (true);
create policy "anyone can read settings" on public.scoring_settings for select to anon, authenticated using (true);
create policy "admins can tune platform config" on public.scoring_platform_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can tune settings" on public.scoring_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Weekly talent scores are public too, so the app can show rankings before sign-in.
grant select on public.talent_weekly_scores to anon;
create policy "anyone can read talent scores" on public.talent_weekly_scores for select to anon using (true);

-- The system logs each size milestone once per talent.
create unique index milestones_system_once on public.milestones (talent_id, kind) where logged_by = 'system';
