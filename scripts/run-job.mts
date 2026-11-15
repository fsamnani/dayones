/// <reference types="node" />
/** Trigger the daily-stats job by hand:  npm run job -- daily | live | wiki-backfill */
const task = process.argv[2] ?? 'daily';
const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL!.replace('.supabase.co', '.supabase.co/functions/v1')}/daily-stats?task=${task}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
const body = (await res.json()) as { run: number; status: string; talent_updated: number; snapshots_written: number; errors: string[] };
console.log(`run #${body.run} ${task}: ${body.status}, ${body.talent_updated} talent, ${body.snapshots_written} rows`);
for (const e of body.errors ?? []) console.log('  error:', e);
process.exit(body.status === 'ok' ? 0 : 1);
