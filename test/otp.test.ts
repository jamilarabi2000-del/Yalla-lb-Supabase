import { describe, it, expect, beforeEach } from 'vitest';
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
import { recordAdminStepUp, normalizePhoneNumber } from '../functions/src/checkPhone';

describe('Admin Firebase Native Email Authentication & Server-Authoritative Security Suite', () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    clearAdminMfaSession();
  });

  describe('Static & Architecture Security Assertions', () => {
    it('1. AdminGuard uses Supabase authentication and has no SMS MFA or phone enrollment', () => {
      const adminGuardPath = path.resolve(rootDir, 'src/components/AdminGuard.tsx');
      const content = fs.readFileSync(adminGuardPath, 'utf-8');

      expect(content).toContain('supabase.auth');
      expect(content).toContain('recordAdminStepUp');
      expect(content).not.toContain('PhoneMultiFactorGenerator');
      expect(content).not.toContain('PhoneAuthProvider');
      expect(content).not.toContain('MFA Enrollment Required');
      expect(content).not.toContain('enrollPhone');
    });

    it('2. Cloud Functions index exports recordAdminStepUp and does not export custom 3rd-party OTP dispatchers', () => {
      const indexFilePath = path.resolve(rootDir, 'functions/src/index.ts');
      const content = fs.readFileSync(indexFilePath, 'utf-8');

      expect(content).toContain('recordAdminStepUp');
      expect(content).toContain('checkPhoneAvailability');
      expect(content).not.toContain('requestAdminEmailOtp');
    });

    it('3. Third-party mailer and SMS providers are completely removed from Cloud Functions', () => {
      const functionsSrcDir = path.resolve(rootDir, 'functions/src');
      const files = fs.readdirSync(functionsSrcDir);

      for (const file of files) {
        if (file.endsWith('.ts')) {
          const fileContent = fs.readFileSync(path.join(functionsSrcDir, file), 'utf-8');
          expect(fileContent.toLowerCase()).not.toContain('twilio');
          expect(fileContent.toLowerCase()).not.toContain('nodemailer');
          expect(fileContent.toLowerCase()).not.toContain('resend');
          expect(fileContent.toLowerCase()).not.toContain('sendgrid');
          expect(fileContent.toLowerCase()).not.toContain('brevo');
          expect(fileContent.toLowerCase()).not.toContain('postmark');
        }
      }
    });

    it('4. AdminGuard does not contain hard-coded testing bypass codes or fake claims', () => {
      const adminGuardPath = path.resolve(rootDir, 'src/components/AdminGuard.tsx');
      const content = fs.readFileSync(adminGuardPath, 'utf-8');

      expect(content).not.toContain('Testing code: 123456');
      expect(content).not.toContain('fallback-dev');
      expect(content).not.toContain('claims.admin = true');
      expect(content).not.toContain('admin: true');
    });

    it('5. Firestore rules strictly forbid direct client write to admin_stepup', () => {
      const rulesPath = path.resolve(rootDir, 'firestore.rules');
      const rules = fs.readFileSync(rulesPath, 'utf-8');

      expect(rules).toContain('match /admin_stepup/{uid}');
      expect(rules).toContain('allow write: if false;');
    });

    it('6. recordAdminStepUp enforces authenticated session, admin custom claim, and verified email', () => {
      const checkPhonePath = path.resolve(rootDir, 'functions/src/checkPhone.ts');
      const content = fs.readFileSync(checkPhonePath, 'utf-8');

      expect(content).toContain('request.auth.token.admin !== true');
      expect(content).toContain('request.auth.token.email_verified !== true');
      expect(content).toContain("factor: 'firebase_native_email'");
    });

    it('7. Lebanese phone normalization in checkPhone formats correctly', () => {
      expect(normalizePhoneNumber('03123456')).toBe('+9613123456');
      expect(normalizePhoneNumber('70 123 456')).toBe('+96170123456');
      expect(normalizePhoneNumber('+961 71 123 456')).toBe('+96171123456');
      expect(normalizePhoneNumber('00961 76 123 456')).toBe('+96176123456');

      expect(() => normalizePhoneNumber('123')).toThrow('Invalid Lebanese phone number format.');
      expect(() => normalizePhoneNumber('')).toThrow('Phone number is required.');
    });
  });

  describe('Functional Execution & Security Invariants', () => {
    it('Scenario A: Unauthenticated call to recordAdminStepUp is rejected', async () => {
      const req: any = { auth: null };
      await expect((recordAdminStepUp as any).run(req)).rejects.toThrow(/Authentication is required/i);
    });

    it('Scenario B: Non-admin call to recordAdminStepUp is rejected', async () => {
      const req: any = {
        auth: {
          uid: 'user-regular',
          token: { admin: false, email: 'regular@example.com', email_verified: true },
        },
      };
      await expect((recordAdminStepUp as any).run(req)).rejects.toThrow(/Administrator privileges are required/i);
    });

    it('Scenario C: Admin with unverified email is rejected from step-up', async () => {
      const req: any = {
        auth: {
          uid: 'admin-unverified',
          token: { admin: true, email: 'admin@example.com', email_verified: false },
        },
      };
      await expect((recordAdminStepUp as any).run(req)).rejects.toThrow(/verified administrator email/i);
    });

    it('Scenario D: Verified admin call to recordAdminStepUp succeeds', async () => {
      const req: any = {
        auth: {
          uid: 'admin-valid',
          token: { admin: true, email: 'admin@example.com', email_verified: true },
        },
      };
      const res = await (recordAdminStepUp as any).run(req);
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.verifiedAtMs).toBeGreaterThan(0);
    });

    it('Scenario E: Client-side session tracking correctly respects 30-minute validity', () => {
      const uid = 'admin-session-test';
      expect(isMfaSessionValid(uid)).toBe(false);

      setAdminMfaSession(uid);
      expect(isMfaSessionValid(uid)).toBe(true);

      _setMfaSessionRawForTesting(uid, Date.now() - (MFA_VALIDITY_MS + 1000));
      expect(isMfaSessionValid(uid)).toBe(false);
    });

    it('Scenario F: High-risk step-up correctly expires after 15 minutes', () => {
      const uid = 'admin-stepup-test';
      setAdminMfaSession(uid);
      expect(isHighRiskStepUpValid(uid)).toBe(true);

      _setMfaSessionRawForTesting(uid, Date.now() - (HIGH_RISK_VALIDITY_MS + 1000));
      expect(isHighRiskStepUpValid(uid)).toBe(false);
    });
  });
});
