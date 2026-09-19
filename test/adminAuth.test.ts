import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(relativePath:string)=>fs.readFileSync(path.resolve(process.cwd(),relativePath),'utf-8');

describe('Supabase Admin Authentication',()=>{
 it('uses Supabase Auth and profile role checks',()=>{const guard=read('src/components/AdminGuard.tsx');expect(guard).toContain('supabase.auth');expect(guard).toContain("from('profiles')");expect(guard).toContain("role !== 'admin'");expect(guard).not.toContain('getIdTokenResult');expect(guard).not.toContain('PhoneMultiFactorGenerator');expect(guard).toContain('record_admin_step_up_aal2')});
 it('does not rely on a secret URL for authorization',()=>{const guard=read('src/components/AdminGuard.tsx');expect(guard).not.toContain('portal-x9k2m7v8');expect(guard).not.toContain('claims.admin = true');expect(guard).not.toContain('admin: true')});
 it('uses password authentication followed by native Supabase TOTP MFA',()=>{const guard=read('src/components/AdminGuard.tsx');expect(guard).toContain('signInWithPassword');expect(guard).toContain('supabase.auth.mfa.enroll');expect(guard).toContain('supabase.auth.mfa.verify');expect(guard).toContain("factorType: 'totp'");expect(guard).toContain('getAuthenticatorAssuranceLevel');expect(guard).toContain('maxLength={6}');expect(guard).not.toContain('adminOtpClient');expect(guard).not.toContain("type: 'reauthentication'")});
 it('keeps high-risk authorization behind the shared step-up helper',()=>{const context=read('src/context/ShopContext.tsx');expect(context).toContain('assertHighRiskAuthorization');expect(context).toContain('deleteProduct')});
 it('blocks the admin route when an admin Supabase session has no valid step-up session',()=>{const gate=read('src/components/AdminSessionGate.tsx');const guardAuth=read('src/components/AdminGuard.tsx');const app=read('src/App.tsx');expect(guardAuth).toContain("authStatus === 'authenticated_admin'");expect(guardAuth).toContain('isVerified');expect(guardAuth).toContain('clearAdminMfaSession');expect(guardAuth).toContain('signOutUser');expect(app).toContain('<AdminSessionGate>');expect(app).toContain('<AdminGuard><AdminView /></AdminGuard>')});
});

describe('Admin MFA UI Session Helper',()=>{
 it('expires the UI session after the configured validity window',async()=>{const{isMfaSessionValid,setAdminMfaSession,clearAdminMfaSession,_setMfaSessionRawForTesting,MFA_VALIDITY_MS}=await import('../src/utils/adminMfa');const uid='admin-test-uid';clearAdminMfaSession(uid);expect(isMfaSessionValid(uid)).toBe(false);setAdminMfaSession(uid);expect(isMfaSessionValid(uid)).toBe(true);_setMfaSessionRawForTesting(uid,Date.now()-MFA_VALIDITY_MS-1);expect(isMfaSessionValid(uid)).toBe(false);clearAdminMfaSession(uid)});
 it('expires high-risk step-up state earlier than the general UI session',async()=>{const{isHighRiskStepUpValid,setAdminMfaSession,clearAdminMfaSession,_setMfaSessionRawForTesting,HIGH_RISK_VALIDITY_MS}=await import('../src/utils/adminMfa');const uid='admin-high-risk-test';clearAdminMfaSession(uid);setAdminMfaSession(uid);expect(isHighRiskStepUpValid(uid)).toBe(true);_setMfaSessionRawForTesting(uid,Date.now()-HIGH_RISK_VALIDITY_MS-1);expect(isHighRiskStepUpValid(uid)).toBe(false);clearAdminMfaSession(uid)});
});
