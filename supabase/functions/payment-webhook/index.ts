import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET')!;
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!webhookSecret) return new Response('Webhook secret not configured', { status: 503 });

  const raw = await req.text();
  const supplied = (req.headers.get('x-yalla-signature') || '').replace(/^sha256=/, '').trim().toLowerCase();
  const expected = await hmacHex(webhookSecret, raw);
  if (!safeEqual(supplied, expected)) return new Response('Invalid signature', { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }

  // Provider adapters should normalize into this contract before this boundary.
  const orderId = String(payload.order_id || '');
  const paymentStatus = String(payload.payment_status || '').toLowerCase();
  if (!orderId || !['paid', 'failed', 'refunded', 'pending'].includes(paymentStatus)) return new Response('Invalid payment event', { status: 422 });

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    to_status: paymentStatus === 'paid' ? 'confirmed' : paymentStatus === 'failed' ? 'cancelled' : 'new',
    note: `Payment webhook: ${paymentStatus}`,
    metadata: { source: 'payment-webhook', provider_event_id: payload.event_id ?? null },
  });
  if (error) return new Response('Webhook persistence failed', { status: 500 });

  return Response.json({ ok: true });
});
