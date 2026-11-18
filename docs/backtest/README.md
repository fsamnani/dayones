# Heat backtest (PRD 5g)

Run 2026-11-17. Report page: https://claude.ai/artifact/LTURuPidPBvVEVpxVRC2zb (private; built from `report.html`).

- Re-run the analysis: `npm run backtest` (writes `results.json`, dry run, nothing written to the database)
- Rebuild the page: `node scripts/backtest/build-report.mjs` (reads `results.json` and `events.json`)
- `events.json` holds the researched real-world event for each of the top 25 weeks, with a verdict: hit, likely, open.

## Summary
- Sample: 55 draftable talent with a full year of Wikipedia history (27 musicians, 23 creators, 5 streamers), 47 weeks (2025-12-22 to 2026-11-09), Wikipedia Heat only.
- Catches real moments: 12 of the top 25 weeks match a confirmed event (Grammys, Super Bowl, Coachella, album drops, World Cup), 6 likely explained, 7 open for Faraz to check.
- Lumpy: 67.7% of talent-weeks score 0, 90.9% under 5, 3.4% reach 10. Cap of 50 never hit (max 44.3). Typical 12-week season: 11.9 Heat points; top tenth 38.5.
- Knobs barely matter: floor 50/100/200 and 4- vs 8-week baseline change results by about a point. 3 talent never pass the 100/day floor (NOTD, Fana Hues, Ajebo Hustlers).
- Musician index: median 50% YouTube. Global stars are 80-96% YouTube; small indie artists are mostly Last.fm (RICEWINE 1.5% YouTube). Sizing musicians by YouTube puts some in too generous a multiplier tier.
- Wikipedia days are UTC, so US Sunday-night events score in the following week.

## Follow-ups
- ~2026-12-14: re-run with YouTube and Twitch Heat eligible; answer "which signal wins the max, how often".
- ~early January 2027: with 6 weeks of Growth, quantify Heat/Growth overlap for fast-rising talent.
