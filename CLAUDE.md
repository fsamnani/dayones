# CLAUDE.md

Instructions for Claude Code working on DayOnes. Read this and PRD.md before every task.

## About the owner
Faraz is the founder. He is a business and marketing person, not a software engineer, and he does not read code. He works in VS Code with Claude Code doing all of the coding.

- Explain what you did and why in plain English. No jargon without a one-line explanation.
- Before any new feature, use plan mode: propose the plan, list files you will create or change, and wait for approval.
- Build in small slices. Each slice should end with something Faraz can see or test on his phone.
- After each slice, tell him exactly how to test it and what he should see.
- If a decision affects the product (scoring, rules, what users see), ask him. If it's purely technical, choose a sensible default and say what you chose.

## Product
See PRD.md. In one line: a fantasy league where users ("scouts") draft rising musicians, creators, and streamers ("talent") and score points as they grow and get hot.

## Stack
- **App:** Expo (React Native) with TypeScript, iPhone first. Expo Router for navigation.
- **Backend:** Supabase (Postgres database, auth, storage, edge functions, scheduled jobs).
- **Data jobs:** Supabase edge functions on a daily schedule pulling YouTube, Last.fm, Wikipedia Pageviews, Twitch.
- **Testing on phone:** Expo Go during development, TestFlight for friends.
- **Source control:** GitHub. Commit after every working slice with a clear message.

## Rules
- Never put API keys or secrets in code. Use environment variables in `.env`, and keep `.env` in `.gitignore`.
- Scoring logic lives in one place (`src/lib/scoring`) with tests, because it is the heart of the product and will be tuned often.
- Every stat stored must keep its source and the date it was fetched.
- Store daily snapshots of talent stats; never overwrite history. The Ledger depends on it.
- Keep it simple. No extra libraries unless they clearly save work, and say why when adding one.
- Respect API terms: no scraping sites that forbid it.

## Build order (v1)
1. Project setup: Expo app, Supabase project, GitHub repo, `.env` template
2. Database: talent, platforms, stat snapshots, scouts, leagues, rosters, picks, points
3. Seed 30 to 50 talent by hand across positions
4. Daily data job: YouTube first, then Last.fm, Wikipedia, Twitch
5. Scoring engine with tests (Growth, Heat, Milestones, Day One multiplier)
6. Backtest: run the Heat formula on 12 months of Wikipedia pageviews for 30 talent, write up results with a chart (PRD 5g)
7. Spike test: Apify Social Blade actor on 10 talent for Instagram/TikTok accuracy, freshness, history depth, and monthly cost for 200 talent. Budget under $20. Report only, do not wire in (PRD 10a)
8. Talent browse and profile screens (show which platforms count toward scoring vs link-only)
9. Draft and roster screens
10. My Team screen
11. Leagues, invites, standings by season total points, weekly scoreboard, weekly head-to-head (bragging rights only)
12. Trending tab
13. Catalyst Calendar
14. Feed
15. Day One share card
16. TestFlight build for friends

## Start collecting data early
Get the daily data job running as soon as step 4 is done, even before the app works. Every day it runs before launch is free history for tuning the scoring. (YouTube and Last.fm only give current numbers, so Growth history only exists from the day the job starts.)

## Scoring north star
Scoring measures how much public attention a talent commands. If points disagree with what is obviously happening in the world, the formula is wrong. Log every miss in `docs/scoring-review-log.md`. Never compare talent on raw numbers across data sources, only on their own Growth and Heat.

## Project layout
- `src/app/` screens (every file is a screen, Expo Router)
- `src/lib/` shared code; `src/lib/supabase.ts` database connection; `src/lib/scoring/` scoring engine
- `supabase/migrations/` database schema changes; `supabase/seed/talent.json` the talent list (source of truth, edit this to add or fix talent, then `npm run seed`)
- `scripts/` one-off tools run on the Mac with `node --env-file=.env` (they may use the service_role key; the app never does)
- `docs/scoring-review-log.md` weekly record of where the score missed reality
- `AGENTS.md` Expo-specific coding rules (use `npx expo install`, check versioned Expo docs)
- Supabase CLI is a project dev dependency: run it as `npx supabase ...`. Commands target a local database by default; `npm run db:push` and `npm run db:types` point at the real project by its ID, so no `supabase link` is needed

## Current status
Update this section at the end of every session with what's done and what's next.

- **2026-11-14, Step 1 done:** Expo SDK 58 app with Expo Router + TypeScript, home screen showing database connection status, `.env.example` template, Supabase CLI. Supabase project `bafhhlncbuqdhkpvsydw` connected (keys in `.env`). On public Wi-Fi, run `npm run tunnel` instead of `npm start` (ngrok tunnel, no Expo account needed).
- **2026-11-14, Step 2 done:** schema applied to Supabase project `bafhhlncbuqdhkpvsydw` (`supabase/migrations/20261114000000_initial_schema.sql`: 15 tables, 2 views, access rules; 55 local checks passed; live project verified: 11 platforms, private tables refuse anonymous reads). `src/lib/database.types.ts` generated from the live database; regenerate with `npm run db:types` after every migration.
- **Product decisions (2026-11-14):** talent is exclusive within a league; scouts can be in multiple leagues with separate rosters (Day One credit = earliest pick); weeks run Monday to Sunday Pacific, finalized Sunday night.
- **Schema notes:** `platforms.is_tracked` separates stat sources from link-only platforms (Spotify, Apple Music, Instagram, TikTok, X, SoundCloud, Kick). `talent_rankings` view powers Trending. `league_posts` holds weekly recaps, announcements, and messages. Scouts cannot insert picks directly: drafting must go through server code (step 9) that sets size_at_draft and multiplier via `src/lib/scoring`. The 2 add/drops per week limit is also enforced there, not in the database.
- **Product decisions from planning session (2026-11-14), docs only, no code changed yet:** scoring north star and review log; standings by season total points (weekly head-to-head is bragging rights only, playoffs removed); Catalyst Calendar added as v1 feature; backtest added as step 6; start the data job early.
- **Schema follow-ups these decisions need (not built, propose before doing):** an events table for the Catalyst Calendar; `seasons.playoff_weeks` and `matchups.is_playoff` are no longer needed; `matchups.winner_scout_id` is now display only.
- **Eligibility rule (2026-11-14):** draftable only if their biggest platform is tracked (PRD 4). In `talent.json` the primary account = biggest platform; the seed script refuses a draftable talent whose primary is untracked. `provisional: true` = draftable pending the spike test. Bench = `status: nominated` + `hold_reason`. Notes and hold reasons live only in the seed file for now; add a `status_reason` column with the profile screens (step 8).
- **Talent list balance, flag for the next talent pass:** need many more talent under 1M (2x and 3x multipliers; nobody yet is in the 1k to 10k 3x tier) and keep at least 10 draftable streamers. 8 of the 10 streamers are Twitch-first, so their sizes are unconfirmed until Twitch is connected in step 4.
- **2026-11-14, Step 3 (superseded):** `supabase/seed/talent.json` has Faraz's 40 talent (18 musicians, 17 creators, 5 streamers; 36 draftable, 4 nominated pending identity or data source). `npm run seed:check` validates and checks links (all pass); `npm run seed` uploads once SUPABASE_SERVICE_ROLE_KEY is in `.env`. 26 have Wikipedia pages, short of the 30 wanted for the backtest.
- **2026-11-14, Step 3 done:** 65 talent uploaded (55 draftable incl. 12 provisional, 10 on the bench); seed is safe to re-run. 45 have Wikipedia pages.
- **2026-11-15, Step 4 done:** edge function `supabase/functions/daily-stats` (tasks: `daily` 11:00 UTC, `live` every 20 min, `wiki-backfill` once). Scheduled by pg_cron via `public.call_daily_stats(task)`; the bearer secret lives in Supabase Vault (`set_job_secret`) and as function secret `CRON_SECRET`; both equal `CRON_SECRET` in `.env`. Run by hand: `npm run job -- daily`. Redeploy after code changes: `npm run functions:deploy`. First runs: 16,071 snapshots incl. 12 months of Wikipedia pageviews for 45 talent. Metrics: youtube subscribers/total_views/video_count/views_7d_uploads/uploads_7d; lastfm listeners/playcount; wikipedia pageviews (UTC day); twitch followers + daily peak_live_viewers/hours_live rolled up from `live_samples`.
- **Data job gotchas:** Wikimedia throttles Supabase's shared addresses: keep Wikipedia requests serial with retry/backoff. Supabase CLI hosted changes need `--yes` when run by Claude. Edge function code is Deno; it is excluded from the app's tsconfig, and `collectors.ts` is portable so it can be tested with Node.
- **Schedules verified:** pg_cron fired the `live` task unattended (2026-11-15 08:40 UTC). Check that a `daily` row appears after 11:00 UTC each day.
- **2026-11-15, Step 5 done:** formulas in `src/lib/scoring/index.ts` (one file, no imports, 40 tests: `npm test`). The data job runs a copy at `supabase/functions/_shared/scoring.ts`; `npm run functions:deploy` syncs it and a test fails if they differ. `supabase/functions/daily-stats/scoring-run.ts` gathers inputs and writes `talent_weekly_scores` / `scout_weekly_points`; it runs at the end of every daily run and as `npm run job -- score`. `npm run score:check` is a dry run. Tuning knobs: tables `scoring_platform_config` (audience weight, heat floor per platform per position) and `scoring_settings`.
- **Scoring decisions (2026-11-15):** blended Audience Index (weights 1.0); Heat = strongest eligible signal, floors Wikipedia 100/day, YouTube 1,000/week, live viewers 50; a signal needs 4 weeks of history; first scored week has 0 Growth; Day One multiplier uses primary-platform follower count; Growth compares only platforms present in both weeks; a week is final 2 days after it ends (Tuesday); only draftable talent are scored.
- **Scoring state:** YouTube and Twitch Heat cannot count until 4 weeks of history exist (about 2026-12-14); until then Heat is Wikipedia only, so talent with no Wikipedia page score 0 Heat. First real Growth is the week of 2026-11-16.
- **Pick points are pro-rated (decided 2026-11-17, PRD 7):** a pick earns (days on roster that week / 7) of the talent's weekly points x multiplier; draft day counts, drop day does not, Pacific dates. `daysOnRoster` + `pickPoints` in `src/lib/scoring`. Only draftable talent are scored (approved). "Single video over 1M views" milestone is not automated (admin-entered).
- **2026-11-17, talent batch 2:** 19 added (84 total: 73 draftable incl. 18 provisional, 11 bench). Not added, need Faraz: Togi (no confident match, only fan clip channels found), NFR Podcast (could not confirm it is creator-led). Stephen A. Smith on the bench (X/TV-first). Draftable size tiers: 0 at 3x, 1 at 2x, 21 at 1.5x, 51 at 1x. Still needed: a pass for under-1M talent (especially 1k to 100k) and more draftable streamers.
- **2026-11-17, talent batch 3 (small talent):** 27 added in the 3x/2x bands (111 total: 100 draftable incl. 21 provisional, 11 bench). Draftable tiers now 3x 10, 2x 18, 1.5x 21, 1x 51; streamers 20. Found by data, not memory: Twitch streamers live with 1k-100k followers (filtered out 24/7 reruns, drops farms, gambling, adult ASMR, likely view-bots); musicians via Last.fm similar artists to existing rising picks, matched to YouTube; creators via recent YouTube videos outperforming channel size. Rejected as noise: AI music farms, reupload channels, big stars' small VEVO channels. BerryCrepe (95.5k) and Nosiiree (75k) sit near the 100k line.
- **Daily schedule verified:** `daily` fired unattended at 11:00 UTC on 2026-11-15, 16, 17.
- **2026-11-17, Step 6 done (first pass):** backtest in `scripts/backtest.mts` + `docs/backtest/` (see its README). Report page https://claude.ai/artifact/LTURuPidPBvVEVpxVRC2zb. `runScoring` accepts backtest-only `settingsOverride` / `floorOverride`. Waiting on Faraz: confirm 7 open top weeks (then log hits/misses), musician size-at-draft choice (YouTube vs larger of YouTube/Last.fm), approve hourly Wikipedia for Pacific-day alignment. Follow-up re-runs ~2026-12-14 (signal win rates) and ~early Jan 2027 (Heat/Growth overlap).
- **Next:** Step 7, spike test (Apify, Instagram/TikTok), after Faraz's backtest decisions.
