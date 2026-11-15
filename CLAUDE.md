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
7. Talent browse and profile screens
8. Draft and roster screens
9. My Team screen
10. Leagues, invites, standings by season total points, weekly scoreboard, weekly head-to-head (bragging rights only)
11. Trending tab
12. Catalyst Calendar
13. Feed
14. Day One share card
15. TestFlight build for friends

## Start collecting data early
Get the daily data job running on its schedule as soon as step 4 is done, even before the app works. Every day it runs adds a day of history that cannot be recovered later: YouTube and Last.fm only give current numbers, so Growth history only exists from the day the job starts.

## Scoring north star
Scoring measures how much public attention a talent commands. If points disagree with what is obviously happening in the world, the formula is wrong. Log every miss in `docs/scoring-review-log.md`. Never compare talent on raw numbers across data sources, only on their own Growth and Heat.

## Project layout
- `src/app/` screens (every file is a screen, Expo Router)
- `src/lib/` shared code; `src/lib/supabase.ts` database connection; `src/lib/scoring/` scoring engine
- `supabase/` database migrations and edge functions (data jobs)
- `docs/scoring-review-log.md` weekly record of where the score missed reality
- `AGENTS.md` Expo-specific coding rules (use `npx expo install`, check versioned Expo docs)
- Supabase CLI is a project dev dependency: run it as `npx supabase ...`. In this CLI version commands target a local database by default; add `--remote` for the real project (`npm run db:push` and `npm run db:types` already do)

## Current status
Update this section at the end of every session with what's done and what's next.

- **2026-11-14, Step 1 done:** Expo SDK 58 app with Expo Router + TypeScript, home screen showing database connection status, `.env.example` template, Supabase CLI. Supabase project `bafhhlncbuqdhkpvsydw` connected (keys in `.env`). On public Wi-Fi, run `npm run tunnel` instead of `npm start` (ngrok tunnel, no Expo account needed).
- **2026-11-14, Step 2 written, NOT yet applied to Supabase (verified: live project has no tables):** schema in `supabase/migrations/20261114000000_initial_schema.sql` (15 tables, 2 views, access rules), tested locally against a throwaway Postgres (55 checks passed). Waiting on Faraz to run `npx supabase login`, `npx supabase link --project-ref bafhhlncbuqdhkpvsydw`, `npm run db:push`. Then run `npm run db:types` to generate `src/lib/database.types.ts`, and confirm with a real read of `platforms` (11 rows).
- **Product decisions (2026-11-14):** talent is exclusive within a league; scouts can be in multiple leagues with separate rosters (Day One credit = earliest pick); weeks run Monday to Sunday Pacific, finalized Sunday night.
- **Schema notes:** `platforms.is_tracked` separates stat sources from link-only platforms (Spotify, Apple Music, Instagram, TikTok, X, SoundCloud, Kick). `talent_rankings` view powers Trending. `league_posts` holds weekly recaps, announcements, and messages. Scouts cannot insert picks directly: drafting must go through server code (step 8) that sets size_at_draft and multiplier via `src/lib/scoring`. The 2 add/drops per week limit is also enforced there, not in the database.
- **Product decisions from planning session (2026-11-14), docs only, no code changed yet:** scoring north star and review log; standings by season total points (weekly head-to-head is bragging rights only, playoffs removed); Catalyst Calendar added as v1 feature; backtest added as step 6; start the data job early.
- **Schema follow-ups these decisions need (not built, propose before doing):** an events table for the Catalyst Calendar; `seasons.playoff_weeks` and `matchups.is_playoff` are no longer needed; `matchups.winner_scout_id` is now display only.
- **Next:** apply the schema, then Step 3, seed 30 to 50 talent. For the backtest, at least 30 of them need a Wikipedia page, spread across positions.
