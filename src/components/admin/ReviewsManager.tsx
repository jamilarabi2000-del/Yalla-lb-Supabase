import React, { useEffect, useMemo, useState } from 'react';
import { Star, MessageSquare, Search, Trash2, Send, Package, Filter, Eye, EyeOff } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { supabase } from '../../lib/supabase';

interface ReviewsManagerProps { products: any[]; }

type ReviewRow = {
  id: string; product_id: string; user_id: string | null; rating: number; title?: string | null; body?: string | null;
  is_published: boolean; created_at: string; admin_reply?: string | null; admin_reply_at?: string | null;
};

export const ReviewsManager: React.FC<ReviewsManagerProps> = ({ products }) => {
  const { showToast } = useShop();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);

  const loadReviews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('reviews').select('id,product_id,user_id,rating,title,body,is_published,created_at,admin_reply,admin_reply_at').order('created_at', { ascending: false }).limit(500);
    if (error) {
      console.error(error);
      showToast('Failed to load reviews from Supabase', 'error');
    } else setReviews((data || []) as ReviewRow[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadReviews();
    const channel = supabase.channel('admin-reviews-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => loadReviews())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const productsMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const filteredReviews = useMemo(() => reviews.filter(r => {
    const product = productsMap.get(r.product_id);
    const text = `${product?.name || ''} ${r.title || ''} ${r.body || ''}`.toLowerCase();
    return (!searchQuery || text.includes(searchQuery.toLowerCase())) && (ratingFilter === 'all' || r.rating === ratingFilter);
  }), [reviews, productsMap, searchQuery, ratingFilter]);

  const handleReply = async (id: string) => {
    const reply = (replyInputs[id] || '').trim();
    if (!reply) return showToast('Please enter a reply message', 'warning');
    setIsSubmittingId(id);
    const now = new Date().toISOString();
    const { error } = await supabase.from('reviews').update({ admin_reply: reply, admin_reply_at: now }).eq('id', id);
    if (error) showToast(error.message, 'error');
    else { setReplyInputs(prev => ({ ...prev, [id]: '' })); showToast('Admin reply published successfully!', 'success'); await loadReviews(); }
    setIsSubmittingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer review?')) return;
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) showToast(error.message, 'error'); else { setReviews(prev => prev.filter(r => r.id !== id)); showToast('Review deleted successfully', 'success'); }
  };

  const togglePublished = async (review: ReviewRow) => {
    const { error } = await supabase.from('reviews').update({ is_published: !review.is_published }).eq('id', review.id);
    if (error) showToast(error.message, 'error'); else { setReviews(prev => prev.map(r => r.id === review.id ? { ...r, is_published: !r.is_published } : r)); showToast(review.is_published ? 'Review hidden' : 'Review published', 'success'); }
  };

  const averageRating = reviews.length ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1) : '5.0';

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
      <div><h2 className="text-xl font-bold text-slate-900">Customer Reviews & Store Replies</h2><p className="text-xs text-slate-500 mt-1">Monitor patron feedback, respond to reviews, and control publication through Supabase.</p></div>
      <div className="flex items-center gap-3"><div className="px-4 py-2 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-2"><Star className="w-4 h-4 text-amber-500 fill-current"/><span className="text-xs font-bold">{averageRating} Average Rating</span><span className="text-[10px] text-slate-500">({reviews.length} reviews)</span></div><div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl text-xs">● Live Sync</div></div>
    </div>
    <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="relative w-full sm:w-80"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search reviews or products..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:outline-none focus:border-[#a37f35]"/></div>
      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto"><Filter className="w-3.5 h-3.5 text-slate-400"/><span className="text-xs font-bold">Filter:</span>{(['all',5,4,3,2,1] as const).map(stars => <button key={stars} onClick={() => setRatingFilter(stars as any)} className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${ratingFilter === stars ? 'bg-[#a37f35] text-white' : 'bg-slate-100 text-slate-700'}`}>{stars === 'all' ? 'All Ratings' : `${stars} Stars`}</button>)}</div>
    </div>
    {isLoading ? <div className="py-20 text-center">Loading…</div> : filteredReviews.length === 0 ? <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/80"><MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3"/><h3 className="text-sm font-bold text-slate-700">No customer reviews found</h3></div> : <div className="space-y-4">
      {filteredReviews.map(review => { const product = productsMap.get(review.product_id); const comment = review.body || ''; return <article key={review.id} className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 hover:border-slate-300 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100"><div className="flex items-center gap-3">{product?.image ? <img src={product.image} alt={product.name} className="w-10 h-10 rounded-xl border object-contain"/> : <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Package className="w-5 h-5 text-slate-400"/></div>}<div><span className="text-[10px] font-bold uppercase tracking-wider text-[#a37f35]">Product Item</span><h4 className="text-xs font-bold text-slate-900">{product?.name || review.product_id}</h4></div></div><div className="flex items-center gap-2"><div className="flex text-amber-400">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'fill-current' : 'text-slate-200'}`}/>)}</div><button onClick={() => togglePublished(review)} title={review.is_published ? 'Hide review' : 'Publish review'} className={`p-2 rounded-xl ${review.is_published ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>{review.is_published ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}</button><button onClick={() => handleDelete(review.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4"/></button></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">{review.title || 'Customer Review'}</span><span className="text-[10px] text-slate-400">{new Date(review.created_at).toLocaleString()}</span></div><p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">"{comment}"</p></div>
        <div>{review.admin_reply ? <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl"><div className="flex justify-between"><span className="text-xs font-bold text-[#a37f35]">Store Admin Response</span><button onClick={() => setReplyInputs(p => ({...p,[review.id]:review.admin_reply || ''}))} className="text-[11px] font-bold text-[#a37f35]">Edit Reply</button></div><p className="text-xs text-slate-800 mt-2">{review.admin_reply}</p></div> : null}{(!review.admin_reply || replyInputs[review.id] !== undefined) && <div className="mt-3 flex items-center gap-2"><input value={replyInputs[review.id] ?? ''} onChange={e => setReplyInputs(p => ({...p,[review.id]:e.target.value}))} placeholder="Write store response to customer..." className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"/><button disabled={isSubmittingId === review.id} onClick={() => handleReply(review.id)} className="px-4 py-2.5 bg-[#a37f35] hover:bg-[#8e6d2c] text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5"><Send className="w-3.5 h-3.5"/>{review.admin_reply ? 'Update Reply' : 'Send Reply'}</button></div>}</div>
      </article> })}
    </div>}
  </div>;
};
export default ReviewsManager;
