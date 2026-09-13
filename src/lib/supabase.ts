import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const isProduction = Boolean(import.meta.env.PROD);

if (isProduction && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    '[Supabase Setup] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Production cannot start without Supabase configuration.'
  );
}

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    '[Supabase Setup] Supabase environment variables are missing. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for local development.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabasePublishableKey || 'development-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage:
        typeof window !== 'undefined'
          ? window.localStorage
          : undefined,
    },
  }
);
