import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const identifier = process.argv[2];

if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your local environment.');
  process.exit(1);
}

if (!identifier) {
  console.error('Usage: npm run verify-admin -- <email_or_uid>');
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
    const { data, error } = await supabase.auth.admin.getUserById(identifier);
    if (error) throw error;
    email = data.user?.email || null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, email_verified, is_otp_verified')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  console.log(`Supabase Auth user: ${email || '(not available)'}`);
  console.log(`UID: ${userId}`);
  console.log(`Profile exists: ${profile ? 'YES' : 'NO'}`);
  console.log(`Role: ${profile?.role || '(none)'}`);
  console.log(`Email verified flag: ${profile?.email_verified ?? '(none)'}`);
  console.log(`OTP verified flag: ${profile?.is_otp_verified ?? '(none)'}`);
  console.log(`Admin role: ${profile?.role === 'admin' ? 'TRUE' : 'FALSE'}`);
} catch (error) {
  console.error(`Error verifying admin for ${identifier}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
