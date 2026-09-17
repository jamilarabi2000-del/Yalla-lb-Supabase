import { supabase } from '../lib/supabase';
import { adminOtpClient } from '../lib/adminOtpClient';

/**
 * Server-recorded administrator step-up.
 *
 * The email OTP used to leave nothing behind but a sessionStorage timestamp
 * that a React branch read, so the password session was already fully
 * privileged: an attacker with the password could call PostgREST directly, or
 * write that key in DevTools, and never complete the second factor.
 *
 * `private.record_admin_step_up` inspects the *calling session's own* JWT `amr`
 * claim and only records a step-up when that session actually completed a
 * non-password factor. A password-only session cannot call one into existence,
 * and destructive RPCs (`admin_delete_order`, `admin_delete_products`) require
 * a live record.
 */
export const adminStepUpService = {
  /**
   * Records the step-up using the OTP client's session, which is the one whose
   * JWT carries the freshly completed email factor.
   */
  async recordFromOtpSession(): Promise<void> {
    const { error } = await adminOtpClient.schema('private').rpc('record_admin_step_up');
    if (error) throw error;
  },

  /** Whether the server currently recognises a live step-up for this admin. */
  async hasRecentStepUp(): Promise<boolean> {
    const { data, error } = await supabase.schema('private').rpc('has_recent_step_up');
    if (error) return false;
    return data === true;
  },

  /** Clears the step-up so signing out really does end the second factor. */
  async clear(): Promise<void> {
    try {
      await supabase.schema('private').rpc('clear_admin_step_up');
    } catch {
      // Best effort: the record expires on its own window regardless.
    }
  },
};
