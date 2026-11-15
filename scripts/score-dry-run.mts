/// <reference types="node" />
/** Dry run of weekly scoring against the live database. Writes nothing.  npm run score:check */
import { createClient } from '@supabase/supabase-js';

import { runScoring } from '../supabase/functions/daily-stats/scoring-run.ts';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const out = await runScoring(db, { write: false, weeks: process.argv[2] ? [process.argv[2]] : undefined });
for (const ws of out.weeks) {
  const rows = out.scored.filter((r) => r.week_start === ws).sort((a, b) => b.total - a.total);
  console.log(`\nWeek of ${ws}: ${rows.length} talent scored${rows[0]?.is_final ? ' (final)' : ' (in progress)'}`);
  for (const r of rows.slice(0, 12)) {
    const h = r.details.heat as { winner: string | null; ratio: number | null };
    console.log(`  ${r.name.padEnd(22)} total ${String(r.total).padStart(6)}  growth ${String(r.growth_points).padStart(6)}  heat ${String(r.heat_points).padStart(5)}${h.winner ? ` (${h.winner} ${h.ratio}x)` : ''}  milestones ${r.milestone_points}`);
  }
}
