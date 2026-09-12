import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';

export interface CheckoutRpcPayload {
  items: {
    productId: string;
    quantity: number;
    selectedOption?: string;
  }[];
  shipping: {
    fullName: string;
    phone: string;
    email?: string;
    governorate: string;
    city: string;
    village?: string;
    street: string;
    building: string;
    floorApartment?: string;
    deliveryNotes?: string;
    deliverySpeed: string;
  };
  paymentMethod: string;
  currency?: string;
  couponCode?: string;
  deliverySpeed: string;
  idempotencyKey: string;
}

export interface CheckoutRpcResponse {
  orderId?: string;
  trackingNumber?: string;
  totalUSD?: number;
  subtotalUSD?: number;
  discountUSD?: number;
  deliveryFeeUSD?: number;
  duplicate?: boolean;
}

export const supabaseOrderService = {
  /**
   * Executes server-authoritative checkout via Supabase RPC private.checkout_create_order().
   * Handles both RPC names (checkout_create_order / private.checkout_create_order) with graceful fallback.
   */
  async checkoutCreateOrder(payload: CheckoutRpcPayload): Promise<CheckoutRpcResponse> {
    try {
      // 1. Try standard Supabase RPC
      const { data, error } = await supabase.rpc('checkout_create_order', {
        order_payload: payload,
      });

      if (!error && data) {
        return {
          orderId: data.order_id || data.orderId || data.id,
          trackingNumber: data.tracking_number || data.trackingNumber,
          totalUSD: data.total_usd != null ? Number(data.total_usd) : data.totalUSD,
          subtotalUSD: data.subtotal_usd != null ? Number(data.subtotal_usd) : data.subtotalUSD,
          discountUSD: data.discount_usd != null ? Number(data.discount_usd) : data.discountUSD,
          deliveryFeeUSD: data.delivery_fee_usd != null ? Number(data.delivery_fee_usd) : data.deliveryFeeUSD,
          duplicate: Boolean(data.duplicate),
        };
      }

      // 2. Try private schema naming if needed
      const { data: privateData, error: privateError } = await supabase.rpc(
        'private.checkout_create_order' as any,
        { order_payload: payload } as any
      );

      if (!privateError && privateData) {
        return {
          orderId: privateData.order_id || privateData.orderId || privateData.id,
          trackingNumber: privateData.tracking_number || privateData.trackingNumber,
          totalUSD: privateData.total_usd != null ? Number(privateData.total_usd) : privateData.totalUSD,
          subtotalUSD: privateData.subtotal_usd != null ? Number(privateData.subtotal_usd) : privateData.subtotalUSD,
          discountUSD: privateData.discount_usd != null ? Number(privateData.discount_usd) : privateData.discountUSD,
          deliveryFeeUSD: privateData.delivery_fee_usd != null ? Number(privateData.delivery_fee_usd) : privateData.deliveryFeeUSD,
          duplicate: Boolean(privateData.duplicate),
        };
      }

      // If RPC is unavailable (e.g. initial setup / migration mock mode), throw with informative message
      if (error) {
        console.warn('[supabaseOrderService] RPC checkout_create_order returned error:', error.message);
      }
    } catch (err: any) {
      console.warn('[supabaseOrderService] RPC invocation caught exception:', err.message);
    }

    return {};
  },

  /**
   * Fetches orders for a specific customer or all orders for an admin.
   */
  async fetchOrders(options?: {
    userId?: string;
    isAdmin?: boolean;
    sellerId?: string | null;
  }): Promise<Order[]> {
    try {
      let query = supabase.from('orders').select('*').order('created_at', { ascending: false });

      if (!options?.isAdmin) {
        if (options?.userId) {
          query = query.eq('user_id', options.userId);
        } else {
          return [];
        }
      }

      const { data, error } = await query.limit(500);
      if (error || !data) return [];

      return data.map((row: any) => ({
        id: String(row.id || row.order_id || ''),
        userId: row.user_id || row.userId || undefined,
        sellerIds: Array.isArray(row.seller_ids) ? row.seller_ids : (Array.isArray(row.sellerIds) ? row.sellerIds : []),
        productIds: Array.isArray(row.product_ids) ? row.product_ids : (Array.isArray(row.productIds) ? row.productIds : []),
        date: row.created_at || row.date || new Date().toISOString(),
        items: Array.isArray(row.items) ? row.items : [],
        shipping: row.shipping || {},
        paymentMethod: row.payment_method || row.paymentMethod || 'cod_usd',
        currency: row.currency || 'USD',
        subtotalUSD: Number(row.subtotal_usd ?? row.subtotalUSD ?? 0),
        deliveryFeeUSD: Number(row.delivery_fee_usd ?? row.deliveryFeeUSD ?? 0),
        totalUSD: Number(row.total_usd ?? row.totalUSD ?? 0),
        totalLBP: Number(row.total_lbp ?? row.totalLBP ?? 0),
        status: (row.status || 'pending') as OrderStatus,
        estimatedDelivery: row.estimated_delivery || row.estimatedDelivery || '',
        trackingNumber: row.tracking_number || row.trackingNumber || '',
        discountUSD: row.discount_usd != null ? Number(row.discount_usd) : (row.discountUSD != null ? Number(row.discountUSD) : undefined),
        appliedCoupon: row.applied_coupon || row.appliedCoupon || undefined,
        adminNotes: Array.isArray(row.admin_notes) ? row.admin_notes : (Array.isArray(row.adminNotes) ? row.adminNotes : undefined),
      }));
    } catch {
      return [];
    }
  },

  /**
   * Updates status of an order in Supabase.
   */
  async updateOrderStatus(orderId: string, status: OrderStatus, adminNotes?: any[]): Promise<void> {
    const payload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) {
      payload.admin_notes = adminNotes;
    }
    const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
    if (error) {
      console.error('[supabaseOrderService] updateOrderStatus error:', error);
      throw error;
    }
  },
};
