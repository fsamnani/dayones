/**
 * DayOnes scoring. The single source of truth for every formula in PRD section 5.
 *
 * Pure functions only: no database, no network, no imports. That lets the app,
 * the tests, and the server-side data job all run exactly the same code.
 * (The data job uses a copy at supabase/functions/_shared/scoring.ts, made by
 * `npm run functions:deploy`; a test fails if the two files ever differ.)
 *
 * North star: scoring measures how much public attention a talent commands.
 * If points disagree with what is obviously happening, the formula is wrong.
 */

// ---------------------------------------------------------------------------
// Settings (defaults mirror the scoring_settings table; the table wins)
// ---------------------------------------------------------------------------
export type MultiplierTier = { minSize: number; multiplier: number };
export type SizeMilestone = { threshold: number; points: number };

export type ScoringSettings = {
  /** Growth: points for a 10x increase in Audience Index. */
  growthPointsPer10x: number;
  /** Heat: points each time attention doubles versus baseline. */
  heatPointsPerDoubling: number;
  /** Heat: points for a normal week (attention equal to the talent's own baseline). */
  heatBaselinePoints: number;
  /** Heat: maximum points per week. */
  heatCap: number;
  /** Heat: how many past weeks make up the baseline. */
  baselineWeeks: number;
  /** Heat: a signal needs at least this many past weeks of data to count. */
  minBaselineWeeks: number;
  /** Day One multiplier by size at draft. */
  multiplierTiers: MultiplierTier[];
  /** Smallest size that can be drafted. */
  minDraftableSize: number;
  /** Bonus for crossing a size on the primary platform. */
  sizeMilestones: SizeMilestone[];
};

export const DEFAULT_SETTINGS: ScoringSettings = {
  growthPointsPer10x: 100,
  heatPointsPerDoubling: 10,
  heatBaselinePoints: 15,
  heatCap: 50,
  baselineWeeks: 8,
  minBaselineWeeks: 4,
  multiplierTiers: [
    { minSize: 1_000_000, multiplier: 1 },
    { minSize: 100_000, multiplier: 1.5 },
    { minSize: 10_000, multiplier: 2 },
    { minSize: 1_000, multiplier: 3 },
  ],
  minDraftableSize: 1_000,
  sizeMilestones: [
    { threshold: 100_000, points: 20 },
    { threshold: 1_000_000, points: 40 },
    { threshold: 10_000_000, points: 60 },
  ],
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 5a. Audience Index and Growth
// ---------------------------------------------------------------------------
/** Audience size per platform, e.g. { youtube: 997000, lastfm: 545340 }. */
export type AudienceMap = Record<string, number>;
/** Weight per platform for a position. Missing or 0 = platform does not count. */
export type WeightMap = Record<string, number>;

/** Audience Index = sum of (platform audience x platform weight). */
export function audienceIndex(audience: AudienceMap, weights: WeightMap, onlyPlatforms?: string[]): number {
  let total = 0;
  for (const [platform, size] of Object.entries(audience)) {
    if (onlyPlatforms && !onlyPlatforms.includes(platform)) continue;
    total += size * (weights[platform] ?? 0);
  }
  return total;
}

export type GrowthResult = {
  points: number;
  /** Index last week and this week, over the platforms present in both. */
  prevIndex: number | null;
  currIndex: number | null;
  /** Platforms that counted. */
  platforms: string[];
  /** Why points are 0 when there was nothing to compare. */
  note?: 'first_week' | 'no_common_platforms';
};

/**
 * Growth points = 100 x log10(index this week / index last week).
 * Every 10x is worth 100, every 2x about 30. Shrinking gives negative points.
 * Only platforms present in both weeks are compared, so a platform that failed
 * to report one week cannot create fake growth.
 */
export function growthPoints(prev: AudienceMap | null, curr: AudienceMap, weights: WeightMap, s: ScoringSettings = DEFAULT_SETTINGS): GrowthResult {
  if (!prev || Object.keys(prev).length === 0) {
    return { points: 0, prevIndex: null, currIndex: null, platforms: [], note: 'first_week' };
  }
  const platforms = Object.keys(curr).filter((p) => (weights[p] ?? 0) > 0 && prev[p] > 0 && curr[p] > 0).sort();
  if (platforms.length === 0) {
    return { points: 0, prevIndex: null, currIndex: null, platforms: [], note: 'no_common_platforms' };
  }
  const prevIndex = audienceIndex(prev, weights, platforms);
  const currIndex = audienceIndex(curr, weights, platforms);
  return { points: round2(s.growthPointsPer10x * Math.log10(currIndex / prevIndex)), prevIndex, currIndex, platforms };
}

// ---------------------------------------------------------------------------
// 5b. Heat
// ---------------------------------------------------------------------------
export type HeatSignalInput = {
  /** e.g. wikipedia, youtube, twitch */
  signal: string;
  /** This week's value, or null if no data. */
  thisWeek: number | null;
  /** Past weeks, most recent first. null = no data that week. */
  priorWeeks: (number | null)[];
  /** Noise floor: the baseline must be at least this for the signal to count. */
  floor: number;
};

export type HeatSignalResult = {
  signal: string;
  thisWeek: number | null;
  baseline: number | null;
  weeksOfHistory: number;
  eligible: boolean;
  /** Why it did not count. */
  note?: 'no_data_this_week' | 'not_enough_history' | 'below_noise_floor';
  ratio: number | null;
  points: number;
};

export type HeatResult = {
  points: number;
  /** The signal that won, if any signal scored above 0. */
  winner: string | null;
  ratio: number | null;
  signals: HeatSignalResult[];
};

/**
 * Heat = the strongest signal's 15 + 10 x log2(this week / its own baseline),
 * clamped to 0..50. Every talent with an eligible signal gets a stat line every
 * week, like a running back: half normal = 5, normal = 15, 2x = 25, 8x = 45.
 * Baseline = average of the talent's own previous weeks (up to 8).
 * A signal only counts with enough history and a baseline above its noise floor.
 */
export function heatPoints(signals: HeatSignalInput[], s: ScoringSettings = DEFAULT_SETTINGS): HeatResult {
  const results: HeatSignalResult[] = signals.map((sig) => {
    const history = sig.priorWeeks.slice(0, s.baselineWeeks).filter((v): v is number => v !== null);
    const baseline = history.length ? history.reduce((a, b) => a + b, 0) / history.length : null;
    const base = { signal: sig.signal, thisWeek: sig.thisWeek, baseline: baseline === null ? null : round2(baseline), weeksOfHistory: history.length };
    if (sig.thisWeek === null) return { ...base, eligible: false, note: 'no_data_this_week', ratio: null, points: 0 };
    if (history.length < s.minBaselineWeeks || baseline === null) return { ...base, eligible: false, note: 'not_enough_history', ratio: null, points: 0 };
    if (baseline < sig.floor || baseline <= 0) return { ...base, eligible: false, note: 'below_noise_floor', ratio: null, points: 0 };
    const ratio = sig.thisWeek / baseline;
    const raw = ratio > 0 ? s.heatBaselinePoints + s.heatPointsPerDoubling * Math.log2(ratio) : 0;
    return { ...base, eligible: true, ratio: round2(ratio), points: round2(Math.min(s.heatCap, Math.max(0, raw))) };
  });

  let best: HeatSignalResult | null = null;
  for (const r of results) {
    if (r.eligible && r.ratio !== null && (best === null || r.ratio > best.ratio!)) best = r;
  }
  return { points: best?.points ?? 0, winner: best ? best.signal : null, ratio: best?.ratio ?? null, signals: results };
}

// ---------------------------------------------------------------------------
// 5c. Size milestones
// ---------------------------------------------------------------------------
/** Thresholds crossed going from prevSize to currSize (e.g. 95k -> 120k crosses 100k). */
export function crossedSizeMilestones(prevSize: number | null, currSize: number | null, s: ScoringSettings = DEFAULT_SETTINGS): SizeMilestone[] {
  if (prevSize === null || currSize === null) return [];
  return s.sizeMilestones.filter((m) => prevSize < m.threshold && currSize >= m.threshold);
}

// ---------------------------------------------------------------------------
// Size: what the Day One multiplier and size milestones measure
// ---------------------------------------------------------------------------
/**
 * A talent's size. Musicians: the larger of YouTube subscribers and Last.fm
 * listeners (their biggest tracked platform). Everyone else: their primary
 * platform's audience. Returns null when there is no reading.
 */
export function talentSize(position: string, primaryPlatform: string | null, audience: AudienceMap): number | null {
  if (position === 'musician') {
    const vals = [audience.youtube, audience.lastfm].filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
  }
  if (!primaryPlatform) return null;
  return audience[primaryPlatform] ?? null;
}

// ---------------------------------------------------------------------------
// 5d. Day One multiplier
// ---------------------------------------------------------------------------
/**
 * Multiplier locked in at draft, from the follower count on the talent's
 * primary platform. Returns null if they are too small to draft.
 */
export function dayOneMultiplier(sizeAtDraft: number, s: ScoringSettings = DEFAULT_SETTINGS): number | null {
  if (sizeAtDraft < s.minDraftableSize) return null;
  const tiers = [...s.multiplierTiers].sort((a, b) => b.minSize - a.minSize);
  for (const tier of tiers) if (sizeAtDraft >= tier.minSize) return tier.multiplier;
  return null;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------
/** A talent's weekly points before any multiplier. */
export function weeklyTotal(growth: number, heat: number, milestones: number): number {
  return round2(growth + heat + milestones);
}

/**
 * A pick's weekly points: the talent's total times the pick's Day One multiplier,
 * pro-rated by the share of the week the pick was on the roster (PRD 7).
 */
export function pickPoints(talentTotal: number, multiplier: number, daysOnRoster = 7): number {
  return round2(talentTotal * multiplier * (Math.max(0, Math.min(7, daysOnRoster)) / 7));
}

/**
 * Days in a Monday-to-Sunday week that a pick was on the roster (Pacific dates).
 * The draft day counts; the drop day does not. 0 if the pick missed the week.
 */
export function daysOnRoster(weekStart: string, pickedOn: string, droppedOn: string | null): number {
  let days = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (d >= pickedOn && (droppedOn === null || d < droppedOn)) days++;
  }
  return days;
}

// ---------------------------------------------------------------------------
// Weeks: Monday through Sunday, Pacific time. Dates are YYYY-MM-DD strings.
// ---------------------------------------------------------------------------
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Today's date in Pacific time. */
export function pacificDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
