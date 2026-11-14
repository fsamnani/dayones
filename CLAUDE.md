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
6. Talent browse and profile screens
7. Draft and roster screens
8. My Team screen
9. Leagues, invites, matchups, standings
10. Trending tab
11. Feed
12. Day One share card
13. TestFlight build for friends

## Project layout
- `src/app/` screens (every file is a screen, Expo Router)
- `src/lib/` shared code; `src/lib/supabase.ts` database connection; `src/lib/scoring/` scoring engine
- `supabase/` database migrations and edge functions (data jobs)
- `AGENTS.md` Expo-specific coding rules (use `npx expo install`, check versioned Expo docs)
- Supabase CLI is a project dev dependency: run it as `npx supabase ...`

## Current status
Update this section at the end of every session with what's done and what's next.

- **2026-11-14, Step 1 done:** Expo SDK 58 app with Expo Router + TypeScript, home screen showing database connection status, `.env.example` template, Supabase CLI. Supabase project `bafhhlncbuqdhkpvsydw` connected (keys in `.env`). On public Wi-Fi, run `npm run tunnel` instead of `npm start` (ngrok tunnel, no Expo account needed).
- **Next:** Step 2, database schema.
