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
  const eventId = payload.event_id ? String(payload.event_id) : null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(orderId)) return new Response('Invalid order id', { status: 422 });
  if (!['paid', 'failed', 'refunded', 'pending'].includes(paymentStatus)) {
    return new Response('Invalid payment event', { status: 422 });
  }

  // Replay protection. provider_event_id was recorded but never checked, so the
  // same signed body could be posted indefinitely, each time appending another
  // order_events row and re-applying the status change.
  if (eventId) {
    const { data: seen, error: seenError } = await supabase
      .from('order_events')
      .select('id')
      .eq('order_id', orderId)
      .contains('metadata', { provider_event_id: eventId })
      .limit(1);
    if (seenError) return new Response('Webhook lookup failed', { status: 500 });
    if (seen && seen.length > 0) return Response.json({ ok: true, deduplicated: true });
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) return new Response('Webhook lookup failed', { status: 500 });
  if (!order) return new Response('Unknown order', { status: 422 });

  /**
   * Map to real order_status enum members.
   *
   * 'refunded' and 'pending' previously mapped to 'new', which is not a member
   * of order_status, so those events failed the insert, returned 500, and the
   * provider retried them forever.
   */
  const nextStatus: string | null =
    paymentStatus === 'paid' ? 'confirmed'
    : paymentStatus === 'failed' ? 'cancelled'
    : paymentStatus === 'refunded' ? 'returned'
    : null; // 'pending' is informational and leaves the order where it is.

  // The webhook used to append an event and never touch the order, so a paid
  // order stayed 'pending' forever. Updating orders also fires
  // record_order_event, which writes the timeline row.
  if (nextStatus && nextStatus !== order.status) {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', orderId);
    if (updateError) return new Response('Webhook persistence failed', { status: 500 });
  }

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    to_status: nextStatus ?? order.status,
    note: `Payment webhook: ${paymentStatus}`,
    metadata: { source: 'payment-webhook', provider_event_id: eventId },
  });
  if (error) return new Response('Webhook persistence failed', { status: 500 });

  return Response.json({ ok: true });
});
