-- Daily data job: run log, live-viewer samples, and schedules.

-- ---------------------------------------------------------------------------
-- Job runs: one row per run of the data job, so we can see it working
-- (or failing) instead of silently losing days of history.
-- ---------------------------------------------------------------------------
create table public.job_runs (
  id bigint generated always as identity primary key,
  task text not null,                       -- daily, live, wiki-backfill
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  talent_updated integer not null default 0,
  snapshots_written integer not null default 0,
  errors jsonb not null default '[]',
  notes text
);
create index job_runs_task_idx on public.job_runs (task, started_at desc);

-- ---------------------------------------------------------------------------
-- Live samples: streamer viewer counts every 20 minutes while live.
-- Rolled up into daily snapshots (peak_live_viewers, hours_live). Append-only.
-- ---------------------------------------------------------------------------
create table public.live_samples (
  id bigint generated always as identity primary key,
  talent_account_id uuid not null references public.talent_accounts (id) on delete restrict,
  sampled_at timestamptz not null default now(),
  viewers integer not null check (viewers >= 0),
  title text,
  category text,
  source text not null
);
create index live_samples_account_time_idx on public.live_samples (talent_account_id, sampled_at desc);

create trigger live_samples_append_only
  before update or delete on public.live_samples
  for each row execute function public.block_changes();

-- ---------------------------------------------------------------------------
-- Access: scouts can read the run log (so the app can show "last updated")
-- and live samples. Only the job (service role) writes them.
-- ---------------------------------------------------------------------------
alter table public.job_runs enable row level security;
alter table public.live_samples enable row level security;
grant all on public.job_runs, public.live_samples to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.job_runs to anon, authenticated;
grant select on public.live_samples to authenticated;
create policy "anyone can read job runs" on public.job_runs for select to anon, authenticated using (true);
create policy "scouts can read live samples" on public.live_samples for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Secret used by the schedules to call the job. Stored in Supabase Vault,
-- never in this file. Set once with: select set_job_secret('...') as service role.
-- ---------------------------------------------------------------------------
create function public.set_job_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'daily_stats_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'daily_stats_secret', 'Bearer token the cron schedules send to the daily-stats function');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;
revoke all on function public.set_job_secret(text) from public, anon, authenticated;
grant execute on function public.set_job_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- Schedules (pg_cron calls the edge function over HTTP via pg_net).
-- Times are UTC: 11:00 UTC = 3am Pacific (4am during daylight saving).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create function public.call_daily_stats(p_task text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://bafhhlncbuqdhkpvsydw.supabase.co/functions/v1/daily-stats?task=' || p_task,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_stats_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$;
revoke all on function public.call_daily_stats(text) from public, anon, authenticated;

select cron.schedule('daily-stats', '0 11 * * *', $$select public.call_daily_stats('daily')$$);
select cron.schedule('live-viewers', '*/20 * * * *', $$select public.call_daily_stats('live')$$);
