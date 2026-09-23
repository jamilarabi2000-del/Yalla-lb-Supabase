/**
 * Review logic shared by the admin Reviews screen and the product page, kept
 * pure for testing.
 */
import type { Order, Review } from '../types';

export type ReviewStatusFilter = 'all' | 'pending' | 'published';

export function reviewStats(reviews: Review[]) {
  const count = reviews.length;
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  const published = reviews.filter(r => r.isPublished).length;
  return {
    count,
    /** One decimal, like the storefront shows it; 0 when there are none. */
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    published,
    pending: count - published,
  };
}

export function filterReviews(
  reviews: Review[],
  opts: {
    query: string;
    rating: number | 'all';
    status: ReviewStatusFilter;
    productName: (id: string) => string;
    reviewerName: (userId?: string) => string;
  },
): Review[] {
  const q = opts.query.trim().toLowerCase();
  return reviews.filter(r => {
    if (opts.rating !== 'all' && r.rating !== opts.rating) return false;
    if (opts.status === 'pending' && r.isPublished) return false;
    if (opts.status === 'published' && !r.isPublished) return false;
    if (!q) return true;
    return [r.title, r.body, r.adminReply, opts.productName(r.productId), opts.reviewerName(r.userId)]
      .some(v => v && v.toLowerCase().includes(q));
  });
}

/**
 * Whether the shopper may review a product: the database accepts a review
 * only from a customer with a delivered order containing it
 * (private.can_review_product). Checked here to decide whether to show the
 * form; the database still decides.
 */
export function hasDeliveredOrderOf(orders: Order[], productId: string): boolean {
  return orders.some(o => o.status === 'delivered' && o.items.some(i => i.product?.id === productId));
}

/** The database's refusals, in words a shopper can act on. */
export function reviewSubmitErrorMessage(error: any, isRTL: boolean): string {
  const code = String(error?.code || '');
  const text = `${error?.message || ''} ${error?.details || ''}`;
  if (code === '23505') return isRTL ? 'لقد قيّمت هذا المنتج من قبل.' : 'You have already reviewed this product.';
  if (text.includes('REVIEW_RATE_LIMIT')) return isRTL ? 'أرسلت تقييمات كثيرة خلال وقت قصير. حاول لاحقاً.' : 'You have posted several reviews in a short time. Please try again later.';
  if (code === '42501') return isRTL ? 'يمكن تقييم المنتج بعد استلام طلب يحتوي عليه.' : 'You can review this product once an order containing it has been delivered.';
  if (code === '23514') return isRTL ? 'التقييم طويل جداً.' : 'Your review is too long.';
  return isRTL ? 'تعذر إرسال تقييمك الآن.' : 'Your review could not be posted right now.';
}
