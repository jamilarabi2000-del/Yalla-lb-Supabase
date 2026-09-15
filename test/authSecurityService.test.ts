import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=()=>fs.readFileSync(path.resolve(process.cwd(),'src/services/authSecurityService.ts'),'utf8');
describe('Auth security service',()=>{it('uses Supabase password reset with a controlled redirect',()=>{const s=read();expect(s).toContain('resetPasswordForEmail');expect(s).toContain('/account/reset-password');});it('uses Supabase resend for email verification',()=>{expect(read()).toContain("supabase.auth.resend({type:'signup'");});it('supports global session revocation',()=>{expect(read()).toContain("signOut({scope:'global'})");});});
