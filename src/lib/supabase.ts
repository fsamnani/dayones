import { createClient } from '@supabase/supabase-js';

// These two values are public by design (safe to ship inside the app).
// Real values live in .env, which is never committed.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      // Sign-in storage gets set up when we build accounts (step 9 area).
      auth: { persistSession: false },
    })
  : null;

export type ConnectionStatus = 'missing-keys' | 'connected' | 'bad-key' | 'unreachable';

/**
 * Pings the database. There are no tables yet, so we ask for one that
 * doesn't exist: a "table not found" reply proves the URL and key work.
 */
export async function checkConnection(): Promise<ConnectionStatus> {
  if (!supabase) return 'missing-keys';
  try {
    const { error } = await supabase.from('_ping').select('*').limit(1);
    if (!error) return 'connected';
    if (error.code === 'PGRST205' || error.code === '42P01') return 'connected';
    if (/jwt|api key|apikey|unauthorized|invalid/i.test(error.message)) return 'bad-key';
    if (/fetch|network/i.test(error.message)) return 'unreachable';
    return 'connected';
  } catch {
    return 'unreachable';
  }
}
