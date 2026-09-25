import { supabase } from '../lib/supabase';
import { getCaptchaToken } from '../lib/captcha';
const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
// The sign-in hook refuses a reset code unless begin_password_reset ran first (see ShopContext.resetPassword).
export async function requestPasswordReset(email:string){const clean=email.trim().toLowerCase();const{error:noteError}=await supabase.rpc('begin_password_reset',{p_email:clean});if(noteError)throw noteError;const{error}=await supabase.auth.resetPasswordForEmail(clean,{redirectTo:`${appUrl}/account/reset-password`,captchaToken:await getCaptchaToken()});if(error)throw error;}
export async function resendEmailVerification(){const{data}=await supabase.auth.getUser();if(!data.user?.email)throw new Error('No authenticated email address is available.');const{error}=await supabase.auth.resend({type:'signup',email:data.user.email,options:{captchaToken:await getCaptchaToken()}});if(error)throw error;}
export async function requestPasswordChangeNonce(){const{data,error}=await supabase.auth.reauthenticate();if(error)throw error;return data?.messageId||data?.nonce||null;}
export async function updatePassword(password:string,nonce:string){const{error}=await supabase.auth.updateUser({password,nonce});if(error)throw error;}
export async function signOutEverywhere(){const{error}=await supabase.auth.signOut({scope:'global'});if(error)throw error;}
export async function getCurrentSecurityState(){const{data,error}=await supabase.auth.getUser();if(error)throw error;return{userId:data.user?.id??null,email:data.user?.email??null,emailConfirmedAt:data.user?.email_confirmed_at??null,lastSignInAt:data.user?.last_sign_in_at??null};}
