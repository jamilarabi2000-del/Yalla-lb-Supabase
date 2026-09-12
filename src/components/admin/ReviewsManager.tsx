import React, { useState, useEffect } from 'react';
import { useShop } from '../../context/ShopContext';
import { Review, Product } from '../../types';
import { collection, query, limit, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Star, 
  MessageSquare, 
  Search, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Package, 
  User, 
  Calendar,
  ExternalLink,
  Filter
} from 'lucide-react';

interface ReviewsManagerProps {
  products: Product[];
}

export const ReviewsManager: React.FC<ReviewsManagerProps> = ({ products }) => {
  const { showToast } = useShop();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'reviews'), limit(500));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Review[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            productId: data.productId || '',
            userId: data.userId || '',
            userName: data.userName || 'Anonymous Patron',
            rating: Number(data.rating) || 5,
            comment: data.comment || '',
            createdAt: data.createdAt || new Date().toISOString(),
            orderId: data.orderId,
            adminReply: data.adminReply || '',
            adminReplyAt: data.adminReplyAt
          });
        });
        // Sort newest first
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReviews(items);
        setIsLoading(false);
      },
      (err) => {
        console.error("Failed to listen to reviews in realtime:", err);
        showToast('Failed to load reviews from Firestore', 'error');
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const productsMap = React.useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  const filteredReviews = React.useMemo(() => {
    return reviews.filter(r => {
      const prod = productsMap.get(r.productId);
      const prodName = prod?.name || r.productId;
      const matchesSearch = 
        r.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.comment.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.adminReply && r.adminReply.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRating = ratingFilter === 'all' || r.rating === ratingFilter;

      return matchesSearch && matchesRating;
    });
  }, [reviews, searchQuery, ratingFilter, productsMap]);

  const handleSendReply = async (reviewId: string) => {
    const replyText = (replyInputs[reviewId] || '').trim();
    if (!replyText) {
      showToast('Please enter a reply message', 'warning');
      return;
    }

    setIsSubmittingId(reviewId);
    try {
      const now = new Date().toISOString();
      const reviewRef = doc(db, 'reviews', reviewId);
      await updateDoc(reviewRef, {
        adminReply: replyText,
        adminReplyAt: now
      });

      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, adminReply: replyText, adminReplyAt: now } : r));
      setReplyInputs(prev => ({ ...prev, [reviewId]: '' }));
      showToast('Admin reply published successfully!', 'success');
    } catch (err) {
      console.error("Failed to publish admin reply:", err);
      showToast('Failed to publish reply', 'error');
    } finally {
      setIsSubmittingId(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!window.confirm('Are you sure you want to delete this customer review?')) return;
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      showToast('Review deleted successfully', 'success');
    } catch (err) {
      console.error("Failed to delete review:", err);
      showToast('Failed to delete review', 'error');
    }
  };

  const averageRating = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : '5.0';

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Customer Reviews & Store Replies</h2>
          <p className="text-xs text-slate-500 mt-1">
            Monitor patron feedback, respond directly to customer reviews, and build trust.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-current" />
            <span className="text-xs font-bold text-slate-900">{averageRating} Average Rating</span>
            <span className="text-[10px] text-slate-500">({reviews.length} reviews)</span>
          </div>
          <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl text-xs flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Sync</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search reviews, products, or patrons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none focus:border-[#a37f35]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-700 shrink-0">Filter:</span>
          {['all', 5, 4, 3, 2, 1].map((stars) => (
            <button
              key={stars}
              type="button"
              onClick={() => setRatingFilter(stars as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                ratingFilter === stars
                  ? 'bg-[#a37f35] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {stars === 'all' ? 'All Ratings' : `${stars} Stars`}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      {isLoading ? (
        <div className="py-20 flex justify-center items-center">
          <div className="w-8 h-8 border-3 border-[#a37f35]/20 border-t-[#a37f35] rounded-full animate-spin"></div>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No customer reviews found</h3>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or rating filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const product = productsMap.get(review.productId);
            const isSubmitting = isSubmittingId === review.id;

            return (
              <div 
                key={review.id} 
                className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 hover:border-slate-300 transition-all"
              >
                {/* Top Row: Product & Reviewer info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    {product?.image ? (
                      <div className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                        <img 
                          src={product.image} 
                          alt={product.name} 
                          className="w-full h-full object-contain" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#a37f35]">
                        Product Item
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                        {product?.name || review.productId}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="flex items-center text-amber-400 gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star 
                          key={s} 
                          className={`w-3.5 h-3.5 ${s <= review.rating ? 'fill-current text-amber-400' : 'text-slate-200'}`} 
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteReview(review.id)}
                      title="Delete Review"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Review Content */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {review.userName.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-900">{review.userName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed font-normal bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    "{review.comment}"
                  </p>
                </div>

                {/* Admin Reply Section */}
                <div className="pt-2">
                  {review.adminReply ? (
                    <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#a37f35]">
                          <span>Store Admin Response</span>
                          {review.adminReplyAt && (
                            <span className="text-[10px] font-normal text-slate-400">
                              ({new Date(review.adminReplyAt).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyInputs(prev => ({ ...prev, [review.id]: review.adminReply || '' }))}
                          className="text-[11px] font-bold text-[#a37f35] hover:underline cursor-pointer"
                        >
                          Edit Reply
                        </button>
                      </div>
                      <p className="text-xs text-slate-800 font-medium leading-relaxed">
                        {review.adminReply}
                      </p>
                    </div>
                  ) : null}

                  {(!review.adminReply || replyInputs[review.id] !== undefined) && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Write store response to customer..."
                        value={replyInputs[review.id] ?? ''}
                        onChange={(e) => setReplyInputs({ ...replyInputs, [review.id]: e.target.value })}
                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#a37f35]"
                      />
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSendReply(review.id)}
                        className="px-4 py-2.5 bg-[#a37f35] hover:bg-[#8e6d2c] text-white font-bold rounded-xl text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0 shadow-xs disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{review.adminReply ? 'Update Reply' : 'Send Reply'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
