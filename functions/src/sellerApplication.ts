import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db.js';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Creates a deterministic, non-reversible SHA-256 hash for PII identifiers (email/phone).
 */
export function hashIdentifier(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

/**
 * Normalized Lebanese phone helper for server-side validation.
 */
export function normalizeServerLebanesePhone(rawPhone: string | null | undefined): {
  raw: string;
  cleanDigits: string;
  formatted: string;
  isValid: boolean;
} {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { raw: '', cleanDigits: '', formatted: '', isValid: false };
  }

  const raw = rawPhone.trim();
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('961') && digits.length >= 10) {
    digits = digits.slice(3);
  }

  if (digits.length === 7 && digits.startsWith('3')) {
    digits = '0' + digits;
  }

  const isValid = digits.length === 8 && /^[0-9]{8}$/.test(digits);
  const formatted = isValid ? `+961 ${digits}` : raw;

  return { raw, cleanDigits: digits, formatted, isValid };
}

export const ALLOWED_SELLER_APP_KEYS = new Set([
  'sellerCompany',
  'workshopName',
  'workshopNameAr',
  'nameEn',
  'nameAr',
  'firstName',
  'middleName',
  'lastName',
  'contactName',
  'email',
  'phone',
  'village',
  'governorate',
  'craftType',
  'craftCategory',
  'story',
  'bio',
  'socialLink'
]);

export interface SellerApplicationInput {
  sellerCompany: string;
  workshopName?: string;
  workshopNameAr?: string;
  nameEn?: string;
  nameAr?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  contactName?: string;
  email: string;
  phone: string;
  village?: string;
  governorate?: string;
  craftType?: string;
  craftCategory?: string;
  story?: string;
  bio?: string;
  socialLink?: string;
}

export interface ValidatedSellerApplication {
  sellerCompany: string;
  workshopName: string;
  workshopNameAr?: string;
  nameEn?: string;
  nameAr?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  contactName: string;
  email: string;
  phone: string;
  cleanPhone: string;
  village?: string;
  governorate?: string;
  craftType?: string;
  craftCategory?: string;
  story?: string;
  bio?: string;
  socialLink?: string;
}

export function validateSellerApplicationPayload(data: any): ValidatedSellerApplication {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Request payload must be a non-null object.');
  }

  // 1. Strict allowlist validation
  for (const key of Object.keys(data)) {
    if (!ALLOWED_SELLER_APP_KEYS.has(key)) {
      throw new HttpsError('invalid-argument', `Unexpected property in seller application: "${key}".`);
    }
  }

  const {
    sellerCompany,
    workshopName,
    workshopNameAr,
    nameEn,
    nameAr,
    firstName,
    middleName,
    lastName,
    contactName,
    email,
    phone,
    village,
    governorate,
    craftType,
    craftCategory,
    story,
    bio,
    socialLink
  } = data;

  // 2. Required fields
  if (typeof sellerCompany !== 'string' || !sellerCompany.trim()) {
    throw new HttpsError('invalid-argument', 'Company or workshop name is required.');
  }
  const cleanCompany = sellerCompany.trim();
  if (cleanCompany.length > 200) {
    throw new HttpsError('invalid-argument', 'Company name must not exceed 200 characters.');
  }

  if (typeof firstName !== 'string' || !firstName.trim()) {
    throw new HttpsError('invalid-argument', 'First name is required.');
  }
  const cleanFirstName = firstName.trim();
  if (cleanFirstName.length > 100) {
    throw new HttpsError('invalid-argument', 'First name must not exceed 100 characters.');
  }

  if (typeof lastName !== 'string' || !lastName.trim()) {
    throw new HttpsError('invalid-argument', 'Last name is required.');
  }
  const cleanLastName = lastName.trim();
  if (cleanLastName.length > 100) {
    throw new HttpsError('invalid-argument', 'Last name must not exceed 100 characters.');
  }

  if (typeof email !== 'string' || !email.trim()) {
    throw new HttpsError('invalid-argument', 'Email address is required.');
  }
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }

  if (typeof phone !== 'string' || !phone.trim()) {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }
  const normPhone = normalizeServerLebanesePhone(phone);
  if (!normPhone.isValid) {
    throw new HttpsError(
      'invalid-argument',
      'Please enter a valid 8-digit Lebanese mobile phone number (e.g., 70 123 456).'
    );
  }

  // 3. Optional bounded string fields
  const cleanMiddleName = typeof middleName === 'string' && middleName.trim() ? middleName.trim().slice(0, 100) : undefined;
  const cleanWorkshopName = typeof workshopName === 'string' && workshopName.trim() ? workshopName.trim().slice(0, 200) : cleanCompany;
  const cleanWorkshopNameAr = typeof workshopNameAr === 'string' && workshopNameAr.trim() ? workshopNameAr.trim().slice(0, 200) : undefined;
  const cleanNameEn = typeof nameEn === 'string' && nameEn.trim() ? nameEn.trim().slice(0, 200) : undefined;
  const cleanNameAr = typeof nameAr === 'string' && nameAr.trim() ? nameAr.trim().slice(0, 200) : undefined;
  const cleanContactName = typeof contactName === 'string' && contactName.trim()
    ? contactName.trim().slice(0, 300)
    : `${cleanFirstName} ${cleanMiddleName ? cleanMiddleName + ' ' : ''}${cleanLastName}`.trim();

  const cleanVillage = typeof village === 'string' && village.trim() ? village.trim().slice(0, 120) : undefined;
  const cleanGovernorate = typeof governorate === 'string' && governorate.trim() ? governorate.trim().slice(0, 120) : undefined;
  const cleanCraftType = typeof craftType === 'string' && craftType.trim() ? craftType.trim().slice(0, 120) : undefined;
  const cleanCraftCategory = typeof craftCategory === 'string' && craftCategory.trim() ? craftCategory.trim().slice(0, 120) : undefined;
  const cleanStory = typeof story === 'string' && story.trim() ? story.trim().slice(0, 2000) : undefined;
  const cleanBio = typeof bio === 'string' && bio.trim() ? bio.trim().slice(0, 2000) : undefined;
  const cleanSocialLink = typeof socialLink === 'string' && socialLink.trim() ? socialLink.trim().slice(0, 500) : undefined;

  return {
    sellerCompany: cleanCompany,
    workshopName: cleanWorkshopName,
    workshopNameAr: cleanWorkshopNameAr,
    nameEn: cleanNameEn,
    nameAr: cleanNameAr,
    firstName: cleanFirstName,
    middleName: cleanMiddleName,
    lastName: cleanLastName,
    contactName: cleanContactName,
    email: cleanEmail,
    phone: normPhone.formatted,
    cleanPhone: normPhone.cleanDigits,
    village: cleanVillage,
    governorate: cleanGovernorate,
    craftType: cleanCraftType,
    craftCategory: cleanCraftCategory,
    story: cleanStory,
    bio: cleanBio,
    socialLink: cleanSocialLink
  };
}

export interface SubmissionContext {
  appCheckId?: string;
  uid?: string;
  ip?: string;
}

export interface SubmissionResult {
  success: boolean;
  applicationId: string;
  message: string;
}

/**
 * Core business and security logic for seller application submission.
 * - Enforces server-side validation and allowlist
 * - Enforces duplicate submission prevention
 * - Enforces rate limiting per phone, App Check ID, and IP
 * - Fails closed if rate-limit state cannot be verified
 * - Forces status = "pending"
 * - Generates server-side ID and timestamps
 */
export async function handleSellerApplicationSubmission(
  data: any,
  context: SubmissionContext = {},
  dbInstance?: any
): Promise<SubmissionResult> {
  const validated = validateSellerApplicationPayload(data);
  const db = dbInstance || getDb();
  const now = Date.now();

  // 1. Generate server-side application ID
  const appId = `app_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const appRef = db.collection('seller_applications').doc(appId);

  // 2. Concurrency-safe atomic deduplication locks
  // Cryptographic SHA-256 hashes eliminate reversible PII exposure in document IDs
  const emailHash = hashIdentifier(validated.email);
  const phoneHash = hashIdentifier(validated.cleanPhone);
  const emailLockRef = db.collection('seller_application_locks').doc(`email_${emailHash}`);
  const phoneLockRef = db.collection('seller_application_locks').doc(`phone_${phoneHash}`);

  // 3. Abuse Protection & Rate Limiting keys
  // Cryptographic hash ensures raw phone number is never exposed in Firestore document IDs
  const rateLimitKeys: string[] = [`rate_phone_${phoneHash}`];
  if (context.appCheckId) {
    rateLimitKeys.push(`rate_app_${context.appCheckId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  }
  if (context.ip) {
    rateLimitKeys.push(`rate_ip_${context.ip.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  }

  const docPayload = {
    id: appId,
    sellerCompany: validated.sellerCompany,
    workshopName: validated.workshopName,
    workshopNameAr: validated.workshopNameAr || null,
    nameEn: validated.nameEn || null,
    nameAr: validated.nameAr || null,
    firstName: validated.firstName,
    middleName: validated.middleName || null,
    lastName: validated.lastName,
    contactName: validated.contactName,
    email: validated.email,
    phone: validated.phone,
    cleanPhone: validated.cleanPhone,
    village: validated.village || null,
    governorate: validated.governorate || null,
    craftType: validated.craftType || null,
    craftCategory: validated.craftCategory || null,
    story: validated.story || null,
    bio: validated.bio || null,
    socialLink: validated.socialLink || null,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    submittedAt: new Date().toISOString()
  };

  try {
    // Execute atomic deduplication and rate limiting inside a single transaction
    await db.runTransaction(async (tx: any) => {
      // Step A: Read locks and rate-limit records within the transaction
      const [emailLockSnap, phoneLockSnap] = await Promise.all([
        tx.get(emailLockRef),
        tx.get(phoneLockRef)
      ]);

      if (emailLockSnap.exists) {
        const lockData = emailLockSnap.data();
        if (lockData?.status === 'pending') {
          throw new HttpsError(
            'already-exists',
            'A seller application with this email is currently pending review. Our team will contact you shortly.'
          );
        }
        if (lockData?.status === 'approved') {
          throw new HttpsError(
            'already-exists',
            'A seller account or application with this email has already been approved.'
          );
        }
      }

      if (phoneLockSnap.exists) {
        const lockData = phoneLockSnap.data();
        if (lockData?.status === 'pending') {
          throw new HttpsError(
            'already-exists',
            'A seller application with this phone number is currently pending review. Our team will contact you shortly.'
          );
        }
        if (lockData?.status === 'approved') {
          throw new HttpsError(
            'already-exists',
            'A seller account or application with this phone number has already been approved.'
          );
        }
      }

      // Step B: Read rate limits
      const rlSnaps = await Promise.all(
        rateLimitKeys.map((key) => tx.get(db.collection('seller_application_rate_limits').doc(key)))
      );

      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      for (let i = 0; i < rateLimitKeys.length; i++) {
        const rlSnap = rlSnaps[i];
        let timestamps: number[] = [];

        if (rlSnap.exists) {
          const rlData = rlSnap.data();
          if (Array.isArray(rlData?.timestamps)) {
            timestamps = rlData.timestamps.filter((t: number) => typeof t === 'number' && t > oneDayAgo);
          }
        }

        if (timestamps.length >= 3) {
          throw new HttpsError(
            'resource-exhausted',
            'Too many application requests. Please wait before submitting another seller application.'
          );
        }
      }

      // Step C: Atomically write application, locks, and minimal rate-limit state
      // 1. Write the authoritative application document
      tx.set(appRef, docPayload);

      // 2. Write the atomic uniqueness lock documents (storing NO plaintext PII)
      tx.set(emailLockRef, {
        applicationId: appId,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.set(phoneLockRef, {
        applicationId: appId,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 3. Update rate limits with strictly minimized data (timestamps only, NO applicant PII)
      for (let i = 0; i < rateLimitKeys.length; i++) {
        const rateKey = rateLimitKeys[i];
        const rlSnap = rlSnaps[i];
        let timestamps: number[] = [];

        if (rlSnap.exists && Array.isArray(rlSnap.data()?.timestamps)) {
          timestamps = rlSnap.data().timestamps.filter((t: number) => typeof t === 'number' && t > oneDayAgo);
        }

        timestamps.push(now);
        const rateLimitRef = db.collection('seller_application_rate_limits').doc(rateKey);
        tx.set(rateLimitRef, {
          timestamps,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
  } catch (err: any) {
    if (err instanceof HttpsError) {
      throw err;
    }
    // Fail closed: if rate-limit or lock verification fails, deny the submission
    console.error('[submitSellerApplication] Atomic submission transaction failed (fail-closed):', err);
    throw new HttpsError(
      'resource-exhausted',
      'Unable to verify submission rate limits. Please try again in a few moments.'
    );
  }

  return {
    success: true,
    applicationId: appId,
    message: 'Seller application submitted successfully for review.'
  };
}

/**
 * Synchronizes the seller application lock lifecycle based on application status changes:
 * - PENDING: email + phone locks active (status: 'pending')
 * - APPROVED: keeps uniqueness protection (status: 'approved')
 * - REJECTED: releases/removes the email and phone pending locks
 * - CANCELLED: releases/removes the email and phone pending locks
 * - DELETED: releases/removes the email and phone pending locks
 *
 * STRICT SECURITY INVARIANTS:
 * 1. authoritativeAppId is strictly required and sourced from the Firestore trigger event path (event.params.appId).
 *    Locks are NEVER deleted or modified based on untrusted snapshot payload id fields.
 * 2. Locks are ONLY deleted or modified if lock.applicationId === authoritativeAppId.
 * 3. Never delete a lock merely because lock.status === 'pending'.
 * 4. Application A cannot delete, overwrite, or mutate Application B's locks.
 * 5. On approval, locks are only updated if they exist and match authoritativeAppId; never silently create locks for non-existent ones.
 * 6. Missing or mismatched authoritativeAppId fails closed.
 * 7. Executed inside an atomic transaction where practical.
 */
export async function syncSellerApplicationLockLifecycle(
  authoritativeAppId: string,
  beforeData: Record<string, any> | null | undefined,
  afterData: Record<string, any> | null | undefined,
  dbInstance?: any
): Promise<{ success: boolean; action: string }> {
  // Fail-closed validation: authoritativeAppId must be a non-empty string
  if (!authoritativeAppId || typeof authoritativeAppId !== 'string' || !authoritativeAppId.trim()) {
    console.warn('[syncSellerApplicationLockLifecycle] Security denial: Missing or invalid authoritativeAppId. Failing closed.');
    return { success: false, action: 'denied_missing_authoritative_app_id' };
  }

  const cleanAppId = authoritativeAppId.trim();
  const db = dbInstance || getDb();

  // Extract all distinct email and phone values from before and after snapshots
  const emails = new Set<string>();
  if (beforeData?.email && typeof beforeData.email === 'string') {
    const trimmed = beforeData.email.trim().toLowerCase();
    if (trimmed) emails.add(trimmed);
  }
  if (afterData?.email && typeof afterData.email === 'string') {
    const trimmed = afterData.email.trim().toLowerCase();
    if (trimmed) emails.add(trimmed);
  }

  const phones = new Set<string>();
  const beforeRawPhone = beforeData?.cleanPhone || beforeData?.phone;
  if (beforeRawPhone && typeof beforeRawPhone === 'string') {
    const digits = beforeRawPhone.replace(/\D/g, '');
    if (digits) phones.add(digits);
  }
  const afterRawPhone = afterData?.cleanPhone || afterData?.phone;
  if (afterRawPhone && typeof afterRawPhone === 'string') {
    const digits = afterRawPhone.replace(/\D/g, '');
    if (digits) phones.add(digits);
  }

  if (emails.size === 0 && phones.size === 0) {
    return { success: false, action: 'no_identifiers_found' };
  }

  // Collect lock references
  const lockRefs: any[] = [];
  emails.forEach((em) => {
    lockRefs.push(db.collection('seller_application_locks').doc(`email_${hashIdentifier(em)}`));
  });
  phones.forEach((ph) => {
    lockRefs.push(db.collection('seller_application_locks').doc(`phone_${hashIdentifier(ph)}`));
  });

  const newStatus = afterData?.status;

  // Use transaction if supported by the DB instance for atomic lock lifecycle management
  if (typeof db.runTransaction === 'function') {
    return await db.runTransaction(async (tx: any) => {
      // Step 1: Read all lock documents first (Firestore transaction requirement: all reads before writes)
      const lockSnapshots = await Promise.all(
        lockRefs.map(async (ref) => ({ ref, snap: await tx.get(ref) }))
      );

      // Step 2: Perform authorized modifications based on lifecycle state and strict ownership verification
      for (const { ref, snap } of lockSnapshots) {
        if (!snap.exists) {
          // If the lock does not exist:
          // Rule 6: Do NOT silently create an unrelated lock on approval
          // Rule 7: Do NOT create locks for pending applications during lifecycle sync
          continue;
        }

        const lockData = snap.data();
        // Strict ownership check: lock MUST belong to authoritativeAppId
        if (!lockData || lockData.applicationId !== cleanAppId) {
          // Rule 8: Do not allow one application lifecycle event to delete, overwrite, or modify another application's locks
          console.warn(
            `[syncSellerApplicationLockLifecycle] Refusing operation on lock ${ref.id}: Owned by '${lockData?.applicationId}', not '${cleanAppId}'`
          );
          continue;
        }

        // Case 1: Application deleted or marked as rejected/cancelled -> release lock
        if (!afterData || newStatus === 'rejected' || newStatus === 'cancelled') {
          tx.delete(ref);
        }
        // Case 2: Application approved -> retain uniqueness protection with approved status
        else if (newStatus === 'approved') {
          tx.set(
            ref,
            {
              status: 'approved',
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
        // Case 3: Application pending -> maintain lock with pending status
        else if (newStatus === 'pending') {
          tx.set(
            ref,
            {
              status: 'pending',
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
      }

      const action = !afterData || newStatus === 'rejected' || newStatus === 'cancelled'
        ? `released_${newStatus || 'deleted'}`
        : newStatus === 'approved'
        ? 'retained_approved'
        : newStatus === 'pending'
        ? 'locked_pending'
        : 'no_change';

      return { success: true, action };
    });
  }

  // Non-transactional fallback if db does not support runTransaction
  for (const ref of lockRefs) {
    const snap = await ref.get();
    if (!snap.exists) continue;

    const lockData = snap.data();
    if (!lockData || lockData.applicationId !== cleanAppId) {
      continue;
    }

    if (!afterData || newStatus === 'rejected' || newStatus === 'cancelled') {
      await ref.delete();
    } else if (newStatus === 'approved') {
      await ref.set(
        {
          status: 'approved',
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } else if (newStatus === 'pending') {
      await ref.set(
        {
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
  }

  const action = !afterData || newStatus === 'rejected' || newStatus === 'cancelled'
    ? `released_${newStatus || 'deleted'}`
    : newStatus === 'approved'
    ? 'retained_approved'
    : newStatus === 'pending'
    ? 'locked_pending'
    : 'no_change';

  return { success: true, action };
}

/**
 * Firestore trigger: onSellerApplicationWritten
 * Automatically updates or releases uniqueness locks when application documents are updated or deleted by admins.
 * Uses the authoritative event.params.appId to guarantee lock ownership verification.
 */
export const onSellerApplicationWritten = onDocumentWritten(
  {
    region: 'europe-west1',
    document: 'seller_applications/{appId}'
  },
  async (event) => {
    const appId = event.params.appId;
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;
    await syncSellerApplicationLockLifecycle(appId, beforeData, afterData);
  }
);

/**
 * Callable Cloud Function: submitSellerApplication
 * - Requires Firebase App Check
 * - Validates all inputs server-side
 * - Enforces rate-limiting and duplicate submission prevention
 * - Generates secure server-side ID
 * - Writes to Firestore using Admin SDK
 */
export const submitSellerApplication = onCall<SellerApplicationInput>(
  {
    region: 'europe-west1',
    enforceAppCheck: true,
  },
  async (req) => {
    return handleSellerApplicationSubmission(
      req.data,
      {
        appCheckId: req.app?.appId,
        uid: req.auth?.uid,
        ip: req.rawRequest?.ip
      },
      getDb()
    );
  }
);
