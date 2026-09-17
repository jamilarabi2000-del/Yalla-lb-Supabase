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

describe('Supabase Email Authentication & Step-Up Security', () => {
  it('uses password login plus standard Supabase email OTP and no third-party dispatch', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain('supabase.auth.signInWithPassword');
    expect(guard).toContain('adminOtpClient.auth.signInWithOtp');
    expect(guard).toContain("type: 'email'");
    expect(guard).toContain('verifyOtp');
    expect(guard).toContain('shouldCreateUser: false');
    expect(guard).toContain('cleanOtp.length < 6 || cleanOtp.length > 10');
    expect(guard).toContain('maxLength={10}');
    expect(guard).not.toContain('supabase.auth.reauthenticate');
    expect(guard).not.toContain("type: 'reauthentication'");
    expect(guard).not.toContain('PhoneMultiFactorGenerator');
    expect(guard).not.toContain('nodemailer');
    expect(guard).not.toContain('resend.com');
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
