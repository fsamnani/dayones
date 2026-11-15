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
  pacificDate,
  pickPoints,
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

  it('2x normal = 10, 4x = 20, 8x = 30', () => {
    expect(heatPoints([sig(2000, eightWeeks(1000))]).points).toBe(10);
    expect(heatPoints([sig(4000, eightWeeks(1000))]).points).toBe(20);
    expect(heatPoints([sig(8000, eightWeeks(1000))]).points).toBe(30);
  });
  it('is capped at 50', () => {
    expect(heatPoints([sig(1_000_000, eightWeeks(1000))]).points).toBe(50);
  });
  it('is floored at 0 for a quiet week', () => {
    const h = heatPoints([sig(500, eightWeeks(1000))]);
    expect(h.points).toBe(0);
    expect(h.winner).toBeNull();
  });
  it('a normal week = 0', () => {
    expect(heatPoints([sig(1000, eightWeeks(1000))]).points).toBe(0);
  });
  it('a small creator spike counts as much as a big one', () => {
    expect(heatPoints([sig(800, eightWeeks(200))]).points).toBe(heatPoints([sig(8_000_000, eightWeeks(2_000_000))]).points);
  });
  it('strongest signal wins, not the average', () => {
    const h = heatPoints([sig(1100, eightWeeks(1000), 100, 'wikipedia'), sig(80_000, eightWeeks(10_000), 1000, 'youtube')]);
    expect(h.winner).toBe('youtube');
    expect(h.points).toBe(30);
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
    expect(h.points).toBe(10);
  });
  it('needs 4 weeks of history before a signal counts', () => {
    expect(heatPoints([sig(8000, [1000, 1000, 1000])]).signals[0].note).toBe('not_enough_history');
    expect(heatPoints([sig(8000, [1000, 1000, 1000, 1000])]).points).toBe(30);
  });
  it('weeks with no data do not count as history', () => {
    expect(heatPoints([sig(8000, [1000, null, 1000, null, 1000])]).signals[0].note).toBe('not_enough_history');
  });
  it('uses at most the last 8 weeks for the baseline', () => {
    const h = heatPoints([sig(2000, [...eightWeeks(1000), 999_999, 999_999])]);
    expect(h.points).toBe(10);
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
  it('small artist 5k to 50k at 3x = 300', () => {
    const g = growthPoints({ youtube: 5_000 }, { youtube: 50_000 }, W).points;
    expect(pickPoints(weeklyTotal(g, 0, 0), dayOneMultiplier(5_000)!)).toBe(300);
  });
  it('mid artist 200k to 400k at 1.5x = about 45', () => {
    const g = growthPoints({ youtube: 200_000 }, { youtube: 400_000 }, W).points;
    expect(pickPoints(weeklyTotal(g, 0, 0), dayOneMultiplier(200_000)!)).toBeCloseTo(45.15, 1);
  });
  it('total = growth + heat + milestones, then multiplier', () => {
    expect(weeklyTotal(30.1, 20, 40)).toBe(90.1);
    expect(pickPoints(90.1, 2)).toBe(180.2);
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
    expect(DEFAULT_SETTINGS).toMatchObject({ growthPointsPer10x: 100, heatPointsPerDoubling: 10, heatCap: 50, baselineWeeks: 8, minBaselineWeeks: 4, minDraftableSize: 1000 });
  });
  it('the data job runs an identical copy of this file', () => {
    const here = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const copy = readFileSync(new URL('../../../supabase/functions/_shared/scoring.ts', import.meta.url), 'utf8');
    expect(copy).toBe(here);
  });
});
