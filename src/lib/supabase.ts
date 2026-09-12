import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-publishable-key';

if (!import.meta.env.VITE_SUPABASE_URL || (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  console.info(
    '[Supabase Setup]: Running in migration mode with fallback configuration. Provide VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in environment to connect to production Supabase.'
  );
}

/**
 * Client-side Supabase client instance.
 * Configured with:
 * - Persistent Auth sessions (localStorage)
 * - Automatic token refresh in background
 * - URL session detection (OAuth redirects & magic email links)
 * - Public Publishable/Anon Key ONLY (No Service-Role Key on client)
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
