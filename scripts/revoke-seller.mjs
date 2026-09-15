import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const identifier = process.argv[2];

if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
  process.exit(1);
}

if (!identifier) {
  console.error('Usage: npm run revoke-seller -- <email_or_uid>');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  let userId = identifier;
  let email = identifier.includes('@') ? identifier.toLowerCase() : null;

  if (email) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (!user) throw new Error(`No Supabase Auth user found for ${email}.`);
    userId = user.id;
    email = user.email || email;
  } else {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    email = data.user?.email || null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, seller_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`No profile exists for Supabase Auth user ${userId}.`);

  if (profile.role !== 'seller' && !profile.seller_id) {
    console.log(`No seller role/link is present for ${email || userId}. Nothing to revoke.`);
    process.exit(0);
  }

  const sellerId = profile.seller_id;

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ role: 'customer', seller_id: null })
    .eq('id', userId);
  if (profileUpdateError) throw profileUpdateError;

  if (sellerId) {
    const { error: sellerUpdateError } = await supabase
      .from('sellers')
      .update({
        account_uid: null,
        account_email: null,
        has_account: false,
        is_active: false,
      })
      .eq('id', sellerId)
      .eq('account_uid', userId);
    if (sellerUpdateError) throw sellerUpdateError;
  }

  const { error: signOutError } = await supabase.auth.admin.signOut(userId, 'global');
  if (signOutError) throw signOutError;

  console.log(`Seller privileges revoked in public.profiles.`);
  console.log(`Seller account deactivated in public.sellers.`);
  console.log(`Email: ${email || '(not available)'}`);
  console.log(`UID: ${userId}`);
  console.log(`Seller UUID: ${sellerId || '(none)'}`);
} catch (error) {
  console.error(`Error revoking seller status for ${identifier}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
