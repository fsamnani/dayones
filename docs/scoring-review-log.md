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

### Week of 2026-11-09: Loe Shimmy viral song drop (HIT)
- **Talent:** Loe Shimmy (musician)
- **What happened in the world:** a viral song drop this week (confirmed by Faraz).
- **What the score said:** 11.5 points, #2 in the league that week. All of it Heat: Wikipedia pageviews averaged 773/day against his own baseline of 348/day (2.22x normal). Growth was 0 because it was the first scored week.
- **Verdict:** hit. Heat caught the spike on Wikipedia alone, before YouTube and Twitch Heat are switched on.
- **Note:** his Wikipedia attention was already 2.25x normal the week of Nov 2, so the build-up started before the drop week.
- **Action:** none.
- **Status:** confirmed.
