/**
 * Weekly scoring run: reads stored stats, applies the formulas in
 * ../_shared/scoring.ts (a copy of src/lib/scoring/index.ts), and writes
 * talent_weekly_scores and scout_weekly_points.
 *
 * No formulas live here. This file only gathers the inputs for each talent
 * and week, and stores what the formulas return.
 *
 * Portable (no Deno APIs) so it can be dry-run from Node.
 */
import * as S from '../_shared/scoring.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

/** Audience metric per platform (matches platforms.audience_metric for tracked platforms). */
const AUDIENCE_METRIC: Record<string, string> = { youtube: 'subscribers', lastfm: 'listeners', twitch: 'followers' };
/** Heat metric per platform. */
const HEAT_METRIC: Record<string, string> = { youtube: 'views_7d_uploads', wikipedia: 'pageviews', twitch: 'peak_live_viewers' };
const METRICS = [...new Set([...Object.values(AUDIENCE_METRIC), ...Object.values(HEAT_METRIC)])];

type AccountRow = { id: string; talent_id: string; platform_id: string; is_primary: boolean; external_id: string | null; label: string | null };
type TalentRow = { id: string; name: string; position: string };
type Series = Map<string, number>; // date -> value

export type ScoredWeek = {
  talent_id: string;
  name: string;
  week_start: string;
  audience_index: number | null;
  growth_points: number;
  heat_points: number;
  milestone_points: number;
  total: number;
  details: Record<string, unknown>;
  is_final: boolean;
};

export type Readiness = { talent_id: string; name: string; ready: boolean; note: string };
export type ScoringOutcome = { weeks: string[]; scored: ScoredWeek[]; milestonesLogged: number; pickRows: number; skippedFinal: string[]; readiness: Readiness[] };

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export type ScoringOptions = {
  today?: string;
  weeks?: string[];
  write: boolean;
  force?: boolean;
  /** Backtests only: try other settings without touching the database config. */
  settingsOverride?: Partial<S.ScoringSettings>;
  /** Backtests only: Heat noise floor per platform, applied to every position. */
  floorOverride?: Record<string, number>;
  /** Override the wikiShiftDays setting (backtests compare shifted and unshifted). */
  wikiShiftDays?: number;
  /** Save each talent's signals-ready flag. Default: on for normal daily runs (write, no explicit weeks). */
  updateReadiness?: boolean;
};

export async function runScoring(db: Db, opts: ScoringOptions): Promise<ScoringOutcome> {
  const today = opts.today ?? S.pacificDate();
  const thisWeek = S.weekStartOf(today);
  const weeks = opts.weeks ?? [S.addDays(thisWeek, -7), thisWeek];
  const earliest = weeks.reduce((a, b) => (a < b ? a : b));

  // --- Config ---------------------------------------------------------------
  const { data: settingRows, error: sErr } = await db.from('scoring_settings').select('key, value');
  if (sErr) throw new Error(sErr.message);
  const settings: S.ScoringSettings = { ...S.DEFAULT_SETTINGS };
  for (const r of settingRows ?? []) (settings as Record<string, unknown>)[r.key] = r.value;
  Object.assign(settings, opts.settingsOverride ?? {});

  const { data: platformRows, error: pErr } = await db.from('scoring_platform_config').select('position, platform_id, audience_weight, heat_floor');
  if (pErr) throw new Error(pErr.message);
  const weights: Record<string, S.WeightMap> = {};
  const floors: Record<string, Record<string, number>> = {};
  for (const r of platformRows ?? []) {
    if (r.audience_weight !== null) (weights[r.position] ??= {})[r.platform_id] = Number(r.audience_weight);
    if (r.heat_floor !== null) (floors[r.position] ??= {})[r.platform_id] = Number(opts.floorOverride?.[r.platform_id] ?? r.heat_floor);
  }

  // --- Talent, accounts, stats ----------------------------------------------
  const { data: talent, error: tErr } = await db.from('talent').select('id, name, position').eq('status', 'draftable');
  if (tErr) throw new Error(tErr.message);
  const talentIds = new Set((talent as TalentRow[]).map((t) => t.id));

  const accounts = (await fetchAll<AccountRow>((from, to) => db.from('talent_accounts').select('id, talent_id, platform_id, is_primary, external_id, label').eq('is_active', true).order('id').range(from, to))).filter((a) =>
    talentIds.has(a.talent_id),
  );
  const accountsByTalent = new Map<string, AccountRow[]>();
  for (const a of accounts) (accountsByTalent.get(a.talent_id) ?? accountsByTalent.set(a.talent_id, []).get(a.talent_id)!).push(a);

  const historyFrom = S.addDays(earliest, -7 * (settings.baselineWeeks + 1));
  const snaps = await fetchAll<{ talent_account_id: string; metric: string; value: number; snapshot_date: string }>((from, to) =>
    db.from('stat_snapshots').select('talent_account_id, metric, value, snapshot_date').in('metric', METRICS).gte('snapshot_date', historyFrom).order('id').range(from, to),
  );
  const series = new Map<string, Series>(); // `${account}|${metric}` -> date -> value
  for (const s of snaps) {
    const key = `${s.talent_account_id}|${s.metric}`;
    // Wikipedia days are UTC; shift them for scoring buckets only (PRD 5b). Stored dates stay real.
    const shift = opts.wikiShiftDays ?? settings.wikiShiftDays ?? 0;
    const date = s.metric === 'pageviews' && shift ? S.addDays(s.snapshot_date, shift) : s.snapshot_date;
    (series.get(key) ?? series.set(key, new Map()).get(key)!).set(date, Number(s.value));
  }

  const weekDays = (ws: string) => Array.from({ length: 7 }, (_, i) => S.addDays(ws, i)).filter((d) => d <= today);
  const valuesIn = (accountId: string, metric: string, ws: string): number[] => {
    const sr = series.get(`${accountId}|${metric}`);
    if (!sr) return [];
    return weekDays(ws).filter((d) => sr.has(d)).map((d) => sr.get(d)!);
  };
  const latestIn = (accountId: string, metric: string, ws: string): number | null => {
    const v = valuesIn(accountId, metric, ws);
    return v.length ? v[v.length - 1] : null;
  };

  /** Audience per platform at the end of a week (latest reading inside the week). */
  const audienceAt = (accs: AccountRow[], ws: string): S.AudienceMap => {
    const out: S.AudienceMap = {};
    for (const a of accs) {
      const metric = AUDIENCE_METRIC[a.platform_id];
      if (!metric) continue;
      const v = latestIn(a.id, metric, ws);
      if (v !== null) out[a.platform_id] = (out[a.platform_id] ?? 0) + v;
    }
    return out;
  };

  /** One weekly number per Heat signal. `complete` weeks need most of their days. */
  const heatValue = (mine: AccountRow[], platform: string, ws: string, isBaselineWeek: boolean): number | null => {
    if (!mine.length) return null;
    let total: number | null = null;
    for (const a of mine) {
      const v = valuesIn(a.id, HEAT_METRIC[platform], ws);
      let one: number | null = null;
      if (platform === 'wikipedia') {
        // Average pageviews per day. Past weeks need at least 4 days to be a fair baseline.
        if (v.length >= (isBaselineWeek ? 4 : 1)) one = v.reduce((x, y) => x + y, 0) / v.length;
      } else if (platform === 'youtube') {
        // Views on uploads from the last 7 days, as of the latest reading in the week.
        if (v.length) one = v[v.length - 1];
      } else if (platform === 'twitch') {
        // Highest daily peak of the week.
        if (v.length) one = Math.max(...v);
      }
      if (one !== null) total = (total ?? 0) + one;
    }
    return total;
  };

  // --- Existing rows (never rewrite a final week unless forced) --------------
  const { data: existing, error: eErr } = await db.from('talent_weekly_scores').select('talent_id, week_start, is_final').in('week_start', weeks);
  if (eErr) throw new Error(eErr.message);
  const finalKeys = new Set((existing ?? []).filter((r: { is_final: boolean }) => r.is_final).map((r: { talent_id: string; week_start: string }) => `${r.talent_id}|${r.week_start}`));

  const { data: milestoneRows, error: mErr } = await db
    .from('milestones')
    .select('talent_id, kind, points, occurred_on, logged_by')
    .gte('occurred_on', earliest);
  if (mErr) throw new Error(mErr.message);
  const milestones: { talent_id: string; kind: string; points: number; occurred_on: string; logged_by: string }[] = [...(milestoneRows ?? [])];
  const { data: sysRows } = await db.from('milestones').select('talent_id, kind').eq('logged_by', 'system');
  const systemLogged = new Set((sysRows ?? []).map((r: { talent_id: string; kind: string }) => `${r.talent_id}|${r.kind}`));

  const outcome: ScoringOutcome = { weeks, scored: [], milestonesLogged: 0, pickRows: 0, skippedFinal: [], readiness: [] };
  const readinessInputs = new Map<string, { name: string; audience: S.AudienceMap; heats: S.HeatResult[] }>();
  const newMilestones: Record<string, unknown>[] = [];

  for (const ws of [...weeks].sort()) {
    const weekEnd = S.addDays(ws, 6);
    // Final two days after the week ends, so late-arriving Sunday data is in.
    const isFinal = today >= S.addDays(ws, 8);

    for (const t of talent as TalentRow[]) {
      const accs = accountsByTalent.get(t.id) ?? [];
      const w = weights[t.position] ?? {};
      const curr = audienceAt(accs, ws);
      const prevRaw = audienceAt(accs, S.addDays(ws, -7));
      const prev = Object.keys(prevRaw).length ? prevRaw : null;
      const growth = S.growthPoints(prev, curr, w, settings);

      // One Heat signal per active account, so a show's host pages each count on their own
      // and the strongest wins (PRD 5b). Named "wikipedia" or "wikipedia:<host>" when a
      // talent has several pages on one platform.
      const signals: S.HeatSignalInput[] = accs
        .filter((a) => HEAT_METRIC[a.platform_id] && floors[t.position]?.[a.platform_id] !== undefined)
        .map((a) => {
          const several = accs.filter((x) => x.platform_id === a.platform_id).length > 1;
          return {
            signal: several ? `${a.platform_id}:${a.label ?? a.external_id ?? a.id}` : a.platform_id,
            thisWeek: heatValue([a], a.platform_id, ws, false),
            priorWeeks: Array.from({ length: settings.baselineWeeks }, (_, k) => heatValue([a], a.platform_id, S.addDays(ws, -7 * (k + 1)), true)),
            floor: floors[t.position][a.platform_id],
          };
        });
      const heat = S.heatPoints(signals, settings);
      const rd = readinessInputs.get(t.id) ?? readinessInputs.set(t.id, { name: t.name, audience: {}, heats: [] }).get(t.id)!;
      rd.heats.push(heat);
      if (Object.keys(curr).length) rd.audience = curr;

      // Size milestones, logged once each. Size = talentSize (musicians: larger of YouTube and Last.fm).
      const primary = accs.find((a) => a.is_primary);
      {
        const before = S.talentSize(t.position, primary?.platform_id ?? null, prevRaw);
        const after = S.talentSize(t.position, primary?.platform_id ?? null, curr);
        for (const m of S.crossedSizeMilestones(before, after, settings)) {
          const kind = `crossed_${m.threshold}`;
          if (systemLogged.has(`${t.id}|${kind}`)) continue;
          systemLogged.add(`${t.id}|${kind}`);
          const occurred = today < weekEnd ? today : weekEnd;
          milestones.push({ talent_id: t.id, kind, points: m.points, occurred_on: occurred, logged_by: 'system' });
          newMilestones.push({ talent_id: t.id, kind, points: m.points, occurred_on: occurred, logged_by: 'system', description: `Crossed ${m.threshold.toLocaleString('en-US')} (${t.position === 'musician' ? 'YouTube or Last.fm, whichever is larger' : primary?.platform_id})` });
        }
      }
      const weekMilestones = milestones.filter((m) => m.talent_id === t.id && m.occurred_on >= ws && m.occurred_on <= weekEnd);
      const milestonePoints = weekMilestones.reduce((a, m) => a + Number(m.points), 0);

      const hasAnyData = Object.keys(curr).length > 0 || signals.some((s) => s.thisWeek !== null);
      if (!hasAnyData) continue;
      if (finalKeys.has(`${t.id}|${ws}`) && !opts.force) {
        outcome.skippedFinal.push(`${t.name} ${ws}`);
        continue;
      }

      const fullIndex = S.audienceIndex(curr, w);
      outcome.scored.push({
        talent_id: t.id,
        name: t.name,
        week_start: ws,
        audience_index: Object.keys(curr).length ? fullIndex : null,
        growth_points: growth.points,
        heat_points: heat.points,
        milestone_points: milestonePoints,
        total: S.weeklyTotal(growth.points, heat.points, milestonePoints),
        details: { audience: curr, growth, heat, milestones: weekMilestones.map((m) => ({ kind: m.kind, points: m.points })) },
        is_final: isFinal,
      });
    }
  }

  // Signals ready (PRD 4): an audience reading plus a countable Heat signal in either week checked.
  for (const t of talent as TalentRow[]) {
    const rd = readinessInputs.get(t.id) ?? { name: t.name, audience: {}, heats: [] };
    const r = S.signalsReady(rd.audience, weights[t.position] ?? {}, rd.heats);
    outcome.readiness.push({ talent_id: t.id, name: t.name, ...r });
  }

  if (!opts.write) return outcome;

  if (opts.updateReadiness ?? !opts.weeks) {
    const checkedAt = new Date().toISOString();
    for (const r of outcome.readiness) {
      const { error } = await db.from('talent').update({ signals_ready: r.ready, signals_note: r.note, signals_checked_at: checkedAt }).eq('id', r.talent_id);
      if (error) throw new Error(`readiness: ${error.message}`);
    }
  }

  // --- Write ----------------------------------------------------------------
  if (newMilestones.length) {
    const { error } = await db.from('milestones').insert(newMilestones);
    if (error) throw new Error(`milestones: ${error.message}`);
    outcome.milestonesLogged = newMilestones.length;
  }
  const now = new Date().toISOString();
  for (let i = 0; i < outcome.scored.length; i += 500) {
    const rows = outcome.scored.slice(i, i + 500).map((r) => ({
      talent_id: r.talent_id,
      week_start: r.week_start,
      audience_index: r.audience_index,
      growth_points: r.growth_points,
      heat_points: r.heat_points,
      milestone_points: r.milestone_points,
      details: r.details,
      is_final: r.is_final,
      computed_at: now,
    }));
    const { error } = await db.from('talent_weekly_scores').upsert(rows, { onConflict: 'talent_id,week_start' });
    if (error) throw new Error(`scores: ${error.message}`);
  }

  // Pick points: pro-rated by the days the pick was on the roster that week (PRD 7).
  const picks = await fetchAll<{ id: string; talent_id: string; multiplier: number; picked_at: string; dropped_at: string | null }>((from, to) =>
    db.from('picks').select('id, talent_id, multiplier, picked_at, dropped_at').order('id').range(from, to),
  );
  const pickRows: Record<string, unknown>[] = [];
  for (const r of outcome.scored) {
    for (const p of picks) {
      if (p.talent_id !== r.talent_id) continue;
      const days = S.daysOnRoster(r.week_start, S.pacificDate(new Date(p.picked_at)), p.dropped_at ? S.pacificDate(new Date(p.dropped_at)) : null);
      if (days === 0) continue;
      pickRows.push({ pick_id: p.id, week_start: r.week_start, base_points: r.total, multiplier: p.multiplier, points: S.pickPoints({ growth: r.growth_points, heat: r.heat_points, milestones: r.milestone_points }, Number(p.multiplier), days, settings), computed_at: now });
    }
  }
  for (let i = 0; i < pickRows.length; i += 500) {
    const { error } = await db.from('scout_weekly_points').upsert(pickRows.slice(i, i + 500), { onConflict: 'pick_id,week_start' });
    if (error) throw new Error(`pick points: ${error.message}`);
  }
  outcome.pickRows = pickRows.length;
  return outcome;
}
