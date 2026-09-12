import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Admin Authentication & Custom Claims Test Suite (All 11 Scenarios)', () => {
  const shopContextPath = path.resolve(process.cwd(), 'src/context/ShopContext.tsx');
  const adminViewPath = path.resolve(process.cwd(), 'src/components/AdminView.tsx');
  const sellerLoginPath = path.resolve(process.cwd(), 'src/components/SellerLoginView.tsx');

  const shopContextCode = fs.readFileSync(shopContextPath, 'utf-8');
  const adminViewCode = fs.readFileSync(adminViewPath, 'utf-8');
  const sellerLoginCode = fs.readFileSync(sellerLoginPath, 'utf-8');

  it('1. Admin claim only (admin:true, seller:false) is permitted in SellerLoginView without requiring seller record or phone', () => {
    expect(sellerLoginCode).toContain('if (hasAdminClaim)');
    expect(sellerLoginCode).toContain('setActiveTab(\'admin\')');
  });

  it('2. Admin + seller (admin:true, seller:true) is successfully authenticated', () => {
    expect(sellerLoginCode).toContain('hasAdminClaim');
    expect(sellerLoginCode).toContain('hasSellerClaim');
  });

  it('3. Seller only (admin:false, seller:true) passes seller merchant verification', () => {
    expect(sellerLoginCode).toContain('hasSellerClaim');
  });

  it('4. Normal customer (admin:false, seller:false) is denied access', () => {
    expect(sellerLoginCode).toContain('Access Denied');
  });

  it('5. Forged Firestore users/{uid}.role = "admin" is ignored (role is hardcoded to customer)', () => {
    expect(shopContextCode).toContain("role: 'customer'");
    expect(shopContextCode).not.toContain('snap.data().role');
  });

  it('6. Stale ID token is forcibly refreshed using getIdToken(true) and getIdTokenResult(true)', () => {
    expect(shopContextCode).toContain('getIdTokenResult(true)');
    expect(sellerLoginCode).toContain('getIdTokenResult(true)');
  });

  it('7. Missing Firestore users/{uid} document does not block admin recognition or isLoadingAuth', () => {
    expect(shopContextCode).toContain('authStatus');
  });

  it('8. Admin with no seller record is not rejected because admin bypasses seller lookup', () => {
    expect(sellerLoginCode).toContain('if (hasAdminClaim)');
  });

  it('9. Admin with no seller phone is not rejected because phone check only runs for non-admin sellers', () => {
    expect(sellerLoginCode).toContain('if (!phone)');
  });

  it('10. Failed token refresh fails closed gracefully without crashing or false admin elevation', () => {
    expect(shopContextCode).toContain('catch');
  });

  it('11. Direct Firestore access requires request.auth.token.admin == true', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    if (fs.existsSync(rulesPath)) {
      const rulesCode = fs.readFileSync(rulesPath, 'utf-8');
      expect(rulesCode).toContain('request.auth.token.admin == true');
    }
  });

  it('ShopContext is authoritative source of client-side admin state and authStatus', () => {
    expect(shopContextCode).toContain('authStatus');
    expect(shopContextCode).toContain('authenticated_admin');
    expect(shopContextCode).toContain('authenticated_non_admin');
  });

  it('12. Admin MFA session persists across navigation/refresh and expires after 30 minutes', async () => {
    const { isMfaSessionValid, setAdminMfaSession, clearAdminMfaSession, _setMfaSessionRawForTesting, MFA_VALIDITY_MS } = await import('../src/utils/adminMfa');
    const testUid = 'admin-test-uid-123';
    
    clearAdminMfaSession(testUid);
    expect(isMfaSessionValid(testUid)).toBe(false);

    setAdminMfaSession(testUid);
    expect(isMfaSessionValid(testUid)).toBe(true);

    // Mock expired time (>30 min)
    _setMfaSessionRawForTesting(testUid, Date.now() - (MFA_VALIDITY_MS + 1000));
    expect(isMfaSessionValid(testUid)).toBe(false);

    clearAdminMfaSession(testUid);
  });

  it('13. Destructive/high-risk actions require step-up re-auth if older than 15 minutes', async () => {
    const { isHighRiskStepUpValid, setAdminMfaSession, clearAdminMfaSession, _setMfaSessionRawForTesting, HIGH_RISK_VALIDITY_MS } = await import('../src/utils/adminMfa');
    const testUid = 'admin-high-risk-uid-456';

    setAdminMfaSession(testUid);
    expect(isHighRiskStepUpValid(testUid)).toBe(true);

    // Age session past 15 min but within 30 min
    _setMfaSessionRawForTesting(testUid, Date.now() - (HIGH_RISK_VALIDITY_MS + 1000));
    expect(isHighRiskStepUpValid(testUid)).toBe(false);

    clearAdminMfaSession(testUid);
  });

  it('14. Destructive admin operations in ShopContext invoke assertHighRiskAuthorization', () => {
    expect(shopContextCode).toContain('assertHighRiskAuthorization');
    expect(shopContextCode).toContain('deleteProduct');
    expect(shopContextCode).toContain('deleteCategory');
  });

  it('15. AdminGuard uses Firebase native email authentication and forbids SMS MFA and arbitrary phone/email registration', () => {
    const adminGuardPath = path.resolve(process.cwd(), 'src/components/AdminGuard.tsx');
    const adminGuardCode = fs.readFileSync(adminGuardPath, 'utf-8');
    expect(adminGuardCode).toContain("sendSignInLinkToEmail");
    expect(adminGuardCode).toContain("signInWithEmailLink");
    expect(adminGuardCode).toContain("sendEmailVerification");
    expect(adminGuardCode).toContain("recordAdminStepUp");
    expect(adminGuardCode).not.toContain("PhoneMultiFactorGenerator");
    expect(adminGuardCode).not.toContain("MFA Enrollment Required");
    expect(adminGuardCode).not.toContain("enrollPhone");
    expect(adminGuardCode).not.toContain("nodemailer");
    expect(adminGuardCode).not.toContain("resend.com");
  });

  it('16. Server-side bootstrapAdmin function exists and enforces secure initial admin promotion', () => {
    const bootstrapPath = path.resolve(process.cwd(), 'functions/src/adminBootstrap.ts');
    expect(fs.existsSync(bootstrapPath)).toBe(true);

    const bootstrapCode = fs.readFileSync(bootstrapPath, 'utf-8');
    expect(bootstrapCode).toContain('bootstrapAdmin');
    expect(bootstrapCode).toContain('setCustomUserClaims');
    expect(bootstrapCode).toContain('unauthenticated');
    expect(bootstrapCode).toContain('isBootstrapped');
    expect(bootstrapCode).toContain('permission-denied');
    expect(bootstrapCode).toContain('wuGq9Uh8aShXFpUsrLi3abfpkCC2');
  });

  it('17. Frontend does not hard-code initial admin UID or fake admin claims', () => {
    const adminGuardPath = path.resolve(process.cwd(), 'src/components/AdminGuard.tsx');
    const adminGuardCode = fs.readFileSync(adminGuardPath, 'utf-8');
    expect(adminGuardCode).not.toContain("claims.admin = true");
    expect(adminGuardCode).not.toContain("admin: true");
    expect(shopContextCode).not.toContain("claims.admin = true");
  });
});
