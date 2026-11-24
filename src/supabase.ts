import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL/ANON_KEY — copy .env.example to .env and fill in your project values'
      );
    }
    client = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Returns the current user id, signing in anonymously on first run. */
export async function ensureSignedIn(): Promise<string> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.user.id;
}
