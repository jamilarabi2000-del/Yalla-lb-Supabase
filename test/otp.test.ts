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

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');

describe('Supabase Email Authentication & Step-Up Security', () => {
  it('uses Supabase email-link authentication and does not use Firebase/third-party OTP dispatch', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain('supabase.auth.signInWithOtp');
    expect(guard).toContain('shouldCreateUser: false');
    expect(guard).toContain('emailRedirectTo');
    expect(guard).not.toContain('PhoneMultiFactorGenerator');
    expect(guard).not.toContain('nodemailer');
    expect(guard).not.toContain('resend.com');
    expect(guard).not.toContain('recordAdminStepUp');
  });

  it('checks the administrator role only after authentication', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain(".eq('id', data.session.user.id)");
    expect(guard).toContain("profile?.role !== 'admin'");
    expect(guard).not.toContain('verifyAdminEmailBeforeOtp');
  });

  it('does not contain legacy Firebase authentication implementation', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).not.toContain("from '../firebase'");
    expect(guard).not.toContain('firebase.auth');
    expect(guard).not.toContain('FirebaseAuth');
  });

  it('enforces the 30-minute UI session lifetime', () => {
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
    setAdminMfaMfaSessionForTest(uid);
    expect(isHighRiskStepUpValid(uid)).toBe(true);
    _setMfaSessionRawForTesting(uid, Date.now() - HIGH_RISK_VALIDITY_MS - 1);
    expect(isHighRiskStepUpValid(uid)).toBe(false);
    clearAdminMfaSession(uid);
  });
});

function setAdminMfaMfaSessionForTest(uid: string) {
  setAdminMfaSession(uid);
}
