import { supabase } from '../lib/supabase';

export type PlatformPermission =
  | 'products.manage' | 'products.manage_own' | 'orders.manage' | 'orders.manage_own'
  | 'orders.create_own' | 'orders.view_own' | 'cms.manage' | 'customers.view'
  | 'customers.manage' | 'analytics.view' | 'analytics.view_own' | 'reviews.create_own'
  | 'profile.manage_own' | 'inventory.manage' | 'inventory.manage_own' | 'coupons.manage'
  | 'security.view' | 'roles.manage' | 'notifications.manage';

/**
 * public.has_permission is SECURITY DEFINER but granted only to postgres and
 * service_role, so calling it from the browser always failed with
 * "permission denied for function has_permission". private.has_permission is
 * the copy that IS granted to `authenticated`.
 */
export async function hasPermission(permission: PlatformPermission, userId?: string | null) {
  const { data, error } = await supabase
    .schema('private')
    .rpc('has_permission', { p_permission: permission, p_user_id: userId ?? undefined });
  if (error) throw error;
  return data === true;
}

export async function recordInventoryChange(input: {
  productId: string; quantityChange: number; reason: string;
  referenceType?: string; referenceId?: string; note?: string;
}) {
  // Lives in the `private` schema alongside the other authorization-bearing
  // SECURITY DEFINER RPCs; it performs its own permission and seller-ownership
  // checks internally.
  const { data, error } = await supabase.schema('private').rpc('record_inventory_change', {
    p_product_id: input.productId,
    p_quantity_change: input.quantityChange,
    p_reason: input.reason,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function getInventoryLedger(productId?: string) {
  let query = supabase.from('inventory_ledger').select('*').order('created_at', { ascending: false }).limit(250);
  if (productId) query = query.eq('product_id', productId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function searchProducts(query: string, limit = 24) {
  const { data, error } = await supabase.rpc('search_products', { p_query: query, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function trackEvent(eventName: string, properties: Record<string, unknown> = {}, entity?: { type?: string; id?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('analytics_events').insert({
    user_id: auth.user?.id ?? null,
    event_name: eventName,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    properties,
  });
  if (error) throw error;
}

export async function getNotifications(limit = 50) {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getOrderTimeline(orderId: string) {
  const { data, error } = await supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveProductSeo(productId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('product_seo').upsert({ product_id: productId, ...values, updated_at: new Date().toISOString() });
  if (error) throw error;
}
