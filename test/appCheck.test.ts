import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App Check & reCAPTCHA Enterprise Security Suite', () => {
  it('ensures src/firebase.ts initializes App Check using ReCaptchaEnterpriseProvider and debug token', () => {
    const firebaseTsPath = path.resolve(process.cwd(), 'src/firebase.ts');
    const content = fs.readFileSync(firebaseTsPath, 'utf-8');

    expect(content).toContain('initializeAppCheck');
    expect(content).toContain('ReCaptchaEnterpriseProvider');
    expect(content).toContain('FIREBASE_APPCHECK_DEBUG_TOKEN');
    expect(content).not.toContain('[Firebase] App Check disabled.');
  });

  it('ensures OTPModal uses RecaptchaVerifier for native customer phone verification', () => {
    const otpModalPath = path.resolve(process.cwd(), 'src/components/OTPModal.tsx');
    const otpModalContent = fs.readFileSync(otpModalPath, 'utf-8');
    expect(otpModalContent).toContain('RecaptchaVerifier');
  });

  it('ensures backend functions enforce App Check and consume tokens', () => {
    const checkPhonePath = path.resolve(process.cwd(), 'functions/src/checkPhone.ts');
    const checkPhoneContent = fs.readFileSync(checkPhonePath, 'utf-8');

    expect(checkPhoneContent).toContain('enforceAppCheck: true');
    expect(checkPhoneContent).toContain('consumeAppCheckToken: true');

    const placeOrderPath = path.resolve(process.cwd(), 'functions/src/placeOrder.ts');
    const placeOrderContent = fs.readFileSync(placeOrderPath, 'utf-8');

    expect(placeOrderContent).toContain('enforceAppCheck: true');
    expect(placeOrderContent).toContain('consumeAppCheckToken: true');
  });
});
