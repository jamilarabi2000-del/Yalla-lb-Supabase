import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Isolated Auth client for the administrator email-code step.
 *
 * Supabase's signInWithOtp() is a sign-in flow. It must never share the
 * application's primary Auth client/session. This client therefore uses:
 * - a separate storage namespace
 * - non-persistent session storage
 * - no URL/session detection
 * - no token auto-refresh
 *
 * The primary password session remains owned exclusively by `supabase`.
 */
export const adminOtpClient = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabasePublishableKey || 'development-publishable-key',
  {
    auth: {
      storageKey: 'yalla-admin-otp-auth',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  }
);
