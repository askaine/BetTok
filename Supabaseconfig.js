// supabaseConfig.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://irumgsmovbjkvipsnzfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5zl7u42KoZvJY9X1xVEq9w_yQmnpueB';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Helper: call an edge function
export async function callApi(path, body = {}, method = 'POST') {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// Helper: GET request to edge function
export async function getApi(path, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const query = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/functions/v1/api${path}${query ? '?' + query : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}