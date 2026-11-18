import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  addDays,
  audienceIndex,
  crossedSizeMilestones,
  dayOneMultiplier,
  growthPoints,
  heatPoints,
  daysOnRoster,
  pacificDate,
  pickPoints,
  signalsReady,
  talentSize,
  weekStartOf,
  weeklyTotal,
} from './index';

const W = { youtube: 1, lastfm: 1, twitch: 1 };
const eightWeeks = (v: number) => Array(8).fill(v);

describe('Audience Index (PRD 5a)', () => {
  it('sums audience x weight across platforms', () => {
    expect(audienceIndex({ youtube: 997_000, lastfm: 545_340 }, W)).toBe(1_542_340);
  });
  it('respects tuned weights', () => {
    expect(audienceIndex({ youtube: 1000, lastfm: 1000 }, { youtube: 1, lastfm: 3 })).toBe(4000);
  });
  it('ignores platforms with no weight (e.g. wikipedia)', () => {
    expect(audienceIndex({ youtube: 1000, wikipedia: 99999 }, W)).toBe(1000);
  });
});

describe('Growth points (PRD 5a)', () => {
  it('10x audience = 100 points', () => {
    expect(growthPoints({ youtube: 5_000 }, { youtube: 50_000 }, W).points).toBe(100);
  });
  it('2x audience = about 30 points', () => {
    expect(growthPoints({ youtube: 200_000 }, { youtube: 400_000 }, W).points).toBeCloseTo(30.1, 1);
  });
  it('doubling counts the same at any size', () => {
    const small = growthPoints({ youtube: 5_000 }, { youtube: 10_000 }, W).points;
    const big = growthPoints({ youtube: 5_000_000 }, { youtube: 10_000_000 }, W).points;
    expect(small).toBe(big);
  });
  it('Drake 75M to 80M = about 3 points', () => {
    expect(growthPoints({ youtube: 75_000_000 }, { youtube: 80_000_000 }, W).points).toBeCloseTo(2.8, 1);
  });
  it('shrinking audience gives negative points', () => {
    expect(growthPoints({ youtube: 100_000 }, { youtube: 90_000 }, W).points).toBeLessThan(0);
  });
  it('first week (nothing to compare) = 0', () => {
    const g = growthPoints(null, { youtube: 100_000 }, W);
    expect(g.points).toBe(0);
    expect(g.note).toBe('first_week');
  });
  it('a platform missing one week cannot create fake growth', () => {
    // Last.fm failed to report last week. Only YouTube is compared.
    const g = growthPoints({ youtube: 100_000 }, { youtube: 100_000, lastfm: 500_000 }, W);
    expect(g.points).toBe(0);
    expect(g.platforms).toEqual(['youtube']);
  });
  it('a platform missing this week is also left out', () => {
    const g = growthPoints({ youtube: 100_000, lastfm: 500_000 }, { youtube: 110_000 }, W);
    expect(g.platforms).toEqual(['youtube']);
    expect(g.points).toBeCloseTo(4.14, 2);
  });
  it('blends platforms present in both weeks', () => {
    const g = growthPoints({ youtube: 100_000, lastfm: 100_000 }, { youtube: 300_000, lastfm: 100_000 }, W);
    expect(g.prevIndex).toBe(200_000);
    expect(g.currIndex).toBe(400_000);
    expect(g.points).toBeCloseTo(30.1, 1);
  });
});

describe('Heat points (PRD 5b)', () => {
  const sig = (thisWeek: number | null, prior: (number | null)[], floor = 100, signal = 'wikipedia') => ({ signal, thisWeek, priorWeeks: prior, floor });
  const heat = (thisWeek: number, base = 1000) => heatPoints([sig(thisWeek, eightWeeks(base))]).points;

  it('half normal = 5, normal = 15, 2x = 25, 8x = 45', () => {
    expect(heat(500)).toBe(5);
    expect(heat(1000)).toBe(15);
    expect(heat(2000)).toBe(25);
    expect(heat(8000)).toBe(45);
  });
  it('a normal week is a stat line, not a zero', () => {
    const h = heatPoints([sig(1000, eightWeeks(1000))]);
    expect(h.points).toBe(15);
    expect(h.winner).toBe('wikipedia');
  });
  it('is capped at 50', () => {
    expect(heat(1_000_000)).toBe(50);
  });
  it('is floored at 0 for a very quiet week', () => {
    expect(heat(300)).toBe(0); // 0.3x normal: 15 + 10*log2(0.3) = -2.4 -> 0
    expect(heat(0)).toBe(0);
  });
  it('ordering is the same as before: more attention, more points', () => {
    const ratios = [0.4, 0.5, 1, 1.5, 2, 4, 8];
    const pts = ratios.map((r) => heat(r * 1000));
    expect([...pts].sort((a, b) => a - b)).toEqual(pts);
  });
  it('the 15 is a tuning knob', () => {
    expect(heatPoints([sig(1000, eightWeeks(1000))], { ...DEFAULT_SETTINGS, heatBaselinePoints: 0 }).points).toBe(0);
    expect(heatPoints([sig(2000, eightWeeks(1000))], { ...DEFAULT_SETTINGS, heatBaselinePoints: 0 }).points).toBe(10);
  });
  it('a small creator spike counts as much as a big one', () => {
    expect(heatPoints([sig(800, eightWeeks(200))]).points).toBe(heatPoints([sig(8_000_000, eightWeeks(2_000_000))]).points);
  });
  it('strongest signal wins, not the average', () => {
    const h = heatPoints([sig(1100, eightWeeks(1000), 100, 'wikipedia'), sig(80_000, eightWeeks(10_000), 1000, 'youtube')]);
    expect(h.winner).toBe('youtube');
    expect(h.points).toBe(45);
  });
  it('ignores a signal whose baseline is below its noise floor', () => {
    // 5 views/day jumping to 50 is a 10x "spike" that means nothing.
    const h = heatPoints([sig(50, eightWeeks(5), 100)]);
    expect(h.points).toBe(0);
    expect(h.signals[0].note).toBe('below_noise_floor');
  });
  it('a noisy tiny signal cannot beat a real one', () => {
    const h = heatPoints([sig(50, eightWeeks(5), 100, 'wikipedia'), sig(20_000, eightWeeks(10_000), 1000, 'youtube')]);
    expect(h.winner).toBe('youtube');
    expect(h.points).toBe(25);
  });
  it('needs 4 weeks of history before a signal counts', () => {
    expect(heatPoints([sig(8000, [1000, 1000, 1000])]).signals[0].note).toBe('not_enough_history');
    expect(heatPoints([sig(8000, [1000, 1000, 1000, 1000])]).points).toBe(45);
  });
  it('weeks with no data do not count as history', () => {
    expect(heatPoints([sig(8000, [1000, null, 1000, null, 1000])]).signals[0].note).toBe('not_enough_history');
  });
  it('uses at most the last 8 weeks for the baseline', () => {
    const h = heatPoints([sig(2000, [...eightWeeks(1000), 999_999, 999_999])]);
    expect(h.points).toBe(25);
  });
  it('no data this week = 0', () => {
    expect(heatPoints([sig(null, eightWeeks(1000))]).points).toBe(0);
  });
  it('no signals at all = 0', () => {
    expect(heatPoints([])).toMatchObject({ points: 0, winner: null });
  });
  it('explains itself', () => {
    const h = heatPoints([sig(4100, eightWeeks(1000))]);
    expect(h).toMatchObject({ winner: 'wikipedia', ratio: 4.1 });
    expect(h.signals[0]).toMatchObject({ baseline: 1000, weeksOfHistory: 8, eligible: true });
  });
});

describe('Talent size (multiplier and size milestones)', () => {
  it('musicians: the larger of YouTube subscribers and Last.fm listeners', () => {
    expect(talentSize('musician', 'youtube', { youtube: 5_330, lastfm: 347_289 })).toBe(347_289);
    expect(talentSize('musician', 'youtube', { youtube: 41_600_000, lastfm: 1_574_003 })).toBe(41_600_000);
  });
  it('RICEWINE moves from the 3x tier to 1.5x', () => {
    expect(dayOneMultiplier(5_330)).toBe(3);
    expect(dayOneMultiplier(talentSize('musician', 'youtube', { youtube: 5_330, lastfm: 347_289 })!)).toBe(1.5);
  });
  it('musicians with only one platform use that one', () => {
    expect(talentSize('musician', 'youtube', { youtube: 75_400 })).toBe(75_400);
  });
  it('everyone else: their primary platform', () => {
    expect(talentSize('streamer', 'twitch', { twitch: 95_501, youtube: 400_000 })).toBe(95_501);
    expect(talentSize('creator', 'youtube', { youtube: 3_460 })).toBe(3_460);
  });
  it('no reading = null', () => {
    expect(talentSize('creator', 'youtube', {})).toBeNull();
    expect(talentSize('musician', null, {})).toBeNull();
  });
});

describe('Size milestones (PRD 5c)', () => {
  it('crossing 100k / 1M / 10M = 20 / 40 / 60', () => {
    expect(crossedSizeMilestones(95_000, 120_000)).toEqual([{ threshold: 100_000, points: 20 }]);
    expect(crossedSizeMilestones(997_000, 1_000_000)).toEqual([{ threshold: 1_000_000, points: 40 }]);
    expect(crossedSizeMilestones(9_900_000, 10_100_000)).toEqual([{ threshold: 10_000_000, points: 60 }]);
  });
  it('nothing crossed = nothing', () => {
    expect(crossedSizeMilestones(120_000, 150_000)).toEqual([]);
  });
  it('shrinking back below a line awards nothing', () => {
    expect(crossedSizeMilestones(101_000, 99_000)).toEqual([]);
  });
  it('first week awards nothing', () => {
    expect(crossedSizeMilestones(null, 5_000_000)).toEqual([]);
  });
});

describe('Day One multiplier (PRD 5d)', () => {
  it('matches the table', () => {
    expect(dayOneMultiplier(1_000)).toBe(3);
    expect(dayOneMultiplier(9_999)).toBe(3);
    expect(dayOneMultiplier(10_000)).toBe(2);
    expect(dayOneMultiplier(99_999)).toBe(2);
    expect(dayOneMultiplier(100_000)).toBe(1.5);
    expect(dayOneMultiplier(999_999)).toBe(1.5);
    expect(dayOneMultiplier(1_000_000)).toBe(1);
    expect(dayOneMultiplier(526_000_000)).toBe(1);
  });
  it('under 1,000 cannot be drafted', () => {
    expect(dayOneMultiplier(999)).toBeNull();
  });
});

describe('Worked example (PRD 5e)', () => {
  const only = (growth: number) => ({ growth, heat: 0, milestones: 0 });
  it('small artist 5k to 50k at 3x = 300', () => {
    const g = growthPoints({ youtube: 5_000 }, { youtube: 50_000 }, W).points;
    expect(pickPoints(only(g), dayOneMultiplier(5_000)!)).toBe(300);
  });
  it('mid artist 200k to 400k at 1.5x = about 45', () => {
    const g = growthPoints({ youtube: 200_000 }, { youtube: 400_000 }, W).points;
    expect(pickPoints(only(g), dayOneMultiplier(200_000)!)).toBeCloseTo(45.15, 1);
  });
  it('total = growth + heat + milestones', () => {
    expect(weeklyTotal(30.1, 20, 40)).toBe(90.1);
  });
});

describe('Day One multiplier skips the normal-week 15 (PRD 5d)', () => {
  it('a normal week is the same for a 3x and a 1x pick', () => {
    const normal = { growth: 0, heat: 15, milestones: 0 };
    expect(pickPoints(normal, 3)).toBe(15);
    expect(pickPoints(normal, 1)).toBe(15);
  });
  it('a quiet week is never multiplied', () => {
    expect(pickPoints({ growth: 0, heat: 13, milestones: 0 }, 3)).toBe(13);
  });
  it('only Heat above 15 is multiplied', () => {
    // 8x spike = 45 Heat: 15 + 3 x 30 = 105 for a 3x pick, 45 for a 1x pick.
    expect(pickPoints({ growth: 0, heat: 45, milestones: 0 }, 3)).toBe(105);
    expect(pickPoints({ growth: 0, heat: 45, milestones: 0 }, 1)).toBe(45);
  });
  it('Growth and milestones are multiplied', () => {
    expect(pickPoints({ growth: 30, heat: 15, milestones: 20 }, 2)).toBe(15 + 2 * 50);
  });
  it('shrinking is multiplied too', () => {
    expect(pickPoints({ growth: -10, heat: 15, milestones: 0 }, 3)).toBe(-15);
  });
  it('a season of sitting still: 3x and 1x picks earn the same', () => {
    const season = (m: number) => Array.from({ length: 12 }, () => pickPoints({ growth: 0, heat: 13, milestones: 0 }, m)).reduce((a, b) => a + b, 0);
    expect(season(3)).toBe(season(1));
  });
  it('the 15 follows the tuning knob', () => {
    expect(pickPoints({ growth: 0, heat: 20, milestones: 0 }, 2, 7, { ...DEFAULT_SETTINGS, heatBaselinePoints: 10 })).toBe(10 + 2 * 10);
  });
});

describe('Pro-rated pick points (PRD 7)', () => {
  const week = '2026-11-16'; // Monday
  const flat = (heat: number) => ({ growth: 0, heat, milestones: 0 });
  it('a full week on the roster = 7 days, full points', () => {
    expect(daysOnRoster(week, '2026-11-01', null)).toBe(7);
    expect(pickPoints({ growth: 15, heat: 15, milestones: 0 }, 2, 7)).toBe(45);
  });
  it('picked Saturday = 2 days (Sat + Sun), 2/7 of the points', () => {
    expect(daysOnRoster(week, '2026-11-21', null)).toBe(2);
    expect(pickPoints(flat(35), 1, 2)).toBe(10);
  });
  it('the draft day counts', () => {
    expect(daysOnRoster(week, '2026-11-22', null)).toBe(1); // picked Sunday
  });
  it('the drop day does not count', () => {
    expect(daysOnRoster(week, '2026-11-01', '2026-11-19')).toBe(3); // dropped Thursday: Mon-Wed
  });
  it('picked and dropped inside the same week', () => {
    expect(daysOnRoster(week, '2026-11-17', '2026-11-20')).toBe(3); // Tue-Thu
  });
  it('a pick made after the week, or dropped before it, earns nothing', () => {
    expect(daysOnRoster(week, '2026-11-25', null)).toBe(0);
    expect(daysOnRoster(week, '2026-11-01', '2026-11-16')).toBe(0);
    expect(pickPoints(flat(50), 3, 0)).toBe(0);
  });
  it('the late grab cannot collect the full week', () => {
    // Spike Wednesday, grabbed Saturday: a Day One holder gets 7/7, the late grab 2/7.
    expect(pickPoints(flat(42), 1, daysOnRoster(week, '2026-11-01', null))).toBe(42);
    expect(pickPoints(flat(42), 1, daysOnRoster(week, '2026-11-21', null))).toBe(12);
  });
});

describe('Signals ready (PRD 4)', () => {
  const sig = (thisWeek: number | null, prior: (number | null)[], floor = 100) => ({ signal: 'wikipedia', thisWeek, priorWeeks: prior, floor });
  it('ready with an audience reading and a countable Heat signal', () => {
    const r = signalsReady({ youtube: 50_000 }, W, [heatPoints([sig(1000, eightWeeks(1000))])]);
    expect(r).toEqual({ ready: true, note: 'Heat from wikipedia' });
  });
  it('not ready when the only Heat signal is below the floor', () => {
    expect(signalsReady({ youtube: 50_000 }, W, [heatPoints([sig(50, eightWeeks(20))])])).toEqual({ ready: false, note: 'Heat signal below the noise floor' });
  });
  it('not ready while the Heat signal is still building history', () => {
    expect(signalsReady({ youtube: 50_000 }, W, [heatPoints([sig(5000, [4000, 4000])])])).toEqual({ ready: false, note: 'Heat signal still building history' });
  });
  it('not ready with no Heat signal at all', () => {
    expect(signalsReady({ youtube: 50_000 }, W, [heatPoints([])]).ready).toBe(false);
  });
  it('not ready without a Growth signal', () => {
    expect(signalsReady({}, W, [heatPoints([sig(1000, eightWeeks(1000))])])).toEqual({ ready: false, note: 'No Growth signal yet' });
  });
  it('a countable signal in either of the two weeks checked is enough', () => {
    const r = signalsReady({ youtube: 50_000 }, W, [heatPoints([sig(null, eightWeeks(1000))]), heatPoints([sig(1000, eightWeeks(1000))])]);
    expect(r.ready).toBe(true);
  });
});

describe('Weeks (Monday to Sunday, Pacific)', () => {
  it('finds the Monday', () => {
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09'); // Sunday
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekStartOf('2026-11-18')).toBe('2026-11-16'); // Wednesday
  });
  it('adds days across months and years', () => {
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
  });
  it('late Sunday night Pacific is still Sunday', () => {
    expect(pacificDate(new Date('2026-11-16T07:30:00Z'))).toBe('2026-11-15');
  });
});

describe('Settings', () => {
  it('defaults match the PRD', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ growthPointsPer10x: 100, heatPointsPerDoubling: 10, heatBaselinePoints: 15, wikiShiftDays: -1, heatCap: 50, baselineWeeks: 8, minBaselineWeeks: 4, minDraftableSize: 1000 });
  });
  it('the data job runs an identical copy of this file', () => {
    const here = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const copy = readFileSync(new URL('../../../supabase/functions/_shared/scoring.ts', import.meta.url), 'utf8');
    expect(copy).toBe(here);
  });
});
