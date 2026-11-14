# DayOnes: Product Requirements (v1)

Last updated: Nov 13, 2026
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
| Season | A fixed game period with weekly matchups (see section 6). |
| Ledger | A scout's permanent, never-reset record of every pick and when it was made. The Day One proof. |
| Heat | How much attention talent is getting right now, compared to their own normal. |
| Growth | How much talent's audience grew. |

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
- Draftable only if DayOnes can track at least one Growth signal and one Heat signal for them. Talent with no trackable data (for example a SoundCloud-only artist) can be nominated but not drafted until a source exists.
- Minimum draftable size: 1,000 on their primary platform. Stops scouts farming tiny accounts.
- No organizations or publications (Eater, NYTimes). Talent must be a person or group who is the face. Creator-led shows count (Impaulsive).
- Genre tags (podcast, food, gaming, reactions, IRL, comedy, sports, etc.) are for browsing and filtering, not positions.

## 5. Scoring (first pass, will be tuned)

Weekly points for each talent on your roster = **Growth points + Heat points + Milestone bonuses**, all multiplied by the **Day One multiplier** locked in when you drafted them.

### 5a. Growth points (slow, durable)
- Each talent has an **Audience Index**: a weighted blend of their audience sizes across tracked platforms for their position.
- Growth points = 100 x log10(Audience Index this week / Audience Index last week).
- Plain English: every 10x in audience is worth 100 points, every 2x is worth about 30. Doubling counts the same whether it's 5k to 10k or 5M to 10M. The multiplier (5d) then rewards the smaller find.
- Shrinking audiences give negative points.

### 5b. Heat points (fast, what everyone is talking about)
Solves the "Theo Von has Trump on his podcast and everyone is clipping it" week, which subscriber counts alone would miss.
- Signals: views on uploads in the last 7 days, Wikipedia pageviews, Reddit mentions, live viewers for streamers.
- Each signal is compared to the talent's own trailing 8-week average, so a small creator's spike counts as much as a big one's.
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
- A scoring review log: when the score clearly misses reality, note it, fix the formula, and announce the change.

## 6. Seasons and the Ledger
- **Season length: 12 weeks**, with weekly head-to-head matchups inside a league and playoffs in the final 2 weeks. Matches fantasy football rhythm.
- Rosters carry over between seasons (keeper-league style), so long bets keep paying.
- **The Ledger never resets.** It records every pick ever made with timestamp and size at draft. Career stats like "Day One hit rate" live here. This is the multi-year proof the original idea was built on.

## 7. Roster moves
- Draft: snake draft within a league at season start, or open picks for solo players.
- Weekly swaps: 2 add/drops per week, processed like waivers. Limits spray-and-pray.
- Dropping a talent keeps their history in your Ledger but stops scoring.

## 8. v1 features (must have)
1. Sign up / sign in
2. Talent profiles: position, tags, linked platforms, stats chart, recent news
3. Browse and search talent (curated database, filter by position and tag)
4. Draft and roster management (10 slots, positions, swaps)
5. Daily data job: pulls stats, computes Audience Index, Heat, and points
6. My Team: weekly score, biggest mover, roster with points per talent
7. League: create, invite friends by link, weekly matchups, standings
8. Trending tab (inspired by Sleeper): most added this week, biggest Heat, biggest Growth, with % rostered
9. Feed: per-talent and league-wide updates (new uploads, milestones, big moves, roster moves by league members)
10. Shareable Day One card ("Scouted at 12k, now 400k")
11. Nominate talent (admin approves)

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
| YouTube Data API | Subscribers, total views, recent upload views | Free daily quota |
| Last.fm API | Artist listeners and plays | Free |
| Wikipedia Pageviews API | Daily page views per person | Free, strong buzz signal for notable talent |
| Twitch API | Followers, live viewers | Verify access |
| Kick | Followers, viewers | Verify public API before relying on it |
| Billboard | Chart entries | No official API; admin logs milestones in v1 |

Not usable in v1: Spotify API (artist followers and popularity removed for new apps in Feb 2026), Instagram and TikTok (restricted APIs), X (expensive).

## 11. Success test
Run one 12-week season with 4 to 5 friends.
- Do friends open the app weekly without reminders?
- Do they make swaps and talk trash in the group chat?
- Does the score match what everyone feels is hot? (Log misses in the scoring review.)
- Do people share Day One cards?

## 12. Open questions
- Exact Audience Index weights per position
- Kick and Twitch API access
- Name of the in-app currency for points, if any
- Admin tooling for curating talent and milestones
- Existing fantasy-music or creator-prediction apps: research before launch
