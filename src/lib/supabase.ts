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

export type ConnectionStatus = 'missing-keys' | 'connected' | 'no-tables' | 'bad-key' | 'unreachable';

export type ConnectionResult = { status: ConnectionStatus; talentCount: number | null };

/**
 * Pings the database by counting talent. "no-tables" means the keys work
 * but the schema hasn't been applied yet.
 */
export async function checkConnection(): Promise<ConnectionResult> {
  if (!supabase) return { status: 'missing-keys', talentCount: null };
  try {
    const { count, error } = await supabase.from('talent').select('*', { count: 'exact', head: true });
    if (!error) return { status: 'connected', talentCount: count ?? 0 };
    if (error.code === 'PGRST205' || error.code === '42P01') return { status: 'no-tables', talentCount: null };
    if (/jwt|api key|apikey|unauthorized|invalid/i.test(error.message)) return { status: 'bad-key', talentCount: null };
    return { status: 'unreachable', talentCount: null };
  } catch {
    return { status: 'unreachable', talentCount: null };
  }
}
