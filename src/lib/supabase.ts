import { createClient } from '@supabase/supabase-js';

// These two values are public by design (safe to ship inside the app).
// Real values live in .env, which is never committed.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      // Sign-in storage gets set up when we build accounts (step 9 area).
      auth: { persistSession: false },
    })
  : null;

export type ConnectionStatus = 'missing-keys' | 'connected' | 'no-tables' | 'bad-key' | 'unreachable';

export type ConnectionResult = { status: ConnectionStatus; talentCount: number | null };

export type LastUpdate = { finishedAt: string; talentUpdated: number; status: string } | null;

/** When the daily data job last finished, and how many talent it updated. */
export async function lastDataUpdate(): Promise<LastUpdate> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('job_runs')
    .select('finished_at, talent_updated, status')
    .eq('task', 'daily')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { finishedAt: data.finished_at, talentUpdated: data.talent_updated, status: data.status };
}

/**
 * Pings the database by counting talent. "no-tables" means the keys work
 * but the schema hasn't been applied yet.
 */
export async function checkConnection(): Promise<ConnectionResult> {
  if (!supabase) return { status: 'missing-keys', talentCount: null };
  try {
    // A real read (not a HEAD request): HEAD hides "table not found" errors.
    // The pool: talent that can be drafted today (curated draftable AND signals ready, PRD 4).
    const { count, error } = await supabase.from('talent').select('id', { count: 'exact' }).eq('status', 'draftable').eq('signals_ready', true).limit(1);
    if (!error && count !== null) return { status: 'connected', talentCount: count };
    if (!error) return { status: 'no-tables', talentCount: null };
    if (error.code === 'PGRST205' || error.code === '42P01') return { status: 'no-tables', talentCount: null };
    if (/jwt|api key|apikey|unauthorized|invalid/i.test(error.message)) return { status: 'bad-key', talentCount: null };
    return { status: 'unreachable', talentCount: null };
  } catch {
    return { status: 'unreachable', talentCount: null };
  }
}

export type TopScore = {
  name: string;
  weekStart: string;
  total: number;
  growth: number;
  heat: number;
  milestones: number;
  heatWinner: string | null;
  heatRatio: number | null;
  isFinal: boolean;
};

/** The highest-scoring talent of the most recent scored week. */
export async function topScores(limit = 5): Promise<TopScore[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('talent_weekly_scores')
    .select('week_start, total_points, growth_points, heat_points, milestone_points, is_final, details, talent(name)')
    .order('week_start', { ascending: false })
    .order('total_points', { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as unknown as {
    week_start: string;
    total_points: number;
    growth_points: number;
    heat_points: number;
    milestone_points: number;
    is_final: boolean;
    details: { heat?: { winner: string | null; ratio: number | null } } | null;
    talent: { name: string } | null;
  }[];
  const latest = rows[0]?.week_start;
  return rows
    .filter((r) => r.week_start === latest)
    .map((r) => ({
      name: r.talent?.name ?? 'Unknown',
      weekStart: r.week_start,
      total: Number(r.total_points),
      growth: Number(r.growth_points),
      heat: Number(r.heat_points),
      milestones: Number(r.milestone_points),
      heatWinner: r.details?.heat?.winner ?? null,
      heatRatio: r.details?.heat?.ratio ?? null,
      isFinal: r.is_final,
    }));
}
