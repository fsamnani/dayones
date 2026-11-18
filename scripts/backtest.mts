/// <reference types="node" />
/**
 * Backtest (PRD 5g): run the real Heat formula over the past year of Wikipedia
 * pageviews, week by week, and measure how it behaves.
 *
 *   npm run backtest            writes docs/backtest/results.json
 *
 * Uses the exact scoring pipeline the data job runs (scoring-run.ts +
 * src/lib/scoring), in dry-run mode: nothing is written to the database.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';

import * as S from '../src/lib/scoring/index.ts';
import { runScoring, type ScoredWeek } from '../supabase/functions/daily-stats/scoring-run.ts';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// --- Which talent: draftable, with a Wikipedia page and a full year of history ------
const { data: wikiAccounts, error } = await db
  .from('talent_accounts')
  .select('id, talent_id, external_id, talent!inner(name, slug, position, status)')
  .eq('platform_id', 'wikipedia')
  .eq('talent.status', 'draftable');
if (error) throw error;

const firstDay = new Map<string, string>();
const dayCount = new Map<string, number>();
for (const a of wikiAccounts ?? []) {
  const { data: first } = await db.from('stat_snapshots').select('snapshot_date').eq('talent_account_id', a.id).eq('metric', 'pageviews').order('snapshot_date').limit(1);
  const { count } = await db.from('stat_snapshots').select('*', { count: 'exact', head: true }).eq('talent_account_id', a.id).eq('metric', 'pageviews');
  if (first?.[0]) firstDay.set(a.talent_id, first[0].snapshot_date);
  dayCount.set(a.talent_id, count ?? 0);
}
const today = S.pacificDate();
const yearAgo = S.addDays(today, -365);
const sample = (wikiAccounts ?? []).filter((a) => (firstDay.get(a.talent_id) ?? '9999') <= S.addDays(yearAgo, 7) && (dayCount.get(a.talent_id) ?? 0) >= 330);
const sampleIds = new Set(sample.map((a) => a.talent_id));
const shortHistory = (wikiAccounts ?? []).filter((a) => !sampleIds.has(a.talent_id)).map((a) => (a.talent as unknown as { name: string }).name);
const talentInfo = new Map(sample.map((a) => [a.talent_id, a.talent as unknown as { name: string; slug: string; position: string }]));

// --- Weeks: every complete Monday-to-Sunday week from the first one with 4 weeks of baseline ----
const firstWeek = S.addDays(S.weekStartOf(yearAgo), 7);
const lastWeek = S.addDays(S.weekStartOf(today), -7);
const weeks: string[] = [];
for (let w = firstWeek; w <= lastWeek; w = S.addDays(w, 7)) weeks.push(w);

type Variant = { key: string; label: string; settingsOverride?: Partial<S.ScoringSettings>; floorOverride?: Record<string, number>; wikiShiftDays?: number };
const variants: Variant[] = [
  { key: 'current', label: 'Heat v2: 15 + 10 x log2, Wikipedia shifted one day (live)' },
  { key: 'v1', label: 'Heat v1: 10 x log2, floored at 0 (old)', settingsOverride: { heatBaselinePoints: 0 }, wikiShiftDays: 0 },
  { key: 'unshifted', label: 'Heat v2, Wikipedia days not shifted', wikiShiftDays: 0 },
  { key: 'floor50', label: 'Heat v2, floor 50/day', floorOverride: { wikipedia: 50 } },
  { key: 'floor200', label: 'Heat v2, floor 200/day', floorOverride: { wikipedia: 200 } },
  { key: 'baseline4', label: 'Heat v2, baseline 4 weeks', settingsOverride: { baselineWeeks: 4 } },
];

type Row = { talent_id: string; name: string; position: string; week: string; heat: number; ratio: number | null; thisWeek: number | null; baseline: number | null; note?: string };
const results: Record<string, Row[]> = {};
for (const v of variants) {
  const out = await runScoring(db, { today, weeks, write: false, force: true, settingsOverride: v.settingsOverride, floorOverride: v.floorOverride, wikiShiftDays: v.wikiShiftDays });
  results[v.key] = out.scored
    .filter((r: ScoredWeek) => sampleIds.has(r.talent_id))
    .map((r: ScoredWeek) => {
      const heat = r.details.heat as S.HeatResult;
      const wiki = heat.signals.find((s) => s.signal === 'wikipedia');
      return { talent_id: r.talent_id, name: r.name, position: talentInfo.get(r.talent_id)!.position, week: r.week_start, heat: r.heat_points, ratio: wiki?.ratio ?? null, thisWeek: wiki?.thisWeek ?? null, baseline: wiki?.baseline ?? null, note: wiki?.note };
    });
  console.log(`${v.key}: ${results[v.key].length} talent-weeks`);
}

// --- Measures ---------------------------------------------------------------
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return S.round2(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
};

/** Bins: exactly 0, then (0,5), [5,10), ... [40,50), 50. Every week lands in exactly one bin. */
export function histogram(heats: number[]) {
  const edges = [5, 10, 15, 20, 30, 40, 50];
  const bins = [{ from: 0, to: 0, count: heats.filter((h) => h === 0).length }];
  let lo = 0;
  for (const hi of edges) {
    bins.push({ from: lo, to: hi, count: heats.filter((h) => h > 0 && h >= lo && h < hi).length });
    lo = hi;
  }
  bins.push({ from: 50, to: 50, count: heats.filter((h) => h >= 50).length });
  return bins;
}

function summarize(rows: Row[]) {
  const heats = rows.map((r) => r.heat);
  const byTalent = new Map<string, Row[]>();
  for (const r of rows) (byTalent.get(r.talent_id) ?? byTalent.set(r.talent_id, []).get(r.talent_id)!).push(r);
  // 12-week seasons: every 12-week window per talent.
  const seasons: number[] = [];
  for (const rs of byTalent.values()) {
    const sorted = rs.sort((a, b) => a.week.localeCompare(b.week));
    for (let i = 0; i + 12 <= sorted.length; i += 1) seasons.push(S.round2(sorted.slice(i, i + 12).reduce((a, r) => a + r.heat, 0)));
  }
  const neverEligible = [...byTalent.values()].filter((rs) => rs.every((r) => r.note === 'below_noise_floor')).map((rs) => rs[0].name);
  const mostlyBelowFloor = [...byTalent.values()].filter((rs) => rs.filter((r) => r.note === 'below_noise_floor').length > rs.length / 2).map((rs) => rs[0].name);
  return {
    talentWeeks: rows.length,
    zeroWeeksPct: pct(heats.filter((h) => h === 0).length, heats.length),
    under5Pct: pct(heats.filter((h) => h < 5).length, heats.length),
    atLeast10Pct: pct(heats.filter((h) => h >= 10).length, heats.length),
    atLeast20Pct: pct(heats.filter((h) => h >= 20).length, heats.length),
    capHits: heats.filter((h) => h >= 50).length,
    meanHeat: S.round2(heats.reduce((a, b) => a + b, 0) / (heats.length || 1)),
    heatQuantiles: { p50: quantile(heats, 0.5), p75: quantile(heats, 0.75), p90: quantile(heats, 0.9), p99: quantile(heats, 0.99), max: Math.max(...heats) },
    season12: { p10: quantile(seasons, 0.1), p50: quantile(seasons, 0.5), p90: quantile(seasons, 0.9), max: Math.max(...seasons) },
    neverEligible,
    mostlyBelowFloor,
    histogram: histogram(heats),
  };
}

function zeroBreakdown(rows: Row[]) {
  const zero = rows.filter((r) => r.heat === 0);
  return {
    total: zero.length,
    belowFloor: zero.filter((r) => r.note === 'below_noise_floor').length,
    notEnoughHistory: zero.filter((r) => r.note === 'not_enough_history').length,
    noData: zero.filter((r) => r.note === 'no_data_this_week').length,
    veryQuiet: zero.filter((r) => !r.note).length,
  };
}

const summaries = Object.fromEntries(variants.map((v) => [v.key, { label: v.label, ...summarize(results[v.key]) }]));

const current = results.current;

// --- Did the ranking of the top 25 change between v1 and v2? -----------------
const key = (r: Row) => `${r.talent_id}|${r.week}`;
const byRatio = (rows: Row[]) => [...rows].sort((a, b) => b.heat - a.heat || (b.ratio ?? 0) - (a.ratio ?? 0));
const topV1 = byRatio(results.v1).slice(0, 25).map(key);
const topV2 = byRatio(results.current).slice(0, 25).map(key);
const rankCompare = {
  sameSet: topV1.filter((k) => topV2.includes(k)).length,
  sameOrder: topV1.every((k, i) => topV2[i] === k),
  movedPositions: topV1.map((k, i) => ({ k, v1: i + 1, v2: topV2.indexOf(k) + 1 })).filter((x) => x.v1 !== x.v2),
  tiedAtCap: results.current.filter((r) => r.heat >= 50).length,
};

// --- Reverse test: known events, did Heat fire? ------------------------------
const knownEvents = [
  { slug: 'flagrant', name: 'Flagrant', date: '2026-05-06', event: 'Akaash Singh departure confirmed by Andrew Schulz' },
  { slug: 'flagrant', name: 'Flagrant', date: '2025-12-03', event: 'Jasleen and Akaash Singh on the show addressing the controversy' },
  { slug: 'jon-pardi', name: 'Jon Pardi', date: '2026-06-12', event: 'California Sunrise 10th Anniversary Edition' },
  { slug: 'ksi', name: 'KSI', date: '2026-05-31', event: 'Announced leaving the Sidemen' },
];
const slugToId = new Map([...talentInfo.entries()].map(([id, t]) => [t.slug, id]));
const reverse = knownEvents.map((e) => {
  const id = slugToId.get(e.slug);
  const ws = S.weekStartOf(e.date);
  const pick = (rows: Row[], w: string) => rows.find((r) => r.talent_id === id && r.week === w) ?? null;
  const rows = id ? current.filter((r) => r.talent_id === id) : [];
  const sorted = [...rows].sort((a, b) => b.heat - a.heat);
  const rankOf = (w: string) => sorted.findIndex((r) => r.week === w) + 1;
  const wk = (w: string) => { const r = pick(current, w); const v1 = pick(results.v1, w); return r ? { week: w, heat: r.heat, heatV1: v1?.heat ?? null, ratio: r.ratio, viewsPerDay: r.thisWeek, baseline: r.baseline, rankInYear: rankOf(w), weeksInYear: rows.length } : { week: w, missing: true }; };
  return { ...e, eventWeek: wk(ws), nextWeek: wk(S.addDays(ws, 7)), medianHeat: quantile(rows.map((r) => r.heat), 0.5) };
});

// Context: Akaash Singh's own Wikipedia page (not tracked) around the two Flagrant events.
async function pageviews(title: string, from: string, to: string) {
  const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${from.replace(/-/g, '')}00/${to.replace(/-/g, '')}00`;
  const res = await fetch(u, { headers: { 'User-Agent': 'DayOnes/0.1 (https://github.com/fsamnani/dayones; backtest)' } });
  if (!res.ok) return null;
  const d = (await res.json()) as { items: { timestamp: string; views: number }[] };
  return d.items.map((i) => ({ date: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
}
const akaash = [];
for (const e of knownEvents.filter((x) => x.slug === 'flagrant')) {
  const ws = S.weekStartOf(e.date);
  const series = await pageviews('Akaash_Singh', S.addDays(ws, -56), S.addDays(ws, 13));
  if (!series) { akaash.push({ date: e.date, missing: true }); continue; }
  const avg = (a: string, b: string) => { const v = series.filter((x) => x.date >= a && x.date <= b).map((x) => x.views); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : 0; };
  const base = avg(S.addDays(ws, -56), S.addDays(ws, -1));
  const wkAvg = avg(ws, S.addDays(ws, 6));
  const nextAvg = avg(S.addDays(ws, 7), S.addDays(ws, 13));
  akaash.push({ date: e.date, baselinePerDay: S.round2(base), eventWeekPerDay: S.round2(wkAvg), nextWeekPerDay: S.round2(nextAvg), ratio: base ? S.round2(wkAvg / base) : null, heatIfTracked: base >= 100 ? S.round2(Math.min(50, Math.max(0, 15 + 10 * Math.log2(wkAvg / base)))) : null });
}

// --- Sunday-night shift: where do the known Sunday-night events land? ----------
const sundayEvents = [
  { name: 'Bad Bunny', event: 'Grammys (Sun Feb 1)', week: '2026-01-26' },
  { name: 'Bad Bunny', event: 'Super Bowl halftime (Sun Feb 8)', week: '2026-02-02' },
  { name: 'Karol G', event: 'Coachella weekend 1 (Sun Apr 12)', week: '2026-04-06' },
  { name: 'KSI', event: 'Left the Sidemen (Sun May 31)', week: '2026-05-25' },
];
const nameToId = new Map([...talentInfo.entries()].map(([id, t]) => [t.name, id]));
const shiftCheck = sundayEvents.map((e) => {
  const id = nameToId.get(e.name);
  const g = (rows: Row[], w: string) => rows.find((r) => r.talent_id === id && r.week === w)?.heat ?? null;
  return { ...e, unshifted: { eventWeek: g(results.unshifted, e.week), nextWeek: g(results.unshifted, S.addDays(e.week, 7)) }, shifted: { eventWeek: g(current, e.week), nextWeek: g(current, S.addDays(e.week, 7)) } };
});
const topWeeks = [...current].sort((a, b) => b.heat - a.heat || (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 25);
const perTalent = [...new Set(current.map((r) => r.talent_id))].map((id) => {
  const rs = current.filter((r) => r.talent_id === id);
  const t = talentInfo.get(id)!;
  return {
    name: t.name,
    position: t.position,
    weeks: rs.length,
    total: S.round2(rs.reduce((a, r) => a + r.heat, 0)),
    scoringWeeks: rs.filter((r) => r.heat > 0).length,
    bigWeeks: rs.filter((r) => r.heat >= 10).length,
    bestWeek: rs.reduce((a, r) => (r.heat > a.heat ? r : a), rs[0]),
    medianDailyViews: quantile(rs.map((r) => r.thisWeek ?? 0), 0.5),
    series: rs.sort((a, b) => a.week.localeCompare(b.week)).map((r) => r.heat),
  };
}).sort((a, b) => b.total - a.total);

// Weekly league-wide total: how much Heat exists in the whole pool each week.
const weekly = weeks.map((w) => ({ week: w, total: S.round2(current.filter((r) => r.week === w).reduce((a, r) => a + r.heat, 0)), scorers: current.filter((r) => r.week === w && r.heat > 0).length }));

// --- Musician Audience Index balance (today's numbers) ------------------------------
const { data: musAcc } = await db.from('talent_accounts').select('id, talent_id, platform_id, talent!inner(name, position, status)').eq('talent.position', 'musician').eq('talent.status', 'draftable').in('platform_id', ['youtube', 'lastfm']);
const { data: latest } = await db.from('talent_latest_stats').select('talent_account_id, metric, value').in('metric', ['subscribers', 'listeners']);
const latestBy = new Map((latest ?? []).map((l) => [l.talent_account_id, Number(l.value)]));
const musicians = new Map<string, { name: string; youtube: number; lastfm: number }>();
for (const a of musAcc ?? []) {
  const name = (a.talent as unknown as { name: string }).name;
  const m = musicians.get(a.talent_id) ?? { name, youtube: 0, lastfm: 0 };
  const v = latestBy.get(a.id) ?? 0;
  if (a.platform_id === 'youtube') m.youtube += v;
  else m.lastfm += v;
  musicians.set(a.talent_id, m);
}
const musicianBalance = [...musicians.values()]
  .filter((m) => m.youtube + m.lastfm > 0)
  .map((m) => ({ ...m, youtubeShare: pct(m.youtube, m.youtube + m.lastfm) }))
  .sort((a, b) => b.youtubeShare - a.youtubeShare);

const out = {
  generatedAt: new Date().toISOString(),
  today,
  weeks: { first: weeks[0], last: weeks.at(-1), count: weeks.length },
  sample: { count: sampleIds.size, byPosition: Object.fromEntries(['musician', 'creator', 'streamer'].map((p) => [p, [...talentInfo.values()].filter((t) => t.position === p).length])), excludedShortHistory: shortHistory },
  summaries,
  zeroBreakdown: Object.fromEntries(variants.map((v) => [v.key, zeroBreakdown(results[v.key])])),
  rankCompare,
  reverse,
  akaash,
  shiftCheck,
  topWeeks,
  topWeeksV1: byRatio(results.v1).slice(0, 25),
  perTalent,
  weekly,
  musicianBalance: { medianYoutubeShare: quantile(musicianBalance.map((m) => m.youtubeShare), 0.5), rows: musicianBalance },
};
mkdirSync('docs/backtest', { recursive: true });
writeFileSync('docs/backtest/results.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ rankCompare: { ...rankCompare, movedPositions: rankCompare.movedPositions.length }, reverse, akaash, shiftCheck, zero: out.zeroBreakdown }, null, 1));
console.log(JSON.stringify({ sample: out.sample, weeks: out.weeks, summaries: Object.fromEntries(Object.entries(summaries).map(([k, v]) => [k, { ...v, histogram: undefined, neverEligible: v.neverEligible.length, mostlyBelowFloor: v.mostlyBelowFloor }])) }, null, 1));
