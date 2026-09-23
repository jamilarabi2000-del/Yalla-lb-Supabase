import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Eye, EyeOff, MessageSquareReply, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { isSafeImageUrl } from '../../lib/safeUrl';
import { supabaseUserDataService } from '../../services/supabaseUserDataService';
import { buildCustomerIndex } from '../../lib/customerIndex';
import { filterReviews, reviewStats, type ReviewStatusFilter } from '../../lib/reviews';
import type { Product, Review } from '../../types';

const REFRESH_MS = 60_000;
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const Stars: React.FC<{ rating: number; size?: string }> = ({ rating, size = 'w-4 h-4' }) => (
  <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} aria-hidden className={`${size} ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
    ))}
  </span>
);

export const ReviewsManager: React.FC<{ products?: Product[] }> = ({ products = [] }) => {
  const shop = useShop() as any;
  const toast = (msg: string, kind: 'success' | 'error' = 'success') => shop.showToast?.(msg, kind);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<number | 'all'>('all');
  const [status, setStatus] = useState<ReviewStatusFilter>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailure('');
    try {
      const [rows, profiles] = await Promise.all([
        supabaseUserDataService.listReviewsForAdmin(),
        supabaseUserDataService.listProfilesForDirectory(),
      ]);
      setReviews(rows);
      setNames(new Map(buildCustomerIndex(profiles, [], { includeStaff: true }).map(c => [c.id, c.name])));
    } catch (e: any) {
      setFailure(e?.message || 'Reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reviews are not streamed; the screen re-reads them every minute while open.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const productName = (id: string) => productsById.get(id)?.name || 'Removed product';
  const reviewerName = (userId?: string) => (userId ? names.get(userId) || 'Customer' : 'Former customer');
  const stats = useMemo(() => reviewStats(reviews), [reviews]);
  const visible = useMemo(
    () => filterReviews(reviews, { query, rating, status, productName, reviewerName }),
    [reviews, query, rating, status, productsById, names], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setBusy(id);
    try {
      await action();
      toast(done);
      await load();
    } catch (e: any) {
      toast(e?.message || 'The review could not be updated.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-5 text-slate-900">
      <header className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="mr-auto">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-500">Moderation</p>
          <h2 className="text-2xl font-black tracking-tight">Customer Reviews &amp; Store Replies</h2>
          <p className="mt-1 text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 font-black text-slate-900">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden />
              {stats.average.toFixed(1)} Average Rating
            </span>
            <span>({stats.count} review{stats.count === 1 ? '' : 's'})</span>
            {stats.pending > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black">{stats.pending} awaiting approval</span>
            )}
          </p>
        </div>
        <button onClick={load} className="self-start lg:self-auto px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black flex items-center gap-2">
          <span className="relative flex w-2 h-2" aria-hidden>
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
          </span>
          Live Sync <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search reviews"
          placeholder="Search reviews, products, or patrons..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div role="group" aria-label="Filter by rating" className="flex flex-wrap gap-1.5">
          {(['all', 5, 4, 3, 2, 1] as const).map(value => (
            <button key={value} aria-pressed={rating === value} onClick={() => setRating(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-black ${rating === value ? 'bg-[#a37f35] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {value === 'all' ? 'All Ratings' : `${value} Star${value === 1 ? '' : 's'}`}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Filter by status" className="flex gap-1.5 md:ml-auto">
          {([['all', 'All'], ['pending', 'Awaiting approval'], ['published', 'Published']] as Array<[ReviewStatusFilter, string]>).map(([value, label]) => (
            <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-black ${status === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {failure && <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm font-bold text-rose-700">{failure}</div>}
      {loading && <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center text-sm text-slate-500">Loading reviews…</div>}
      {!loading && !failure && visible.length === 0 && (
        <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center text-sm text-slate-500">
          {reviews.length === 0 ? 'No reviews yet. Customers can review a product once an order containing it is delivered.' : 'No reviews match these filters.'}
        </div>
      )}

      <div className="space-y-4">
        {visible.map(review => {
          const product = productsById.get(review.productId);
          const image = product?.image && isSafeImageUrl(product.image) ? product.image : undefined;
          const draft = drafts[review.id] ?? review.adminReply ?? '';
          const isBusy = busy === review.id;
          return (
            <article key={review.id} className="bg-white border border-slate-200 hover:border-slate-300 transition-colors rounded-3xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 shrink-0 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden">
                  {image && <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Product: <span className="font-black text-slate-900">{productName(review.productId)}</span></p>
                  <p className="mt-1 text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-slate-900">{reviewerName(review.userId)}</span>
                    {/* Every review passed private.can_review_product when it was posted. */}
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Verified Purchase</span>
                    <span>• {shortDate(review.createdAt)}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50"><Stars rating={review.rating} size="w-3.5 h-3.5" /></span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${review.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {review.isPublished ? 'Published' : 'Awaiting approval'}
                    </span>
                  </div>
                  {review.title && <h3 className="mt-2 font-black">{review.title}</h3>}
                  {review.body ? <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">"{review.body}"</p>
                    : <p className="mt-1 text-sm text-slate-400">Rating only, no comment.</p>}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <MessageSquareReply className="w-4 h-4 text-[#a37f35]" aria-hidden /> Admin Reply (Official Store Response)
                </p>
                {review.adminReply && (
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">
                    "{review.adminReply}" <span className="text-[11px] text-slate-400">· {shortDate(review.adminReplyAt)}</span>
                  </p>
                )}
                <textarea value={draft} onChange={e => setDrafts(d => ({ ...d, [review.id]: e.target.value }))}
                  aria-label={`Store reply to ${reviewerName(review.userId)}`} maxLength={2000} rows={2}
                  placeholder="Write a public reply from the store…"
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#a37f35]" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button disabled={isBusy || !draft.trim() || draft.trim() === (review.adminReply || '')}
                    onClick={() => run(review.id, () => supabaseUserDataService.saveReviewReply(review.id, draft), 'Store reply published.')}
                    className="px-3 py-2 rounded-xl bg-[#a37f35] hover:bg-[#8F7137] text-white text-xs font-black disabled:opacity-50">
                    Publish Store Reply
                  </button>
                  {review.adminReply && (
                    <button disabled={isBusy}
                      onClick={() => confirm('Remove the store reply?') && run(review.id, () => supabaseUserDataService.saveReviewReply(review.id, null), 'Store reply removed.')}
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black disabled:opacity-50">
                      Remove reply
                    </button>
                  )}
                  <span className="flex-1" />
                  <button disabled={isBusy}
                    onClick={() => run(review.id, () => supabaseUserDataService.setReviewPublished(review.id, !review.isPublished),
                      review.isPublished ? 'Review hidden from the store.' : 'Review published.')}
                    className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50 ${review.isPublished ? 'bg-white border border-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                    {review.isPublished ? <><EyeOff className="w-4 h-4" aria-hidden /> Hide</> : <><Eye className="w-4 h-4" aria-hidden /> Publish</>}
                  </button>
                  <button disabled={isBusy}
                    onClick={() => confirm('Delete this review permanently?') && run(review.id, () => supabaseUserDataService.deleteReview(review.id), 'Review deleted.')}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" aria-hidden /> Delete Review
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ReviewsManager;
