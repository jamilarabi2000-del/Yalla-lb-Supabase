/**
 * Legacy compatibility entrypoint retained temporarily so older UI modules can
 * compile while their imports are migrated. There is no Firebase SDK here.
 * Supabase Auth and PostgreSQL are the only backend used by this project.
 */
import { supabase } from './lib/supabase';

export const IS_FIREBASE_ENABLED = false;
export const firebaseConfig = {} as Record<string, unknown>;
export const app = supabase;
export const db = supabase;
export const functionsInstance = supabase;
export const auth = supabase.auth;

export class GoogleAuthProvider { providerId = 'google'; }
export class OAuthProvider {
  constructor(public providerId: string) {}
}
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

export class RecaptchaVerifier {
  constructor(..._args: unknown[]) {}
  clear() {}
}

export interface ConfirmationResult {
  confirm(code: string): Promise<{ user: unknown }>;
}

export interface LegacyAuthUser {
  uid: string;
  id: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string | null;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: Record<string, any> }>;
}

const adaptUser = (user: any): LegacyAuthUser | null => {
  if (!user) return null;
  return {
    uid: user.id,
    id: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    phoneNumber: user.phone ?? null,
    displayName: user.user_metadata?.name || user.user_metadata?.full_name || null,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
    getIdToken: async (_forceRefresh = false) => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || '';
    },
    getIdTokenResult: async (_forceRefresh = false) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) return { claims: {} };
      const { data: profile } = await supabase.from('profiles').select('role,seller_id').eq('id', uid).maybeSingle();
      return {
        claims: {
          admin: profile?.role === 'admin',
          seller: profile?.role === 'seller',
          ...(profile?.seller_id ? { sellerId: profile.seller_id } : {}),
        },
      };
    },
  };
};

export const signInWithPhoneNumber = async (_auth: unknown, phone: string, _verifier: unknown): Promise<ConfirmationResult> => {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return {
    async confirm(code: string) {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (verifyError) throw verifyError;
      return { user: adaptUser(data.user) };
    },
  };
};

export const signInWithPopup = async (_auth: unknown, provider: GoogleAuthProvider | OAuthProvider) => {
  const providerName = provider instanceof GoogleAuthProvider ? 'google' : 'apple';
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: providerName as 'google' | 'apple', options: { redirectTo: window.location.origin } });
  if (error) throw error;
  return data;
};

export const signOut = (_auth: unknown = auth) => supabase.auth.signOut();
export const onAuthStateChanged = (_auth: unknown, callback: (user: LegacyAuthUser | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => callback(adaptUser(session?.user ?? null)));
  return () => data.subscription.unsubscribe();
};
export const onIdTokenChanged = onAuthStateChanged;

export const signInWithEmailAndPassword = async (_auth: unknown, email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: adaptUser(data.user) as LegacyAuthUser };
};

export const createUserWithEmailAndPassword = async (_auth: unknown, email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: adaptUser(data.user) };
};

export const sendPasswordResetEmail = async (_auth: unknown, email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account?resetPassword=true` });
  if (error) throw error;
};

export const sendEmailVerification = async (_user: any) => {
  if (!_user?.email) throw new Error('No email address is available.');
  const { error } = await supabase.auth.resend({ type: 'signup', email: _user.email, options: { emailRedirectTo: `${window.location.origin}/account?verified=true` } });
  if (error) throw error;
};

export const sendSignInLinkToEmail = async (_auth: unknown, email: string, options: { url?: string } = {}) => {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: options.url || window.location.origin, shouldCreateUser: false } });
  if (error) throw error;
};

export const isSignInWithEmailLink = (_auth: unknown, url: string) => Boolean(url && /[?&](code|token_hash)=/.test(url));
export const signInWithEmailLink = async (_auth: unknown, email: string, url: string) => {
  const parsed = new URL(url);
  const tokenHash = parsed.searchParams.get('token_hash');
  const type = parsed.searchParams.get('type') as any;
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'magiclink' });
    if (error) throw error;
    return { user: adaptUser(data.user) };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { user: adaptUser(data.session?.user ?? null) };
};

type HttpsCallableResult<T> = { data: T };
export const httpsCallable = <Req = unknown, Res = unknown>(_functions: unknown, name: string) => async (data?: Req): Promise<HttpsCallableResult<Res>> => {
  const rpcMap: Record<string, string> = {
    checkPhoneAvailability: 'is_phone_available',
    isPhoneAvailable: 'is_phone_available',
  };
  const rpc = rpcMap[name];
  if (!rpc) throw new Error(`Legacy callable '${name}' is not available in the Supabase build.`);
  const { data: result, error } = await supabase.rpc(rpc, data as any);
  if (error) throw error;
  return { data: result as Res };
};

export type FirebaseUser = LegacyAuthUser;
