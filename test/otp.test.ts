import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isMfaSessionValid,
  setAdminMfaSession,
  clearAdminMfaSession,
  isHighRiskStepUpValid,
  _setMfaSessionRawForTesting,
  MFA_VALIDITY_MS,
  HIGH_RISK_VALIDITY_MS,
} from '../src/utils/adminMfa';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');

describe('Supabase Native MFA & Step-Up Security', () => {
  it('uses password login plus native Supabase TOTP, on the primary client', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain('supabase.auth.signInWithPassword');
    expect(guard).toContain('supabase.auth.mfa.enroll');
    expect(guard).toContain('supabase.auth.mfa.challenge');
    expect(guard).toContain('supabase.auth.mfa.verify');
    expect(guard).toContain('getAuthenticatorAssuranceLevel');
    expect(guard).toContain("factorType: 'totp'");
    // Verifying on an isolated client would leave the primary JWT at aal1 and
    // the database could not tell a verified admin from a password-only one.
    expect(guard).not.toContain('adminOtpClient');
    expect(guard).not.toContain('supabase.auth.reauthenticate');
    expect(guard).not.toContain("type: 'reauthentication'");
    expect(guard).not.toContain('PhoneMultiFactorGenerator');
    expect(guard).not.toContain('nodemailer');
    expect(guard).not.toContain('resend.com');
  });

  it('gates the console on AAL2 and records the step-up server-side', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain("aal.currentLevel === 'aal2'");
    expect(guard).toContain("rpc('record_admin_step_up_aal2')");
    expect(guard).toContain('isVerified');
  });

  it('checks the administrator role only after authentication', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain(".from('profiles')");
    expect(guard).toContain(".eq('id', uid)");
    expect(guard).toContain("data?.role !== 'admin'");
    expect(guard).not.toContain('verifyAdminEmailBeforeOtp');
  });

  it('does not contain legacy Firebase authentication implementation', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).not.toContain("from '../firebase'");
    expect(guard).not.toContain('firebase.auth');
    expect(guard).not.toContain('FirebaseAuth');
  });

  it('enforces the 30-minute MFA UI validity window', () => {
    const uid = 'admin-session-test';
    clearAdminMfaSession(uid);
    expect(isMfaSessionValid(uid)).toBe(false);
    setAdminMfaSession(uid);
    expect(isMfaSessionValid(uid)).toBe(true);
    _setMfaSessionRawForTesting(uid, Date.now() - MFA_VALIDITY_MS - 1);
    expect(isMfaSessionValid(uid)).toBe(false);
    clearAdminMfaSession(uid);
  });

  it('enforces the shorter 15-minute high-risk window', () => {
    const uid = 'admin-stepup-test';
    clearAdminMfaSession(uid);
    setAdminMfaSession(uid);
    expect(isHighRiskStepUpValid(uid)).toBe(true);
    _setMfaSessionRawForTesting(uid, Date.now() - HIGH_RISK_VALIDITY_MS - 1);
    expect(isHighRiskStepUpValid(uid)).toBe(false);
    clearAdminMfaSession(uid);
  });

  it('contains the free-tier 30-minute inactivity timeout', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain('ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000');
    expect(guard).toContain("'mousemove'");
    expect(guard).toContain("'keydown'");
    expect(guard).toContain('signOutUser');
    expect(guard).toContain('clearAdminMfaSession');
  });
});
