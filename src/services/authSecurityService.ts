import { supabase } from '../lib/supabase';
const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
export async function requestPasswordReset(email:string){const{error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${appUrl}/account/reset-password`});if(error)throw error;}
export async function resendEmailVerification(){const{data}=await supabase.auth.getUser();if(!data.user?.email)throw new Error('No authenticated email address is available.');const{error}=await supabase.auth.resend({type:'signup',email:data.user.email});if(error)throw error;}
export async function requestPasswordChangeNonce(){const{data,error}=await supabase.auth.reauthenticate();if(error)throw error;return data?.messageId||data?.nonce||null;}
export async function updatePassword(password:string,nonce:string){const{error}=await supabase.auth.updateUser({password,nonce});if(error)throw error;}
export async function signOutEverywhere(){const{error}=await supabase.auth.signOut({scope:'global'});if(error)throw error;}
export async function getCurrentSecurityState(){const{data,error}=await supabase.auth.getUser();if(error)throw error;return{userId:data.user?.id??null,email:data.user?.email??null,emailConfirmedAt:data.user?.email_confirmed_at??null,lastSignInAt:data.user?.last_sign_in_at??null};}
