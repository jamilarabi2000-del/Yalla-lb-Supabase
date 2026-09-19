import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Supabase function environment is not configured.');
}

const ADMIN_ROLES = new Set(['admin']);
const PRIVILEGED_ROLES = new Set(['admin', 'seller']);

function getAllowedOrigins(): Set<string> {
  // Production aliases are explicit defaults; additional domains must be
  // configured through ALLOWED_ORIGINS / APP_URL / SITE_URL. Never reflect an
  // arbitrary request Origin.
  const raw = [
    'https://yalla-lb-supabase.vercel.app',
    'https://yalla-lb-supabase-jamilarabi2000-4313.vercel.app',
    Deno.env.get('APP_URL'),
    Deno.env.get('SITE_URL'),
    Deno.env.get('ALLOWED_ORIGINS'),
  ]
    .filter(Boolean)
    .join(',');

  return new Set(
    raw
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (!origin) return headers;

  // Unknown origins receive no ACAO header. The browser will enforce
  // same-origin/CORS restrictions rather than being granted reflected access.
  if (allowed.has(origin.replace(/\/$/, ''))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function validatePrivilegedPassword(password: string): string | null {
  const obviousPatterns = [
    /^(.)\1+$/,
    /^(?:012|123|234|345|456|567|678|789|890)+/,
    /password/i,
    /qwerty/i,
    /^yalla\d*!?$/i,
  ];

  if (password.length < 12) {
    return 'Privileged passwords require at least 12 characters.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Privileged passwords require uppercase and lowercase letters.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Privileged passwords require at least one digit.';
  }
  if (!/[!@#$%^&*()_+~`|}{[\]:;?><,./\-=]/.test(password)) {
    return 'Privileged passwords require at least one special symbol.';
  }
  if (obviousPatterns.some((pattern) => pattern.test(password))) {
    return 'Password is too predictable.';
  }

  return null;
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed.' }, 405);
  }

  const authorization = req.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json(req, { error: 'Authentication required.' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let actorId: string | null = null;
  let auditAttemptId: string | null = null;

  try {
    // The service-role client is used only after the caller's JWT is verified.
    const { data: { user: actor }, error: actorError } = await admin.auth.getUser(token);
    if (actorError || !actor) {
      throw new Error('Invalid authentication.');
    }
    actorId = actor.id;

    const { data: actorProfile, error: actorProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', actor.id)
      .maybeSingle();

    if (actorProfileError) throw actorProfileError;
    if (!actorProfile || !ADMIN_ROLES.has(actorProfile.role)) {
      return json(req, { error: 'Admin access required.' }, 403);
    }

    const body = await req.json();
    const sellerId = typeof body.sellerId === 'string' ? body.sellerId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const applicantUserId =
      typeof body.applicantUserId === 'string' ? body.applicantUserId.trim() : null;

    if (!isValidUuid(sellerId) || !email || !password) {
      return json(req, { error: 'sellerId, email and password are required.' }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: 'A valid email address is required.' }, 400);
    }

    const passwordError = validatePrivilegedPassword(password);
    if (passwordError) {
      return json(req, { error: passwordError }, 400);
    }

    const { data: seller, error: sellerError } = await admin
      .from('sellers')
      .select('id,name_en,account_uid,account_email,has_account')
      .eq('id', sellerId)
      .maybeSingle();

    if (sellerError) throw sellerError;
    if (!seller) {
      return json(req, { error: 'Seller not found.' }, 404);
    }

    // The request may identify an applicant only as a hint. It can never choose
    // an arbitrary auth user. The final UID must come from the seller record or
    // an approved application tied to this seller.
    let targetUid: string | null = seller.account_uid ?? null;
    let applicationId: string | null = null;

    if (!targetUid && applicantUserId) {
      if (!isValidUuid(applicantUserId)) {
        return json(req, { error: 'Invalid applicant reference.' }, 400);
      }

      const { data: applications, error: applicationError } = await admin
        .from('seller_applications')
        .select('id,applicant_user_id,payload,status')
        .eq('applicant_user_id', applicantUserId)
        .eq('status', 'approved')
        .limit(20);

      if (applicationError) throw applicationError;

      const matchingApplication = (applications ?? []).find((application) => {
        const payload = application.payload && typeof application.payload === 'object'
          ? application.payload as Record<string, unknown>
          : {};
        const payloadSellerId = payload.sellerId ?? payload.seller_id;
        return payloadSellerId === sellerId;
      });

      if (!matchingApplication) {
        return json(req, { error: 'Applicant is not linked to an approved application for this seller.' }, 403);
      }

      targetUid = matchingApplication.applicant_user_id;
      applicationId = matchingApplication.id;
    }

    // If the seller already has an account, never let the request body replace
    // its identity. If there is no account, applicantUserId must have been
    // proven through the approved application above.
    if (!targetUid && seller.has_account) {
      return json(req, { error: 'Seller account state is inconsistent; manual review is required.' }, 409);
    }

    let existingProfile: { role: string } | null = null;
    if (targetUid) {
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('role')
        .eq('id', targetUid)
        .maybeSingle();

      if (profileError) throw profileError;
      existingProfile = profile;

      // Never reset credentials for an account that is already privileged.
      if (existingProfile && PRIVILEGED_ROLES.has(existingProfile.role)) {
        return json(req, { error: 'Refusing to re-provision an existing privileged account.' }, 409);
      }
    }

    // Record the attempt before mutating Auth so failed provisioning attempts
    // remain attributable. Never log the password.
    const { data: auditAttempt, error: auditAttemptError } = await admin
      .from('admin_activities')
      .insert({
        actor_id: actorId,
        action_type: 'seller_provision_attempt',
        summary: `Seller account provisioning attempted for seller ${sellerId}`,
        details: JSON.stringify({
          sellerId,
          targetUid,
          applicationId,
          requestedEmail: email,
        }),
        target_id: targetUid ?? sellerId,
        table_name: 'sellers',
        operation: 'provision',
        snapshot_before: {
          sellerId,
          accountUid: seller.account_uid,
          accountEmail: seller.account_email,
          hasAccount: seller.has_account,
          targetUid,
          existingRole: existingProfile?.role ?? null,
        },
      })
      .select('id')
      .single();

    if (auditAttemptError) throw auditAttemptError;
    auditAttemptId = auditAttempt.id;

    if (targetUid) {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(targetUid, {
        password,
        email,
        email_confirm: true,
      });
      if (updateAuthError) throw updateAuthError;
    } else {
      const { data: created, error: createAuthError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createAuthError) throw createAuthError;
      targetUid = created.user?.id ?? null;
    }

    if (!targetUid) throw new Error('Auth user could not be created.');

    const { error: profileUpsertError } = await admin
      .from('profiles')
      .upsert(
        {
          id: targetUid,
          email,
          role: 'seller',
          seller_id: sellerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (profileUpsertError) throw profileUpsertError;

    const { error: sellerUpdateError } = await admin
      .from('sellers')
      .update({
        has_account: true,
        account_email: email,
        account_uid: targetUid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sellerId);

    if (sellerUpdateError) throw sellerUpdateError;

    const { error: auditCompleteError } = await admin
      .from('admin_activities')
      .insert({
        actor_id: actorId,
        action_type: 'seller_provision',
        summary: `Provisioned seller account for seller ${sellerId}`,
        details: JSON.stringify({
          sellerId,
          targetUid,
          applicationId,
          requestedEmail: email,
          attemptAuditId: auditAttemptId,
          status: 'completed',
        }),
        target_id: targetUid,
        table_name: 'sellers',
        operation: 'provision',
        snapshot_before: {
          sellerId,
          accountUid: seller.account_uid,
          accountEmail: seller.account_email,
          hasAccount: seller.has_account,
        },
        snapshot_after: {
          sellerId,
          accountUid: targetUid,
          accountEmail: email,
          hasAccount: true,
          profileRole: 'seller',
        },
      });

    if (auditCompleteError) {
      // Do not expose database details, but surface the failure as a server
      // error so an operator knows the operation completed without its final
      // audit record.
      console.error('Seller provisioning completed but completion audit failed', {
        actorId,
        sellerId,
        targetUid,
        attemptAuditId: auditAttemptId,
        error: auditCompleteError,
      });
      return json(req, { error: 'Provisioning completed, but audit recording failed. Please review the admin activity log.' }, 500);
    }

    return json(req, {
      ok: true,
      sellerId,
      accountUid: targetUid,
      email,
    }, 200);
  } catch (error) {
    console.error('Seller provisioning failed', {
      actorId,
      auditAttemptId,
      error,
    });

    // Best-effort failure audit. The attempt record is already written when
    // mutation begins, so this is supplemental and never contains secrets.
    if (actorId && auditAttemptId) {
      const { error: failureAuditError } = await admin
        .from('admin_activities')
        .insert({
          actor_id: actorId,
          action_type: 'seller_provision_failed',
          summary: 'Seller account provisioning failed',
          details: JSON.stringify({
            attemptAuditId: auditAttemptId,
            status: 'failed',
          }),
          target_id: auditAttemptId,
          table_name: 'admin_activities',
          operation: 'provision',
        });

      if (failureAuditError) {
        console.error('Unable to write seller provisioning failure audit', failureAuditError);
      }
    }

    return json(req, { error: 'Seller provisioning failed.' }, 500);
  }
});
