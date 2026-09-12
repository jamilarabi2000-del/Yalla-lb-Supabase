import React, { useState } from 'react';
import { CMSNewsArticle } from '../../../types';
import { 
  Newspaper, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  Calendar, 
  Clock, 
  Tag, 
  Image as ImageIcon,
  Check,
  X
} from 'lucide-react';

interface CMSNewsTabProps {
  newsData: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    articles: CMSNewsArticle[];
  };
  onChangeField: (field: string, value: any) => void;
}

export const CMSNewsTab: React.FC<CMSNewsTabProps> = ({
  newsData = {
    title: 'News & Announcements',
    titleArabic: 'الأخبار والمقالات الحرفية',
    subtitle: 'Latest updates on Lebanese artisan revival, harvest seasons, and cultural exhibitions.',
    subtitleArabic: 'آخر أخبار الحرف اليدوية، مواسم الحصاد، والمعارض التراثية في لبنان.',
    articles: []
  },
  onChangeField,
}) => {
  const articles = newsData.articles || [];
  const [editingArticle, setEditingArticle] = useState<CMSNewsArticle | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formState, setFormState] = useState<CMSNewsArticle>({
    id: '',
    title: '',
    titleArabic: '',
    excerpt: '',
    excerptArabic: '',
    source: 'Yalla Cultural Desk',
    sourceArabic: 'محرر يلا الثقافي',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    dateArabic: '',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
    tag: 'Artisan Revival',
    tagArabic: 'إحياء الحرف',
    readTime: '3 min read',
    readTimeArabic: '3 دقائق',
    isPublished: true
  });

  const handleStartCreate = () => {
    setFormState({
      id: `article-${Date.now()}`,
      title: '',
      titleArabic: '',
      excerpt: '',
      excerptArabic: '',
      source: 'Yalla Cultural Desk',
      sourceArabic: 'محرر يلا الثقافي',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      dateArabic: '',
      imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80',
      tag: 'Heritage',
      tagArabic: 'تراث',
      readTime: '4 min read',
      readTimeArabic: '4 دقائق',
      isPublished: true
    });
    setIsCreating(true);
    setEditingArticle(null);
  };

  const handleStartEdit = (article: CMSNewsArticle) => {
    setFormState({ ...article });
    setEditingArticle(article);
    setIsCreating(false);
  };

  const handleSaveArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title.trim()) return;

    let updatedList: CMSNewsArticle[];
    if (editingArticle) {
      updatedList = articles.map(a => a.id === editingArticle.id ? formState : a);
    } else {
      updatedList = [formState, ...articles];
    }

    onChangeField('articles', updatedList);
    setEditingArticle(null);
    setIsCreating(false);
  };

  const handleDeleteArticle = (id: string) => {
    const updated = articles.filter(a => a.id !== id);
    onChangeField('articles', updated);
  };

  const handleTogglePublish = (id: string) => {
    const updated = articles.map(a => 
      a.id === id ? { ...a, isPublished: a.isPublished === false ? true : false } : a
    );
    onChangeField('articles', updated);
  };

  return (
    <div className="space-y-6">
      {/* Section Headings */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-amber-400" />
          <span>Cultural News & Press Section Headings</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              News Section Title (English)
            </label>
            <input
              type="text"
              value={newsData.title || ''}
              onChange={(e) => onChangeField('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              عنوان قسم الأخبار (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={newsData.titleArabic || ''}
              onChange={(e) => onChangeField('titleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              News Subtitle / Description (English)
            </label>
            <textarea
              rows={2}
              value={newsData.subtitle || ''}
              onChange={(e) => onChangeField('subtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              وصف قسم الأخبار (عربي)
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={newsData.subtitleArabic || ''}
              onChange={(e) => onChangeField('subtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Article Manager Header */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-emerald-400" />
              <span>Published Articles & Blog Posts</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">Manage heritage stories, harvest press releases, and artisan spotlights.</p>
          </div>
          {!isCreating && !editingArticle && (
            <button
              type="button"
              onClick={handleStartCreate}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Article</span>
            </button>
          )}
        </div>

        {/* Create / Edit Form Modal/Drawer */}
        {(isCreating || editingArticle) && (
          <form onSubmit={handleSaveArticle} className="p-5 bg-slate-950 border border-amber-500/40 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                <span>{editingArticle ? 'Edit Article' : 'Compose New Heritage Article'}</span>
              </h4>
              <button
                type="button"
                onClick={() => { setIsCreating(false); setEditingArticle(null); }}
                className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Article Headline (English)</label>
                <input
                  type="text"
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. Sarafand Phoenician Blown Glass Heritage"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">عنوان المقال (عربي)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={formState.titleArabic || ''}
                  onChange={(e) => setFormState({ ...formState, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="عنوان المقال بالعربية"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Short Excerpt / Lead (English)</label>
                <textarea
                  rows={2}
                  value={formState.excerpt}
                  onChange={(e) => setFormState({ ...formState, excerpt: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">موجز المقال (عربي)</label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={formState.excerptArabic || ''}
                  onChange={(e) => setFormState({ ...formState, excerptArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Source / Publication</label>
                <input
                  type="text"
                  value={formState.source}
                  onChange={(e) => setFormState({ ...formState, source: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Category Tag</label>
                <input
                  type="text"
                  value={formState.tag}
                  onChange={(e) => setFormState({ ...formState, tag: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Featured Image URL</label>
                <input
                  type="url"
                  value={formState.imageUrl}
                  onChange={(e) => setFormState({ ...formState, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Estimated Read Time</label>
                <input
                  type="text"
                  value={formState.readTime}
                  onChange={(e) => setFormState({ ...formState, readTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. 4 min read"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => { setIsCreating(false); setEditingArticle(null); }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save Article</span>
              </button>
            </div>
          </form>
        )}

        {/* Existing Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <div 
              key={article.id}
              className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                article.isPublished !== false ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-60'
              }`}
            >
              <div className="relative h-48 sm:h-52 bg-slate-950 overflow-hidden flex items-center justify-center group">
                {/* Ambient blurred backdrop for seamless filling without cropping foreground */}
                <img 
                  src={article.imageUrl} 
                  alt="" 
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover blur-md opacity-30 scale-110 pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                {/* Fully visible uncropped foreground image */}
                <img 
                  src={article.imageUrl} 
                  alt={article.title} 
                  className="relative z-10 max-h-full max-w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md ${
                    article.isPublished !== false ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {article.isPublished !== false ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="absolute bottom-2.5 left-2.5 z-20">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-amber-300 shadow-md">
                    {article.tag}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white line-clamp-2">{article.title}</h4>
                  {article.titleArabic && (
                    <p className="text-[11px] text-amber-400 font-serif line-clamp-1 mt-0.5" dir="rtl">
                      {article.titleArabic}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">{article.excerpt}</p>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>{article.date}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(article.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title={article.isPublished !== false ? 'Set as Draft' : 'Publish'}
                    >
                      {article.isPublished !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(article)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors"
                      title="Edit article"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArticle(article.id)}
                      className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors"
                      title="Delete article"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
