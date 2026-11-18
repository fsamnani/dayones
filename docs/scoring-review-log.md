# Scoring review log

The scoring system exists to measure how much public attention a talent commands. If points disagree with what is obviously happening in the world, the formula is wrong, not reality.

This log records **both** outcomes, so we know what the formula gets right as well as wrong:
- **Hit:** the score caught something real. Evidence the formula works; do not tune it away.
- **Miss:** the score disagreed with something obvious. When a formula change follows, link the commit and announce it to the league.

## How to add an entry

Copy this block to the top of the Entries section and fill it in.

```
### Week of YYYY-MM-DD: short title (HIT or MISS)
- **Talent:** who
- **What happened in the world:** the obvious thing (with a link)
- **What the score said:** points that week, and which signal drove them
- **Verdict:** hit (score caught it) / miss (score got it wrong)
- **Likely cause (misses):** missing signal, bad weight, cap too low, data gap, etc.
- **Action:** none (hit), formula change, new data source, or "watch for now"
- **Status:** confirmed / open / fixed in <commit> / won't fix
```

## Entries

### Backtest reverse test, run 2026-11-17 (COVERAGE GAPS, re-test 2026-12-14)
Known events checked against Heat v2 (Wikipedia only). None produced a clear spike in its own week.
**Classification (Faraz, 2026-11-18): the Flagrant and KSI results are coverage gaps, not formula failures.** That news lives in YouTube views, which the Wikipedia-only backtest cannot see. Re-run this reverse test on 2026-12-14, once YouTube and Twitch Heat are live, before treating any of these as formula misses.
- **Flagrant, Akaash Singh departure confirmed by Andrew Schulz (May 6, 2026): COVERAGE GAP.** Tracked page (Andrew Schulz) was 0.79x normal that week, 11.5 Heat. Akaash Singh's own page was 2.71x normal (about 29 Heat if tracked). Note: tracking every current host is now built, but Akaash had left by then, so his page would not count; this event can only be caught on YouTube. Status: re-test 2026-12-14.
- **Flagrant, Jasleen and Akaash Singh on the show (Dec 3, 2025): COVERAGE GAP.** Schulz's page 0.89x (13.3 Heat); it spiked 5.58x the following week (39.8, Flagrant's top week) for reasons not found. Akaash's page was 2.14x in the event week. Status: re-test 2026-12-14.
- **Jon Pardi, California Sunrise 10th Anniversary Edition (Jun 12, 2026): MISS.** 0.80x normal (11.8 Heat), 1.16x the week after. Likely cause: a reissue draws little public attention; may be correct by the north star. Status: open.
- **KSI, announced leaving the Sidemen (May 31, 2026): COVERAGE GAP.** 1.32x and 1.40x (19.0 and 19.8 Heat), 10th and 8th of his 51 weeks. Likely cause: creator news lives on YouTube/X, which the Wikipedia-only backtest cannot see. Status: re-test 2026-12-14.

### Week of 2026-06-29: Jon Pardi spike (UNRESOLVED)
- **What the score said:** 4.2x normal on Wikipedia (35.7 Heat v2), a top-25 week of the year.
- **Checked:** the California Sunrise reissue was June 12, over two weeks earlier, so it does not explain this week. A divorce report is the likelier cause (headline found, date unverified).
- **Status:** unresolved.

### Week of 2026-09-21: KSI spike (UNRESOLVED)
- **What the score said:** 4.31x normal (36.1 Heat v2).
- **Checked:** the Sidemen split was May 31 and does not explain September. Nearby but outside the week: a tribute to Sway (Sep 18) and Netflix's Outside premiere (Sep 28).
- **Status:** unresolved.

### Weeks of 2026-04-13 and 2026-10-12: Flagrant spikes (UNRESOLVED)
- **What the score said:** 4.74x (37.4) and 4.27x (35.9) on Andrew Schulz's page.
- **Checked:** not explained by the known Flagrant events. April may relate to Schulz's widely covered Trump criticism (Axios, Apr 10), which is about Schulz rather than the show.
- **Status:** unresolved, pending the reverse test above (tracked page question).

### Week of 2026-11-09: Loe Shimmy viral song drop (HIT)
- **Talent:** Loe Shimmy (musician)
- **What happened in the world:** a viral song drop this week (confirmed by Faraz).
- **What the score said:** 11.5 points, #2 in the league that week. All of it Heat: Wikipedia pageviews averaged 773/day against his own baseline of 348/day (2.22x normal). Growth was 0 because it was the first scored week.
- **Verdict:** hit. Heat caught the spike on Wikipedia alone, before YouTube and Twitch Heat are switched on.
- **Note:** his Wikipedia attention was already 2.25x normal the week of Nov 2, so the build-up started before the drop week.
- **Action:** none.
- **Status:** confirmed.
