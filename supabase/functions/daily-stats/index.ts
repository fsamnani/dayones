/**
 * daily-stats: collects talent stats and stores daily snapshots.
 *
 *   ?task=daily          once a day: YouTube, Last.fm, Wikipedia (yesterday), Twitch followers,
 *                        plus yesterday's live-viewer roll-up for streamers
 *   ?task=live           every 20 minutes: who is live on Twitch and with how many viewers
 *   ?task=wiki-backfill  once: Wikipedia pageviews history (default 366 days, &days=N up to 1100)
 *   ?task=score          recompute weekly scores (also runs at the end of every daily run).
 *                        Optional &week=YYYY-MM-DD (a Monday) and &force=1 to redo a final week
 *
 * Called by pg_cron (see migration 20261115000000) with "Authorization: Bearer <CRON_SECRET>".
 * Runs as the service role: it is the only thing allowed to write stats.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  type Account,
  type StatRow,
  PACIFIC,
  dateIn,
  daysAgoUtc,
  lastfmArtist,
  pool,
  twitchAppToken,
  twitchFollowers,
  twitchLive,
  wikipediaPageviews,
  youtubeChannelStats,
  youtubeRecentUploads,
} from './collectors.ts';
import { runScoring } from './scoring-run.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Run = { id: number; errors: string[]; snapshots: number; talent: Set<string>; notes?: string };

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? '';
  const secret = env('CRON_SECRET');
  if (!secret || auth !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });

  const task = new URL(req.url).searchParams.get('task') ?? 'daily';
  if (!['daily', 'live', 'wiki-backfill', 'score'].includes(task)) return new Response(`Unknown task ${task}`, { status: 400 });

  const { data: started, error: startError } = await db.from('job_runs').insert({ task }).select('id').single();
  if (startError) return new Response(startError.message, { status: 500 });
  const run: Run = { id: started.id, errors: [], snapshots: 0, talent: new Set() };

  try {
    const params = new URL(req.url).searchParams;
    if (task === 'daily') {
      await runDaily(run);
      await score(run, {});
    } else if (task === 'live') await runLive(run);
    else if (task === 'score') await score(run, { week: params.get('week') ?? undefined, force: params.get('force') === '1' });
    else await runWikiBackfill(run, Math.min(Number(params.get('days') ?? 366) || 366, 1100));
  } catch (e) {
    run.errors.push(`fatal: ${String(e)}`);
  }

  const status = run.errors.some((e) => e.startsWith('fatal')) ? 'error' : run.errors.length ? 'partial' : 'ok';
  await db
    .from('job_runs')
    .update({ finished_at: new Date().toISOString(), status, talent_updated: run.talent.size, snapshots_written: run.snapshots, errors: run.errors, notes: run.notes ?? null })
    .eq('id', run.id);

  return Response.json({ run: run.id, task, status, talent_updated: run.talent.size, snapshots_written: run.snapshots, errors: run.errors, notes: run.notes ?? null });
});

// ---------------------------------------------------------------------------

/** Weekly scores for last week and this week so far. Formulas live in _shared/scoring.ts. */
async function score(run: Run, opts: { week?: string; force?: boolean }) {
  try {
    const out = await runScoring(db, { weeks: opts.week ? [opts.week] : undefined, force: opts.force, write: true });
    run.notes = `scored ${out.scored.length} talent-weeks for ${out.weeks.join(', ')}; ${out.milestonesLogged} milestones; ${out.pickRows} pick rows`;
    if (run.talent.size === 0) for (const r of out.scored) run.talent.add(r.talent_id);
  } catch (e) {
    run.errors.push(`scoring: ${String(e)}`);
  }
}

async function trackedAccounts(platform?: string): Promise<Account[]> {
  let q = db
    .from('talent_accounts')
    .select('id, talent_id, platform_id, external_id, url, talent!inner(status)')
    .neq('talent.status', 'retired')
    .not('external_id', 'is', null);
  if (platform) q = q.eq('platform_id', platform);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(({ talent: _t, ...a }) => a as Account);
}

/** Insert snapshots, skipping any (account, metric, date) already stored. History is never overwritten. */
async function writeStats(run: Run, rows: StatRow[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    const { error } = await db
      .from('stat_snapshots')
      .upsert(batch, { onConflict: 'talent_account_id,metric,snapshot_date', ignoreDuplicates: true });
    if (error) throw new Error(`write: ${error.message}`);
    run.snapshots += batch.length;
  }
}

function settle<T>(run: Run, label: string, results: PromiseSettledResult<T>[], items: { url: string }[]): T[] {
  const ok: T[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else run.errors.push(`${label} ${items[i].url}: ${String(r.reason).slice(0, 200)}`);
  });
  return ok;
}

async function runDaily(run: Run) {
  const today = dateIn(PACIFIC);
  const accounts = await trackedAccounts();
  const byPlatform = (p: string) => accounts.filter((a) => a.platform_id === p);
  const note = (rows: StatRow[], accs: Account[]) => {
    for (const r of rows) {
      const acc = accs.find((a) => a.id === r.talent_account_id);
      if (acc) run.talent.add(acc.talent_id);
    }
  };

  // YouTube: totals in bulk, then recent uploads per channel.
  const yt = byPlatform('youtube');
  if (yt.length && env('YOUTUBE_API_KEY')) {
    try {
      const { rows, missing } = await youtubeChannelStats(yt, env('YOUTUBE_API_KEY'), today);
      for (const m of missing) run.errors.push(`youtube channel not found: ${m.url}`);
      await writeStats(run, rows);
      note(rows, yt);
    } catch (e) {
      run.errors.push(`youtube totals: ${String(e)}`);
    }
    const results = await pool(yt, 6, (acc) => youtubeRecentUploads(acc, env('YOUTUBE_API_KEY'), today));
    const rows = settle(run, 'youtube uploads', results, yt).flat();
    await writeStats(run, rows);
    note(rows, yt);
  } else if (yt.length) run.errors.push('YOUTUBE_API_KEY not set');

  // Last.fm
  const lf = byPlatform('lastfm');
  if (lf.length && env('LASTFM_API_KEY')) {
    const results = await pool(lf, 4, (acc) => lastfmArtist(acc, env('LASTFM_API_KEY'), today));
    const rows = settle(run, 'lastfm', results, lf).flat();
    await writeStats(run, rows);
    note(rows, lf);
  } else if (lf.length) run.errors.push('LASTFM_API_KEY not set');

  // Wikipedia: yesterday's pageviews (UTC day), the most recent complete day.
  const wk = byPlatform('wikipedia');
  if (wk.length) {
    const yesterday = daysAgoUtc(1);
    // One at a time: Wikimedia throttles shared cloud addresses hard.
    const results = await pool(wk, 1, (acc) => wikipediaPageviews(acc, daysAgoUtc(3), yesterday));
    const rows = settle(run, 'wikipedia', results, wk).flat();
    await writeStats(run, rows);
    note(rows, wk);
  }

  // Twitch: followers, plus yesterday's live roll-up.
  const tw = byPlatform('twitch');
  if (tw.length && env('TWITCH_CLIENT_ID') && env('TWITCH_CLIENT_SECRET')) {
    try {
      const token = await twitchAppToken(env('TWITCH_CLIENT_ID'), env('TWITCH_CLIENT_SECRET'));
      const results = await pool(tw, 4, (acc) => twitchFollowers(acc, env('TWITCH_CLIENT_ID'), token, today));
      const rows = settle(run, 'twitch', results, tw).flat();
      await writeStats(run, rows);
      note(rows, tw);
    } catch (e) {
      run.errors.push(`twitch: ${String(e)}`);
    }
    await rollupLive(run, tw);
  } else if (tw.length) run.errors.push('TWITCH keys not set');
}

/** Turn yesterday's 20-minute live samples into two daily numbers per streamer. */
async function rollupLive(run: Run, tw: Account[]) {
  const yesterday = dateIn(PACIFIC, new Date(Date.now() - 24 * 3600 * 1000));
  // Pull the last two days of samples and keep the ones that fall on yesterday, Pacific time.
  const { data, error } = await db
    .from('live_samples')
    .select('talent_account_id, sampled_at, viewers')
    .gte('sampled_at', new Date(Date.now() - 50 * 3600 * 1000).toISOString());
  if (error) {
    run.errors.push(`live rollup: ${error.message}`);
    return;
  }
  const byAccount = new Map<string, { peak: number; samples: number }>();
  for (const s of data ?? []) {
    if (dateIn(PACIFIC, new Date(s.sampled_at)) !== yesterday) continue;
    const cur = byAccount.get(s.talent_account_id) ?? { peak: 0, samples: 0 };
    cur.peak = Math.max(cur.peak, s.viewers);
    cur.samples += 1;
    byAccount.set(s.talent_account_id, cur);
  }
  const rows: StatRow[] = [];
  for (const acc of tw) {
    const agg = byAccount.get(acc.id) ?? { peak: 0, samples: 0 };
    rows.push({ talent_account_id: acc.id, metric: 'peak_live_viewers', value: agg.peak, snapshot_date: yesterday, source: 'twitch_helix', source_url: acc.url });
    rows.push({ talent_account_id: acc.id, metric: 'hours_live', value: Math.round((agg.samples / 3) * 10) / 10, snapshot_date: yesterday, source: 'twitch_helix', source_url: acc.url });
  }
  await writeStats(run, rows);
}

async function runLive(run: Run) {
  const tw = await trackedAccounts('twitch');
  if (!tw.length) return;
  if (!env('TWITCH_CLIENT_ID') || !env('TWITCH_CLIENT_SECRET')) {
    run.errors.push('TWITCH keys not set');
    return;
  }
  const token = await twitchAppToken(env('TWITCH_CLIENT_ID'), env('TWITCH_CLIENT_SECRET'));
  const samples = await twitchLive(tw, env('TWITCH_CLIENT_ID'), token);
  if (samples.length) {
    const { error } = await db.from('live_samples').insert(samples);
    if (error) throw new Error(`live write: ${error.message}`);
  }
  run.snapshots = samples.length;
  for (const s of samples) run.talent.add(tw.find((a) => a.id === s.talent_account_id)!.talent_id);
}

async function runWikiBackfill(run: Run, days = 366) {
  const wk = await trackedAccounts('wikipedia');
  const results = await pool(wk, 1, (acc) => wikipediaPageviews(acc, daysAgoUtc(days), daysAgoUtc(1)));
  const rows = settle(run, 'wikipedia backfill', results, wk).flat();
  await writeStats(run, rows);
  for (const r of rows) run.talent.add(wk.find((a) => a.id === r.talent_account_id)!.talent_id);
}
