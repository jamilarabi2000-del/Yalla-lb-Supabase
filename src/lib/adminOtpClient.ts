import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Isolated Auth client for the administrator email-code step.
 *
 * Supabase's signInWithOtp() is a sign-in flow. If it is called on the
 * application's primary client while a password session already exists,
 * Supabase can replace/sign out that primary session. The admin flow needs
 * the password session to remain untouched while the email code is sent and
 * verified, so this client deliberately has its own non-persistent session.
 */
export const adminOtpClient = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabasePublishableKey || 'development-publishable-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  }
);
