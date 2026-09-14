/**
 * Compatibility helpers for components that have not yet completed their UI
 * migration. This file contains NO Firebase SDK and talks to Supabase only.
 * New code should use the typed services under src/services directly.
 */
import { supabase } from './supabase';

export async function pingFirestore(): Promise<boolean> {
  const { error } = await supabase.from('categories').select('id').limit(1);
  return !error;
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, delay = 300): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, delay * 2 ** attempt));
    }
  }
  throw lastError;
}
