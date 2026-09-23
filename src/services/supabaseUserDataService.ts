import { supabase } from '../lib/supabase';
import { UserProfile, CartItem, Review } from '../types';
import { toUserFacingError } from '../utils/userFacingError';
import type { CustomerProfileRow } from '../lib/customerIndex';
import type { CartRow } from '../lib/activeCarts';

const REVIEW_COLUMNS = 'id,product_id,user_id,rating,title,body,is_published,created_at,admin_reply,admin_reply_at';

// Review writes are admin-only, and RLS filters an unverified session to zero rows.
const UNVERIFIED_REVIEW_WRITE = 'The review was not changed. Your administrator session may not be verified.';

function mapReview(r: Record<string, any>): Review {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    userId: r.user_id ? String(r.user_id) : undefined,
    rating: Number(r.rating),
    title: r.title || undefined,
    body: r.body || undefined,
    isPublished: r.is_published === true,
    createdAt: String(r.created_at),
    adminReply: r.admin_reply || undefined,
    adminReplyAt: r.admin_reply_at || undefined,
  };
}

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

  /**
   * A product's published reviews, for the storefront. The is_published
   * filter is explicit: RLS also shows an author their own pending review and
   * an administrator every review, and neither belongs on the product page.
   */
  async fetchPublishedReviews(productId: string): Promise<Review[]> {
    const { data, error } = await supabase
      .from('reviews')
      .select('id,product_id,rating,title,body,is_published,created_at,admin_reply,admin_reply_at')
      .eq('product_id', productId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[supabaseUserDataService] fetchPublishedReviews failed:', error);
      throw toUserFacingError(error, 'Unable to load reviews right now.');
    }
    return (data ?? []).map(mapReview);
  },

  /** The signed-in shopper's own review of a product, published or not. */
  async fetchMyReview(productId: string, userId: string): Promise<Review | null> {
    const { data, error } = await supabase
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .eq('product_id', productId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('[supabaseUserDataService] fetchMyReview failed:', error);
      throw toUserFacingError(error, 'Unable to load your review right now.');
    }
    return data ? mapReview(data) : null;
  },

  /**
   * Posts a review. The database decides everything that matters: only a
   * customer with a delivered order of the product may post, one review per
   * product, and it waits unpublished until an administrator approves it.
   */
  async addReview(review: { productId: string; userId: string; rating: number; title?: string; body?: string }): Promise<void> {
    const { error } = await supabase.from('reviews').insert({
      product_id: review.productId,
      user_id: review.userId,
      rating: review.rating,
      title: review.title?.trim() || null,
      body: review.body?.trim() || null,
    });
    if (error) {
      console.error('[supabaseUserDataService] addReview failed:', error);
      throw error;
    }
  },

  /** Every review, newest first, for the admin Reviews screen. */
  async listReviewsForAdmin(): Promise<Review[]> {
    const { data, error } = await supabase
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[supabaseUserDataService] listReviewsForAdmin failed:', error);
      throw toUserFacingError(error, 'Unable to load reviews right now.');
    }
    return (data ?? []).map(mapReview);
  },

  async setReviewPublished(reviewId: string, published: boolean): Promise<void> {
    const { data, error } = await supabase
      .from('reviews')
      .update({ is_published: published })
      .eq('id', reviewId)
      .select('id');
    if (error) throw toUserFacingError(error, 'Unable to update this review right now.');
    if (!data?.length) throw new Error(UNVERIFIED_REVIEW_WRITE);
  },

  /** Publishes, replaces or (with null) removes the store's reply. */
  async saveReviewReply(reviewId: string, reply: string | null): Promise<void> {
    const text = reply?.trim() || null;
    const { data, error } = await supabase
      .from('reviews')
      .update({ admin_reply: text, admin_reply_at: text ? new Date().toISOString() : null })
      .eq('id', reviewId)
      .select('id');
    if (error) throw toUserFacingError(error, 'Unable to save the reply right now.');
    if (!data?.length) throw new Error(UNVERIFIED_REVIEW_WRITE);
  },

  async deleteReview(reviewId: string): Promise<void> {
    const { data, error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId)
      .select('id');
    if (error) throw toUserFacingError(error, 'Unable to delete this review right now.');
    if (!data?.length) throw new Error(UNVERIFIED_REVIEW_WRITE);
  },
};
