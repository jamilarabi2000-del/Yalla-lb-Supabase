import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, MessageSquareReply, Star } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { supabaseUserDataService } from '../services/supabaseUserDataService';
import { hasDeliveredOrderOf, reviewSubmitErrorMessage } from '../lib/reviews';
import type { Order, Review } from '../types';

const Stars: React.FC<{ rating: number; label: string }> = ({ rating, label }) => (
  <span className="inline-flex" role="img" aria-label={label}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} aria-hidden className={`w-4 h-4 ${n <= Math.round(rating) ? 'fill-[#B89753] text-[#B89753]' : 'text-[#D4D4D4]'}`} />
    ))}
  </span>
);

/**
 * Published reviews and the store's replies, plus the form for a shopper
 * whose order of this product has been delivered. Reviewers are not named:
 * signed-out visitors cannot read profiles, and a review stands on its
 * verified purchase.
 */
export const ProductReviews: React.FC<{
  productId: string;
  rating: number;
  reviewsCount: number;
  isRTL: boolean;
  outlined?: boolean;
}> = ({ productId, rating, reviewsCount, isRTL, outlined }) => {
  const shop = useShop() as any;
  const userId: string | undefined = shop.authUser?.uid;
  // Only the shopper's own orders: an administrator browsing the store has
  // every order loaded.
  const ownOrders: Order[] = ((shop.orders || []) as Order[]).filter(o => o.userId === userId);
  const eligible = !!userId && hasDeliveredOrderOf(ownOrders, productId);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [mine, setMine] = useState<Review | null>(null);
  const [stars, setStars] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');

  const load = useCallback(async () => {
    try {
      setReviews(await supabaseUserDataService.fetchPublishedReviews(productId));
      setMine(userId ? await supabaseUserDataService.fetchMyReview(productId, userId) : null);
    } catch {
      // The rest of the page does not depend on reviews.
      setReviews([]);
    }
  }, [productId, userId]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || stars < 1) return;
    setSending(true);
    setFailure('');
    try {
      await supabaseUserDataService.addReview({ productId, userId, rating: stars, title, body });
      shop.showToast?.(isRTL ? 'شكراً! سيظهر تقييمك بعد مراجعته.' : 'Thank you! Your review will appear once the store approves it.', 'success');
      setStars(0); setTitle(''); setBody('');
      await load();
    } catch (err) {
      setFailure(reviewSubmitErrorMessage(err, isRTL));
    } finally {
      setSending(false);
    }
  };

  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

  return (
    <section className={`mt-8 rounded-[24px] border border-[#E5E5E5] bg-white p-5 sm:p-7 shadow-sm ${outlined ? 'ring-2 ring-dashed ring-rose-500' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7d6230]">{isRTL ? 'آراء العملاء' : 'Customer Reviews'}</p>
          <h2 className="text-lg sm:text-xl font-serif font-semibold text-[#171717]">{isRTL ? 'ماذا يقول المشترون' : 'What buyers say'}</h2>
        </div>
        {reviewsCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-[#171717]">
            <Stars rating={rating} label={isRTL ? `${rating} من 5` : `${rating} out of 5`} />
            <b>{Number(rating).toFixed(1)}</b>
            <span className="text-[#666666]">({reviewsCount})</span>
          </div>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-[#666666]">{isRTL ? 'لا توجد تقييمات بعد.' : 'No reviews yet.'}</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map(r => (
            <li key={r.id} className="rounded-2xl border border-[#E5E5E5] bg-[#F8F8F6] p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Stars rating={r.rating} label={isRTL ? `${r.rating} من 5` : `${r.rating} out of 5`} />
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <BadgeCheck className="w-3.5 h-3.5" aria-hidden />{isRTL ? 'شراء موثّق' : 'Verified Purchase'}
                </span>
                <span className="text-[#666666]">{date(r.createdAt)}</span>
              </div>
              {r.title && <p className="mt-2 font-bold text-[#171717]">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm leading-6 text-[#555555] whitespace-pre-line">{r.body}</p>}
              {r.adminReply && (
                <div className="mt-3 rounded-xl border border-amber-200/70 bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#7d6230] flex items-center gap-1.5">
                    <MessageSquareReply className="w-3.5 h-3.5" aria-hidden />{isRTL ? 'رد المتجر' : 'Store Response'}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#555555] whitespace-pre-line">{r.adminReply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {mine ? (
        <p className="mt-5 text-xs font-bold text-[#7d6230]">
          {mine.isPublished
            ? (isRTL ? 'شكراً على تقييمك لهذا المنتج.' : 'Thank you for reviewing this product.')
            : (isRTL ? 'تقييمك بانتظار مراجعة المتجر.' : 'Your review is waiting for the store to approve it.')}
        </p>
      ) : eligible && (
        <form onSubmit={submit} className="mt-6 pt-5 border-t border-[#E5E5E5] space-y-3">
          <p className="text-sm font-bold text-[#171717]">{isRTL ? 'قيّم هذا المنتج' : 'Review this product'}</p>
          <div role="radiogroup" aria-label={isRTL ? 'التقييم' : 'Rating'} className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={isRTL ? `${n} من 5` : `${n} out of 5`}
                onClick={() => setStars(n)} className="p-1 cursor-pointer">
                <Star aria-hidden className={`w-6 h-6 ${n <= stars ? 'fill-[#B89753] text-[#B89753]' : 'text-[#D4D4D4]'}`} />
              </button>
            ))}
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder={isRTL ? 'العنوان (اختياري)' : 'Title (optional)'} aria-label={isRTL ? 'العنوان' : 'Title'}
            className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2.5 text-sm" />
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={3000} rows={4}
            placeholder={isRTL ? 'شاركنا تجربتك (اختياري)' : 'Tell other shoppers about it (optional)'} aria-label={isRTL ? 'التقييم' : 'Review'}
            className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2.5 text-sm" />
          {failure && <p role="alert" className="text-xs font-bold text-rose-700">{failure}</p>}
          <button type="submit" disabled={sending || stars < 1}
            className="gold-btn h-11 px-5 rounded-xl text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {sending ? (isRTL ? 'جارٍ الإرسال…' : 'Posting…') : (isRTL ? 'أرسل التقييم' : 'Post review')}
          </button>
          <p className="text-[11px] text-[#666666]">{isRTL ? 'تظهر التقييمات بعد مراجعة المتجر.' : 'Reviews appear once the store has approved them.'}</p>
        </form>
      )}
    </section>
  );
};

export default ProductReviews;
