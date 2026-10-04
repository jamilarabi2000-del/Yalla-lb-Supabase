// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { fetchWithEarlyAnswers } from '../src/lib/earlyFetch';

// Anything that imports the Supabase client without a browser (a script, a test of a service, a
// prerender) has no window, so no early answers: it must behave exactly as the client always did.
describe('without a browser', () => {
  it('there is no window, and the read goes straight to the server', async () => {
    expect(typeof window).toBe('undefined');
    const answer = new Response('[]', { status: 200 });
    const base = vi.fn(async () => answer);
    const response = await fetchWithEarlyAnswers(base as unknown as typeof fetch, 'key')('https://p.supabase.co/rest/v1/regions?select=id', { headers: { apikey: 'key' } });
    expect(response).toBe(answer);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
