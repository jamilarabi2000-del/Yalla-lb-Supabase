import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const required = ['CUSTOMER_A_EMAIL','CUSTOMER_A_PASSWORD','CUSTOMER_B_EMAIL','CUSTOMER_B_PASSWORD','SELLER_A_EMAIL','SELLER_A_PASSWORD','SELLER_B_EMAIL','SELLER_B_PASSWORD'];
if (!url || !key || required.some((k) => !process.env[k])) {
  console.error(`Live security gate requires VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and ${required.join(', ')}.`);
  process.exit(2);
}

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const a = client(); const b = client(); const sa = client(); const sb = client();
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function signIn(c, email, password) {
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  must(Boolean(data.session && data.user), `Login failed for ${email}`);
  return data.user;
}

const userA = await signIn(a, process.env.CUSTOMER_A_EMAIL, process.env.CUSTOMER_A_PASSWORD);
const userB = await signIn(b, process.env.CUSTOMER_B_EMAIL, process.env.CUSTOMER_B_PASSWORD);
const sellerA = await signIn(sa, process.env.SELLER_A_EMAIL, process.env.SELLER_A_PASSWORD);
const sellerB = await signIn(sb, process.env.SELLER_B_EMAIL, process.env.SELLER_B_PASSWORD);

// Customer IDOR: B must not read A's profile/order rows.
const { data: foreignProfile, error: profileError } = await b.from('profiles').select('id,email,role').eq('id', userA.id).maybeSingle();
must(!profileError && foreignProfile === null, `Customer IDOR: B could read A profile: ${JSON.stringify(foreignProfile)}`);
const { data: foreignOrders, error: ordersError } = await b.from('orders').select('id,user_id').eq('user_id', userA.id);
must(!ordersError && (foreignOrders?.length ?? 0) === 0, `Customer IDOR: B could read A orders: ${JSON.stringify(foreignOrders)}`);

// Seller isolation: seller B must not see seller A owned products/ledger.
const { data: sellerBProfile } = await b.from('profiles').select('seller_id').eq('id', sellerB.id).maybeSingle();
const { data: sellerAProfile } = await a.from('profiles').select('seller_id').eq('id', sellerA.id).maybeSingle();
must(Boolean(sellerAProfile?.seller_id && sellerBProfile?.seller_id), 'Seller profiles must be linked to seller records before isolation testing.');
const { data: foreignProducts, error: productError } = await sb.from('products').select('id,seller_id').eq('seller_id', sellerAProfile.seller_id);
must(!productError && (foreignProducts?.length ?? 0) === 0, `Seller isolation failed: B could read A products: ${JSON.stringify(foreignProducts)}`);
const { data: foreignLedger, error: ledgerError } = await sb.from('inventory_ledger').select('id,seller_id').eq('seller_id', sellerAProfile.seller_id);
must(!ledgerError && (foreignLedger?.length ?? 0) === 0, `Seller isolation failed: B could read A inventory ledger.`);

// Storage ownership: A writes inside an A-owned private path; B must not read/delete it.
const path = `security-gate/${userA.id}/probe-${Date.now()}.txt`;
const body = new Blob(['yalla-security-gate']);
const { error: uploadError } = await a.storage.from('yalla-private').upload(path, body, { upsert: false, contentType: 'text/plain' });
if (!uploadError) {
  const { data: foreignDownload, error: foreignDownloadError } = await b.storage.from('yalla-private').download(path);
  must(Boolean(foreignDownloadError) || !foreignDownload, 'Storage ownership failed: B downloaded A private object.');
  const { error: foreignDeleteError } = await b.storage.from('yalla-private').remove([path]);
  must(Boolean(foreignDeleteError), 'Storage ownership failed: B deleted A private object.');
  await a.storage.from('yalla-private').remove([path]);
} else {
  console.warn(`Storage probe skipped because A could not upload to yalla-private: ${uploadError.message}`);
}

// Session revocation: global sign-out must invalidate the active session for refresh.
const { error: revokeError } = await a.auth.signOut({ scope: 'global' });
must(!revokeError, `Global session revocation failed: ${revokeError?.message}`);
const { data: refreshed, error: refreshError } = await a.auth.refreshSession();
must(Boolean(refreshError) || !refreshed.session, 'Session revocation failed: old session refreshed successfully.');

await b.auth.signOut(); await sa.auth.signOut(); await sb.auth.signOut();
console.log(JSON.stringify({
  customerIdor: 'PASS',
  sellerIsolation: 'PASS',
  storageOwnership: uploadError ? 'SKIPPED_UPLOAD_POLICY' : 'PASS',
  sessionRevocation: 'PASS',
  note: 'OTP expiry/replay and email delivery still require a real mailbox/code because the code is delivered outside the database API.'
}, null, 2));
