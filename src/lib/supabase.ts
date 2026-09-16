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
 * Temporary migration boundary: legacy Firebase-shaped UI code performs
 * highly dynamic Supabase queries. Keep the runtime client identical while
 * preventing generated query unions from overwhelming TypeScript during the
 * migration. Database/RLS authorization remains enforced by Supabase.
 *
 * Checkout is transparently routed through the inventory-audited gateway so
 * every stock decrement is recorded as a sale in the same transaction.
 */
const supabaseRuntime = new Proxy(supabaseClient as any, {
  get(target, property, receiver) {
    if (property === 'auth') {
      const authClient = Reflect.get(target, property, receiver);
      return new Proxy(authClient as any, {
        get(authTarget, authProperty, authReceiver) {
          if (authProperty !== 'signInWithOtp') {
            return Reflect.get(authTarget, authProperty, authReceiver);
          }

          /**
           * A password login followed by email OTP verification must use one
           * clean OTP authentication flow. If an existing Supabase session is
           * present, clear it before requesting the OTP. Otherwise the
           * password-authenticated session can race with the passwordless OTP
           * flow and leave the client in an inconsistent auth state.
           */
          return async (credentials: Record<string, unknown>) => {
            const { data: sessionData } = await authTarget.getSession();
            if (sessionData?.session) {
              const { error: signOutError } = await authTarget.signOut();
              if (signOutError) throw signOutError;
            }

            return authTarget.signInWithOtp(credentials);
          };
        },
      });
    }

    if (property !== 'schema') return Reflect.get(target, property, receiver);

    return (schemaName: string) => {
      const schemaClient = target.schema(schemaName);
      if (schemaName !== 'private') return schemaClient;

      return new Proxy(schemaClient as any, {
        get(schemaTarget, schemaProperty, schemaReceiver) {
          if (schemaProperty !== 'rpc') {
            return Reflect.get(schemaTarget, schemaProperty, schemaReceiver);
          }

          return (functionName: string, args?: Record<string, unknown>, options?: unknown) => {
            const effectiveName =
              functionName === 'checkout_create_order'
                ? 'checkout_create_order_gateway'
                : functionName;
            return schemaTarget.rpc(effectiveName, args, options);
          };
        },
      });
    };
  },
});

export const supabase: any = supabaseRuntime;
