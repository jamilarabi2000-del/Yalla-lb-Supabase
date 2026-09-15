import { supabase } from '../lib/supabase';
import { UserProfile, CartItem, Review } from '../types';
import { generateUuidV4 } from '../utils/uuid';

export const supabaseUserDataService = {
  async fetchProfile(userId: string): Promise<Partial<UserProfile> | null> {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error || !data) return null;
      return {
        uid: data.id,
        name: data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : ''),
        firstName: data.first_name || data.firstName || '', lastName: data.last_name || data.lastName || '',
        email: data.email || '', phone: data.phone || '', avatar: data.avatar || data.avatar_url || '',
        defaultGovernorate: data.default_governorate || data.defaultGovernorate || '',
        defaultCity: data.default_city || data.defaultCity || '', defaultAddress: data.default_address || data.defaultAddress || '',
        defaultBuilding: data.default_building || data.defaultBuilding || '', defaultNotes: data.default_notes || data.defaultNotes || '',
        role: data.role === 'admin' ? 'admin' : data.role === 'seller' ? 'seller' : 'customer',
        sellerId: data.seller_id || data.sellerId || undefined,
      };
    } catch (err) { console.warn('[supabaseUserDataService] fetchProfile error:', err); return null; }
  },

  async upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
    const payload: Record<string, any> = {
      id: userId,
      first_name: profile.firstName ?? profile.name?.split(' ')[0],
      last_name: profile.lastName ?? (profile.name?.split(' ').slice(1).join(' ') || undefined),
      email: profile.email, phone: profile.phone, avatar: profile.avatar,
      default_governorate: profile.defaultGovernorate, default_city: profile.defaultCity,
      default_address: profile.defaultAddress, default_building: profile.defaultBuilding,
      default_notes: profile.defaultNotes, updated_at: new Date().toISOString(),
    };
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) console.warn('[supabaseUserDataService] upsertProfile error:', error.message);
  },

  async fetchCart(userId: string): Promise<CartItem[] | null> {
    try {
      const { data, error } = await supabase.from('carts').select('items').eq('user_id', userId).maybeSingle();
      if (error) { console.warn('[supabaseUserDataService] fetchCart error:', error.message); return null; }
      return data && Array.isArray(data.items) ? data.items as CartItem[] : null;
    } catch (err) { console.warn('[supabaseUserDataService] fetchCart error:', err); return null; }
  },

  async saveCart(userId: string, items: CartItem[]): Promise<void> {
    try {
      const { error } = await supabase.from('carts').upsert({ user_id: userId, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) console.warn('[supabaseUserDataService] saveCart error:', error.message);
    } catch (err) { console.warn('[supabaseUserDataService] saveCart error:', err); }
  },

  async fetchWishlist(userId: string): Promise<string[] | null> {
    try {
      const { data, error } = await supabase.from('wishlists').select('product_ids').eq('user_id', userId).maybeSingle();
      if (error) { console.warn('[supabaseUserDataService] fetchWishlist error:', error.message); return null; }
      return data && Array.isArray(data.product_ids) ? data.product_ids as string[] : null;
    } catch (err) { console.warn('[supabaseUserDataService] fetchWishlist error:', err.message); return null; }
  },

  async saveWishlist(userId: string, productIds: string[]): Promise<void> {
    try {
      const { error } = await supabase.from('wishlists').upsert({ user_id: userId, product_ids: productIds, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) console.warn('[supabaseUserDataService] saveWishlist error:', error.message);
    } catch (err) { console.warn('[supabaseUserDataService] saveWishlist error:', err); }
  },

  async fetchReviews(productId?: string): Promise<Review[]> {
    try {
      let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (productId) query = query.eq('product_id', productId);
      const { data, error } = await query;
      if (error || !data) return [];
      return data.map((r: any) => ({
        id: String(r.id), productId: String(r.product_id || r.productId), userId: String(r.user_id || r.userId),
        userName: String(r.user_name || r.userName || 'Customer'), rating: Number(r.rating || 5), comment: String(r.comment || ''),
        createdAt: r.created_at || r.createdAt || new Date().toISOString(), orderId: r.order_id || r.orderId,
        adminReply: r.admin_reply || r.adminReply, adminReplyAt: r.admin_reply_at || r.adminReplyAt,
      }));
    } catch { return []; }
  },

  async addReview(review: Omit<Review, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
    const payload = {
      id: review.id || generateUuidV4(), product_id: review.productId, user_id: review.userId, user_name: review.userName,
      rating: review.rating, comment: review.comment, order_id: review.orderId, created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('reviews').insert(payload);
    if (error) { console.error('[supabaseUserDataService] addReview error:', error); throw error; }
  },
};