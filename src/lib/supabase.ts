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

const supabaseClient = createClient(
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

/**
 * Every RPC the browser calls lives in the `public` schema.
 *
 * `public` is the only schema guaranteed to be exposed through the Data API —
 * whether `private` is exposed is a dashboard setting that is invisible from
 * the code, so depending on it makes checkout, product creation and the
 * administrator step-up silently unreachable if it is ever off. The
 * implementations stay in `private`; `public` holds a thin delegate per
 * operation, each of which keeps the private function's own authorization.
 * See 20260919080000_public_api_wrappers_for_private_rpcs.sql.
 *
 * Checkout in particular must go through public.checkout_create_order, which
 * delegates to private.checkout_create_order_gateway so that every stock
 * decrement is recorded as a sale in the same transaction. A runtime Proxy
 * used to rewrite that function name on the way out; the wrapper makes it
 * unnecessary, so the Proxy is gone and this is now a plain client.
 *
 * IMPORTANT: auth.signInWithOtp is deliberately NOT intercepted anywhere.
 * OTP behavior must remain scoped to the calling flow; a global wrapper that
 * signs out an existing session can break normal login/signup verification.
 */
export const supabase: any = supabaseClient;
