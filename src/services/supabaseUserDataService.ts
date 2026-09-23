import { supabase } from '../lib/supabase';
import { UserProfile, CartItem, Review } from '../types';
import { generateUuidV4 } from '../utils/uuid';
import { toUserFacingError } from '../utils/userFacingError';
import type { CustomerProfileRow } from '../lib/customerIndex';
import type { CartRow } from '../lib/activeCarts';

export const supabaseUserDataService = {
  async fetchProfile(userId: string): Promise<Partial<UserProfile> | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[supabaseUserDataService] fetchProfile failed:', error);
      throw toUserFacingError(error, 'Unable to load your profile right now.');
    }

    if (!data) return null;

    return {
      uid: data.id,
      name: data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : ''),
      firstName: data.first_name || data.firstName || '',
      lastName: data.last_name || data.lastName || '',
      email: data.email || '',
      phone: data.phone || '',
      avatar: data.avatar || data.avatar_url || '',
      defaultGovernorate: data.default_governorate || data.defaultGovernorate || '',
      defaultCity: data.default_city || data.defaultCity || '',
      defaultAddress: data.default_address || data.defaultAddress || '',
      defaultBuilding: data.default_building || data.defaultBuilding || '',
      defaultNotes: data.default_notes || data.defaultNotes || '',
      role: data.role === 'admin' ? 'admin' : data.role === 'seller' ? 'seller' : 'customer',
      sellerId: data.seller_id || data.sellerId || undefined,
    };
  },

  /**
   * Every profile, for the admin Customers Directory, paged to the end. RLS
   * gives anyone but an administrator their own row only.
   */
  async listProfilesForDirectory(): Promise<CustomerProfileRow[]> {
    const PAGE = 1000;
    const rows: CustomerProfileRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,name,first_name,last_name,phone,role,default_city,default_governorate,created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('[supabaseUserDataService] listProfilesForDirectory failed:', error);
        throw toUserFacingError(error, 'Unable to load customers right now.');
      }
      rows.push(...((data ?? []) as CustomerProfileRow[]));
      if (!data || data.length < PAGE) return rows;
    }
  },

  async upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
    const payload: Record<string, any> = { id: userId, first_name: profile.firstName ?? profile.name?.split(' ')[0], last_name: profile.lastName ?? (profile.name?.split(' ').slice(1).join(' ') || undefined), email: profile.email, phone: profile.phone, avatar: profile.avatar, default_governorate: profile.defaultGovernorate, default_city: profile.defaultCity, default_address: profile.defaultAddress, default_building: profile.defaultBuilding, default_notes: profile.defaultNotes, updated_at: new Date().toISOString() };
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
      console.error('[supabaseUserDataService] upsertProfile failed:', error);
      throw toUserFacingError(error, 'Unable to save your profile right now.');
    }
  },

  async fetchCart(userId: string): Promise<CartItem[] | null> {
    const { data, error } = await supabase.from('carts').select('items').eq('user_id', userId).maybeSingle();
    if (error) {
      console.error('[supabaseUserDataService] fetchCart failed:', error);
      throw toUserFacingError(error, 'Unable to load your saved cart right now.');
    }
    return data && Array.isArray(data.items) ? data.items as CartItem[] : null;
  },

  async saveCart(userId: string, items: CartItem[]): Promise<void> {
    const { error } = await supabase.from('carts').upsert(
      { user_id: userId, items, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.error('[supabaseUserDataService] saveCart failed:', error);
      throw toUserFacingError(error, 'Unable to save your cart right now.');
    }
  },

  /**
   * The most recently touched saved carts, for the admin Active Carts view.
   * Only administrators see other shoppers' carts (carts_admin_read); guest
   * carts never leave the shopper's browser.
   */
  async listCartsForAdmin(): Promise<CartRow[]> {
    const { data, error } = await supabase
      .from('carts')
      .select('user_id,items,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (error) {
      console.error('[supabaseUserDataService] listCartsForAdmin failed:', error);
      throw toUserFacingError(error, 'Unable to load carts right now.');
    }
    return (data ?? []) as CartRow[];
  },

  /**
   * Deletes a shopper's saved cart. Only a verified administrator may
   * (carts_verified_admin_delete); anyone else is filtered to zero rows,
   * which is reported instead of being taken for success.
   */
  async clearCartAsAdmin(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('carts')
      .delete()
      .eq('user_id', userId)
      .select('user_id');
    if (error) {
      console.error('[supabaseUserDataService] clearCartAsAdmin failed:', error);
      throw toUserFacingError(error, 'Unable to clear this cart right now.');
    }
    if (!data?.length) throw new Error('The cart was not cleared. Your administrator session may not be verified.');
  },

  async fetchWishlist(userId: string): Promise<string[] | null> {
    const { data, error } = await supabase.from('wishlists').select('product_ids').eq('user_id', userId).maybeSingle();
    if (error) {
      console.error('[supabaseUserDataService] fetchWishlist failed:', error);
      throw toUserFacingError(error, 'Unable to load your saved wishlist right now.');
    }
    return data && Array.isArray(data.product_ids) ? data.product_ids as string[] : null;
  },

  async saveWishlist(userId: string, productIds: string[]): Promise<void> {
    const { error } = await supabase.from('wishlists').upsert(
      { user_id: userId, product_ids: productIds, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.error('[supabaseUserDataService] saveWishlist failed:', error);
      throw toUserFacingError(error, 'Unable to save your wishlist right now.');
    }
  },

  async fetchReviews(productId?: string): Promise<Review[]> {
    let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) {
      console.error('[supabaseUserDataService] fetchReviews failed:', error);
      throw toUserFacingError(error, 'Unable to load reviews right now.');
    }
    if (!data) return [];
    return data.map((r: any) => ({
      id: String(r.id),
      productId: String(r.product_id || r.productId),
      userId: String(r.user_id || r.userId),
      userName: String(r.user_name || r.userName || 'Customer'),
      rating: Number(r.rating || 5),
      comment: String(r.comment || ''),
      createdAt: r.created_at || r.createdAt || new Date().toISOString(),
      orderId: r.order_id || r.orderId,
      adminReply: r.admin_reply || r.adminReply,
      adminReplyAt: r.admin_reply_at || r.adminReplyAt,
    }));
  },

  async addReview(review: Omit<Review, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
    const payload = { id: review.id || generateUuidV4(), product_id: review.productId, user_id: review.userId, user_name: review.userName, rating: review.rating, comment: review.comment, order_id: review.orderId, created_at: new Date().toISOString() };
    const { error } = await supabase.from('reviews').insert(payload);
    if (error) throw toUserFacingError(error, 'Unable to submit your review right now.');
  },
};
