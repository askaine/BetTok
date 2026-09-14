// Supabaseconfig.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:              AsyncStorage,
    autoRefreshToken:     true,
    persistSession:       true,
    detectSessionInUrl:   false,
  },
});

// ── GET request to Edge Function ──────────────────────────
export async function getApi(path, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const query = new URLSearchParams(params).toString();
  const url   = `${SUPABASE_URL}/functions/v1/api${path}${query ? '?' + query : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}

// ── POST request to Edge Function ─────────────────────────
export async function callApi(path, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const url = `${SUPABASE_URL}/functions/v1/api${path}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization':  token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey':         SUPABASE_ANON_KEY,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}
