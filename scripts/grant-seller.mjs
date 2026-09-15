import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const identifier = process.argv[2];
const sellerId = process.argv[3];

if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
  process.exit(1);
}

if (!identifier || !sellerId) {
  console.error('Usage: npm run grant-seller -- <email_or_uid> <seller_uuid>');
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

  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('id, is_active, account_uid, has_account')
    .eq('id', sellerId)
    .maybeSingle();
  if (sellerError) throw sellerError;
  if (!seller) throw new Error(`No seller record exists for seller UUID ${sellerId}. Refusing to create one from the client-side admin tooling.`);

  if (seller.account_uid && seller.account_uid !== userId) {
    throw new Error(`Seller ${sellerId} is already linked to another Auth user. Refusing to reassign it implicitly.`);
  }

  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, seller_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!existingProfile) throw new Error(`No profile exists for Supabase Auth user ${userId}.`);

  if (existingProfile.role === 'admin') {
    throw new Error('Refusing to downgrade an admin account to seller through this script. Use the dedicated admin workflow first.');
  }

  if (existingProfile.seller_id && existingProfile.seller_id !== sellerId) {
    throw new Error(`User ${userId} is already linked to seller ${existingProfile.seller_id}. Refusing to reassign implicitly.`);
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ role: 'seller', seller_id: sellerId })
    .eq('id', userId);
  if (profileUpdateError) throw profileUpdateError;

  const { error: sellerUpdateError } = await supabase
    .from('sellers')
    .update({
      account_uid: userId,
      account_email: email,
      has_account: true,
      is_active: true,
    })
    .eq('id', sellerId);
  if (sellerUpdateError) throw sellerUpdateError;

  console.log(`Seller role granted in public.profiles.`);
  console.log(`Seller account linked in public.sellers.`);
  console.log(`Email: ${email || '(not available)'}`);
  console.log(`UID: ${userId}`);
  console.log(`Seller UUID: ${sellerId}`);
  console.log('Role: seller');
} catch (error) {
  console.error(`Error granting seller privileges to ${identifier}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
