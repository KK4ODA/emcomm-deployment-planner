import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The Supabase JS client's default Web Locks API can deadlock when multiple
// async paths (AuthContext + page components) call getSession concurrently.
// Bypass it with a no-op lock; we don't need cross-tab serialization here.
const noopLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: noopLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
