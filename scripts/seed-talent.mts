/// <reference types="node" />
/**
 * Uploads supabase/seed/talent.json into the database.
 *
 *   npm run seed            upload (updates existing talent, never duplicates)
 *   npm run seed:check      dry run: validate the file and check links, write nothing
 *
 * Needs in .env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (upload only),
 * YOUTUBE_API_KEY (optional, enables the YouTube checks).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import type { Database } from '../src/lib/database.types';

type Position = Database['public']['Enums']['talent_position'];
type Status = Database['public']['Enums']['talent_status'];

type SeedAccount = { platform: string; url: string; external_id?: string; primary?: boolean };
type SeedTalent = {
  name: string;
  slug: string;
  position: Position;
  tags: string[];
  status: Status;
  note?: string;
  accounts: SeedAccount[];
};

const DRY_RUN = process.argv.includes('--dry-run');
const POSITIONS: Position[] = ['musician', 'creator', 'streamer'];
const STATUSES: Status[] = ['nominated', 'draftable', 'retired'];
// Which tracked platforms give which signal. Must match platforms.is_tracked.
const GROWTH_PLATFORMS = new Set(['youtube', 'lastfm', 'twitch']);
const HEAT_PLATFORMS = new Set(['youtube', 'wikipedia', 'twitch']);
const KNOWN_PLATFORMS = new Set([
  'youtube', 'lastfm', 'wikipedia', 'twitch', 'kick', 'spotify', 'apple_music', 'soundcloud', 'instagram', 'tiktok', 'x',
]);
const MIN_DRAFTABLE_SIZE = 1000;

const seed = JSON.parse(readFileSync(new URL('../supabase/seed/talent.json', import.meta.url), 'utf8')) as SeedTalent[];

// ---------------------------------------------------------------------------
// 1. Validate the file
// ---------------------------------------------------------------------------
const problems: string[] = [];
const slugs = new Set<string>();
for (const t of seed) {
  const where = `${t.name} (${t.slug})`;
  if (!/^[a-z0-9-]+$/.test(t.slug)) problems.push(`${where}: slug must be lowercase letters, numbers, dashes`);
  if (slugs.has(t.slug)) problems.push(`${where}: duplicate slug`);
  slugs.add(t.slug);
  if (!POSITIONS.includes(t.position)) problems.push(`${where}: unknown position ${t.position}`);
  if (!STATUSES.includes(t.status)) problems.push(`${where}: unknown status ${t.status}`);
  if (!t.accounts?.length) problems.push(`${where}: no accounts`);
  const primaries = t.accounts.filter((a) => a.primary).length;
  if (primaries !== 1) problems.push(`${where}: needs exactly one primary account, has ${primaries}`);
  for (const a of t.accounts) {
    if (!KNOWN_PLATFORMS.has(a.platform)) problems.push(`${where}: unknown platform ${a.platform}`);
    if (!/^https:\/\//.test(a.url)) problems.push(`${where}: bad url ${a.url}`);
  }
  const hasGrowth = t.accounts.some((a) => GROWTH_PLATFORMS.has(a.platform));
  const hasHeat = t.accounts.some((a) => HEAT_PLATFORMS.has(a.platform));
  if (t.status === 'draftable' && !(hasGrowth && hasHeat)) {
    problems.push(`${where}: marked draftable but lacks a Growth or Heat source`);
  }
}
if (problems.length) {
  console.error('Seed file problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Seed file OK: ${seed.length} talent, ${seed.filter((t) => t.status === 'draftable').length} draftable`);

// ---------------------------------------------------------------------------
// 2. Check links (YouTube size and Wikipedia page). Warnings only.
// ---------------------------------------------------------------------------
const ytKey = process.env.YOUTUBE_API_KEY;
const warnings: string[] = [];
const ytIds = seed.flatMap((t) => t.accounts.filter((a) => a.platform === 'youtube' && a.external_id).map((a) => a.external_id!));
const ytSubs = new Map<string, number>();
if (ytKey && ytIds.length) {
  for (let i = 0; i < ytIds.length; i += 50) {
    const batch = ytIds.slice(i, i + 50).join(',');
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${batch}&key=${ytKey}`);
    const data = (await res.json()) as { items?: { id: string; statistics: { subscriberCount: string } }[]; error?: { message: string } };
    if (data.error) warnings.push(`YouTube API: ${data.error.message}`);
    for (const item of data.items ?? []) ytSubs.set(item.id, Number(item.statistics.subscriberCount));
  }
} else if (!ytKey) {
  warnings.push('YOUTUBE_API_KEY not set, skipping YouTube checks');
}

const wikiTitles = seed.flatMap((t) => t.accounts.filter((a) => a.platform === 'wikipedia').map((a) => a.external_id!));
const wikiFound = new Set<string>();
if (wikiTitles.length) {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitles.join('|'))}&redirects=1&format=json`,
    { headers: { 'User-Agent': 'DayOnesSeed/0.1 (fantasy league prototype; node)' } },
  );
  if (res.ok) {
    const data = (await res.json()) as { query: { pages: Record<string, { title: string; missing?: string }>; redirects?: { from: string; to: string }[] } };
    const redirects = new Map((data.query.redirects ?? []).map((r) => [r.from, r.to]));
    const present = new Set(Object.values(data.query.pages).filter((p) => p.missing === undefined).map((p) => p.title));
    for (const t of wikiTitles) {
      const final = redirects.get(t) ?? t;
      if (present.has(final)) wikiFound.add(t);
      else warnings.push(`Wikipedia page missing: ${t}`);
      if (redirects.has(t)) warnings.push(`Wikipedia "${t}" redirects to "${final}", consider using that title`);
    }
  } else {
    warnings.push(`Wikipedia check skipped (HTTP ${res.status})`);
  }
}

for (const t of seed) {
  const primary = t.accounts.find((a) => a.primary)!;
  if (primary.platform === 'youtube' && primary.external_id && ytSubs.size) {
    const subs = ytSubs.get(primary.external_id);
    if (subs === undefined) warnings.push(`${t.name}: YouTube channel ${primary.external_id} not found`);
    else if (t.status === 'draftable' && subs < MIN_DRAFTABLE_SIZE) warnings.push(`${t.name}: only ${subs} subscribers, below the ${MIN_DRAFTABLE_SIZE} minimum`);
  }
}
if (warnings.length) console.log('Warnings:\n  ' + warnings.join('\n  '));

// ---------------------------------------------------------------------------
// 3. Report, then upload
// ---------------------------------------------------------------------------
const pad = (s: string, n: number) => s.padEnd(n);
for (const t of seed) {
  const primary = t.accounts.find((a) => a.primary)!;
  const subs = primary.platform === 'youtube' && primary.external_id ? ytSubs.get(primary.external_id) : undefined;
  console.log(
    `${pad(t.position, 9)} ${pad(t.status, 10)} ${pad(t.name, 24)} ${pad(primary.platform, 10)} ${subs !== undefined ? subs.toLocaleString() : ''}`,
  );
}

if (DRY_RUN) {
  console.log('\nDry run: nothing written.');
  process.exit(0);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

let added = 0;
let updated = 0;
for (const t of seed) {
  const { data: existing, error: findError } = await db.from('talent').select('id, status').eq('slug', t.slug).maybeSingle();
  if (findError) throw findError;

  const row = { name: t.name, slug: t.slug, position: t.position, tags: t.tags, bio: t.note ?? null };
  let talentId: string;
  if (existing) {
    // Keep a hand-set "retired" status; otherwise follow the file.
    const status = existing.status === 'retired' ? 'retired' : t.status;
    const { error } = await db.from('talent').update({ ...row, status }).eq('id', existing.id);
    if (error) throw error;
    talentId = existing.id;
    updated++;
  } else {
    const { data, error } = await db.from('talent').insert({ ...row, status: t.status }).select('id').single();
    if (error) throw error;
    talentId = data.id;
    added++;
  }

  for (const a of t.accounts) {
    const { error } = await db.from('talent_accounts').upsert(
      {
        talent_id: talentId,
        platform_id: a.platform,
        url: a.url,
        external_id: a.external_id ?? null,
        is_primary: Boolean(a.primary),
      },
      { onConflict: 'talent_id,platform_id,url' },
    );
    if (error) throw new Error(`${t.name} / ${a.platform}: ${error.message}`);
  }
}

const { count } = await db.from('talent').select('*', { count: 'exact', head: true });
console.log(`\nDone. Added ${added}, updated ${updated}. Talent in database: ${count}.`);
