# DayOnes: Product Requirements (v1)

Last updated: Nov 15, 2026
Owner: Faraz

## 1. What DayOnes is

A fantasy league for rising talent. Users draft musicians, creators, and streamers before they blow up, earn points as their picks grow and get hot, and compete with friends. The long-term record of who you found early is your Day One proof.

**The secret:** people care deeply about being first to something that later becomes big, but today there is no way to prove it or play with it.

**Why a game:** real breakouts can take years (Travis Scott went from discovery to mainstream over about 4 years). A fantasy format gives weekly movement, matchups, and bragging rights while the long bet plays out, the way a stock holder checks their portfolio while waiting.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| Talent | Anyone you can draft (musicians, creators, streamers). Like "players" in fantasy football. |
| Scout | A DayOnes user. |
| Roster | A scout's 10 drafted talent. |
| League | A private group of scouts competing. |
| Season | A fixed 12-week game period. Standings are decided by total points across the season (see section 6). |
| Ledger | A scout's permanent, never-reset record of every pick and when it was made. The Day One proof. |
| Heat | How much attention talent is getting right now, compared to their own normal. |
| Growth | How much talent's audience grew. |
| Catalyst | An upcoming event that could move a talent's score: album release, tour date, award show, announced podcast appearance. |

## 3. Target user (v1)

Faraz and 4 to 5 friends in SF who follow music, YouTube, and streamers, already play fantasy football, and like talking trash. iPhone users.

## 4. Positions and eligibility

| Position | Who qualifies | Primary data |
|---|---|---|
| Musician (4 slots) | Releases music. Includes rappers, singers, bands, DJs, producers. | Last.fm listeners and plays, YouTube channel subs and views, Wikipedia pageviews |
| Creator (3 slots) | Makes recorded content: YouTubers, podcasters, reactors, food reviewers, IRL vloggers. | YouTube subs and views, Wikipedia pageviews |
| Streamer (1 slot) | Main output is live streaming (Kick, Twitch, YouTube Live). | Twitch followers and live viewers, Kick (if API allows), YouTube |
| Flex (2 slots) | Any of the above. | Same as their position |

**Rules**
- Each talent has one primary position. Flex absorbs anyone.
- **Draftable only if the platform where they have the most audience is one we track.** A creator with 3k YouTube subs but millions on Instagram is not draftable, because their score would not reflect reality. They are marked **nominated, untrackable** and kept on the bench until a data source exists for their main platform.
  - For musicians, Last.fm stands in for their streaming audience (Spotify, Apple Music), since streaming is where a musician's audience lives. Their Instagram following does not disqualify them. *(Confirmed by Faraz, Nov 14, 2026.)*
  - Talent we are not sure about are draftable but **provisional** until the Instagram/TikTok spike test (section 10a) confirms their main platform.
  - They must also have at least one Growth signal and one Heat signal we can track.
- **The bench:** nominated talent we cannot score yet, each with the reason (for example "main platform is Kick"). When a data source for their platform comes online, they move to draftable.
- Minimum draftable size: 1,000 on their primary platform. Stops scouts farming tiny accounts.
- No organizations or publications (Eater, NYTimes). Talent must be a person or group who is the face. Creator-led shows count (Impaulsive).
- Genre tags (podcast, food, gaming, reactions, IRL, comedy, sports, etc.) are for browsing and filtering, not positions.

## 5. Scoring (first pass, will be tuned)

### North star
The scoring system exists to measure **how much public attention a talent commands**. That is the test for whether it works. If points disagree with what is obviously happening in the world, the formula is wrong, not reality.

Every week the score misses something obvious, we record it in the scoring review log (`docs/scoring-review-log.md`) so we can tune the formula.

Talent are only ever compared on their own Growth and Heat, never on raw numbers. A musician tracked on Last.fm and a creator tracked on YouTube have different raw stats, so rankings use points (each talent measured against their own past), not audience sizes.

Weekly points for each talent on your roster = **Growth points + Heat points + Milestone bonuses**, all multiplied by the **Day One multiplier** locked in when you drafted them.

### 5a. Growth points (slow, durable)
- Each talent has an **Audience Index** = the sum of (platform audience × platform weight) across all their tracked platforms. Audience = YouTube subscribers, Last.fm listeners, Twitch followers.
- **Weights live in a config table**, one row per platform per position, all starting at 1.0, so they can be tuned after the backtest without a code change.
- Mixing units across platforms is acceptable because Growth is a week-over-week ratio of this index: what matters is that the recipe stays stable from week to week.
- **Known bias, flagged for backtest review:** Last.fm undercounts real music listening, so YouTube will dominate a musician's index.
- Growth points = 100 x log10(Audience Index this week / Audience Index last week).
- Plain English: every 10x in audience is worth 100 points, every 2x is worth about 30. Doubling counts the same whether it's 5k to 10k or 5M to 10M. The multiplier (5d) then rewards the smaller find.
- Shrinking audiences give negative points.

### 5b. Heat points (fast, what everyone is talking about)
Solves the "Theo Von has Trump on his podcast and everyone is clipping it" week, which subscriber counts alone would miss.
- Signals (v1): YouTube views on uploads in the last 7 days, Wikipedia pageviews, peak live viewers for streamers. Reddit mentions later.
- Each signal is compared to the talent's own trailing 8-week average (its baseline), so a small creator's spike counts as much as a big one's.
- **Strongest signal wins:** Heat uses the single highest ratio-to-baseline among the talent's eligible signals, not an average. We are trying to catch a spike on any one platform.
- **Noise floor:** a signal is only eligible if its 8-week baseline is above a minimum absolute level, so tiny numbers cannot produce fake multiples. Minimums live in the same config table. Starting values: Wikipedia pageviews 100/day, YouTube recent-upload views 1,000/week, peak live viewers 50.
- Heat points = 10 x log2(this week / their baseline), floored at 0, capped at 50 per week. Plain English: 2x normal attention = 10 points, 4x = 20, 8x = 30.

### 5c. Milestone bonuses (the touchdowns)
Examples, values to tune:
- First Billboard Hot 100 or Billboard 200 entry: 50
- Crossing 100k / 1M / 10M on primary platform: 20 / 40 / 60
- Single video over 1M views in a week (for talent under 1M subs): 25
- Award nomination (Streamer Awards, Grammys, etc.): 30
Milestones are logged by the system where possible and by an admin in v1.

### 5d. Day One multiplier (locked at draft)
| Size at draft | Multiplier |
|---|---|
| 1k to 10k | 3x |
| 10k to 100k | 2x |
| 100k to 1M | 1.5x |
| 1M+ | 1x |

### 5e. Worked example (one season)
| Pick | Change | Rough points |
|---|---|---|
| Small artist | 5k to 50k | 300 |
| Mid artist | 200k to 400k | 45 |
| Drake | 75M to 80M | about 3 growth, plus heat on album weeks |

### 5f. Defensibility rules
- Every number shown in the app links to its source and date.
- Scoring formula is published in the app.
- A scoring review log (`docs/scoring-review-log.md`): when the score clearly misses reality, note it, fix the formula, and announce the change.

### 5g. Backtest (before launch)
Before anyone plays, test the scoring formula against history.
- Pull the last 12 months of daily Wikipedia pageviews for 30 talent across all positions. That API has years of history.
- Run the Heat formula on it.
- Check two things: how lumpy weekly scores are (how many near-zero weeks), and whether the biggest scoring weeks line up with real events like album drops or viral moments.
- **Which signal wins the max, and how often?** If one signal wins most of the time, report it: the floors may be wrong or that signal too noisy.
- **Double counting:** do fast-rising talent earn high Heat and high Growth for the same rise? Quantify the overlap so we can decide whether to adjust.
- **Musician index balance:** how much of each musician's Audience Index comes from YouTube vs Last.fm (see 5a).
- Write up the results, including a chart, so we can tune the formula before launch.

**Limit:** YouTube and Last.fm only give current numbers, not history, so Growth cannot be backtested. We only build that history going forward, one day at a time, which is why the daily data job should start running as early as possible.

## 6. Seasons and the Ledger
- **Season length: 12 weeks.**
- **League standings are decided by total points across the whole season**, not weekly head-to-head wins. Reason: big moments like album drops are rare and lumpy, so a single week is too noisy to decide a winner.
- **Weekly head-to-head still shows, for bragging rights only.** It does not affect standings.
- **Weekly scoreboard** stays for engagement: the week's top scorer in the league, plus your best and worst pick.
- Rosters carry over between seasons (keeper-league style), so long bets keep paying.
- **The Ledger never resets.** It records every pick ever made with timestamp and size at draft. Career stats like "Day One hit rate" live here. This is the multi-year proof the original idea was built on.

## 7. Roster moves
- Draft: snake draft within a league at season start, or open picks for solo players.
- Weekly swaps: 2 add/drops per week, processed like waivers. Limits spray-and-pray.
- Dropping a talent keeps their history in your Ledger but stops scoring.

## 8. v1 features (must have)
1. Sign up / sign in
2. Talent profiles: position, tags, linked platforms, stats chart, recent news. **Every profile shows which platforms count toward scoring and which are link-only**, so scouts know before they draft.
3. Browse and search talent (curated database, filter by position and tag)
4. Draft and roster management (10 slots, positions, swaps)
5. Daily data job: pulls stats, computes Audience Index, Heat, and points
6. My Team: weekly score, biggest mover, best and worst pick of the week, roster with points per talent
7. League: create, invite friends by link, standings by season total points, weekly scoreboard, weekly head-to-head for bragging rights
8. Trending tab (inspired by Sleeper): most added this week, biggest Heat, biggest Growth, with % rostered
9. Catalyst Calendar: a schedule of upcoming events for talent on your roster and on the trending list (album releases, tour dates, award shows, announced podcast appearances). This is our version of a fantasy football matchup: it gives scouts something to forecast and a reason to open the app before the week starts. Sources: admin-entered in v1, plus anything we can pull for free.
10. Feed: per-talent and league-wide updates (new uploads, milestones, big moves, roster moves by league members)
11. Shareable Day One card ("Scouted at 12k, now 400k")
12. Nominate talent (admin approves)

## 9. v2 and later
- AI weekly digest ("DayOnes Weekly: big movers, sleepers, who's trending down"), usable as a script for Faraz's own pundit videos
- Feed from Reddit and X mentions, news headlines
- Predictions ("Calls"): free-to-play yes/no questions like "Will X cross 1M subs by Dec 31?" with points, borrowing from prediction markets (clear resolution source, crowd odds shown) without real money
- Spotify history import for retroactive Day One proofs
- Instagram and TikTok data via a paid aggregator (Chartmetric, Soundcharts, or similar)
- Talent-side dashboard: verified list of their earliest fans
- Prizes sponsored by talent or brands (tickets, merch, after parties)
- Android

## 10. Data sources (v1)
| Source | Gives | Notes |
|---|---|---|
| YouTube Data API | Subscribers, total views, recent upload views | Free daily quota. Current numbers only, no history |
| Last.fm API | Artist listeners and plays | Free. Current numbers only, no history |
| Wikipedia Pageviews API | Daily page views per person | Free, strong buzz signal for notable talent. Has years of daily history (used for the backtest) |
| Twitch API | Followers, live viewers | Verify access |
| Kick | Live viewers only | Public API checked Nov 2026: live viewer counts yes, follower counts no. So Kick can give Heat but not Growth, and Kick-first streamers stay on the bench. Needs a Kick developer app (client credentials) |
| Billboard | Chart entries | No official API; admin logs milestones in v1 |

### 10a. Spike test: Instagram and TikTok data (before launch)
Many talent are biggest on Instagram or TikTok. Before launch, test a paid source:
- Run an Apify Social Blade actor against the provisional talent (11 as of Nov 14, 2026; decided by Faraz). Faraz spot-checks a few follower counts on his phone, one time, to judge accuracy.
- Report: do the Instagram and TikTok follower numbers match reality, how fresh is the data, how far back does daily history go, and what would it cost per month for 200 talent updated daily.
- Budget: under $20 for the test. Findings only; do not wire it into the app.
- Outcome decides whether Instagram/TikTok become tracked platforms, which would move many bench talent to draftable, and confirms or rejects the provisional talent.

Other platforms (Spotify, Apple Music, SoundCloud, Instagram, TikTok, X, Kick) can be linked on a talent's profile but are not scored until a usable data source exists.

Not usable in v1: Spotify API (artist followers and popularity removed for new apps in Feb 2026), Instagram and TikTok (restricted APIs), X (expensive).

## 11. Success test
Run one 12-week season with 4 to 5 friends.
- Do friends open the app weekly without reminders?
- Do they make swaps and talk trash in the group chat?
- Do they check the Catalyst Calendar before the week starts?
- Does the score match what everyone feels is hot? (Log misses in the scoring review.)
- Do people share Day One cards?

## 12. Open questions
- Audience Index weights and Heat floors: start values set (5a, 5b); tune after the backtest and the first season's scoring review log
- Kick and Twitch API access (verify in step 4)
- Catalyst Calendar: which event sources can be pulled for free, beyond admin entry
- Existing fantasy-music or creator-prediction apps: research before launch

## 13. Decided
- **Playoffs:** removed. Standings are by season total points. Revisit only if friends ask for a finale.
- **Backtest sample:** will lean toward talent with a Wikipedia page, which means already-notable talent. Accepted for now. Smaller talent come in later through nominations.
- **Points currency:** plain "points" in v1. No separate in-app currency name.
- **Admin tooling:** none in v1. Faraz curates talent and milestones through the Supabase dashboard and seed files; an in-app admin screen is v2.
