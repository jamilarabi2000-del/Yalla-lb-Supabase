import React, { useState } from 'react';
import { useShop } from '../../context/ShopContext';
import { CategoryItem, TerroirRegion } from '../../types';
import { CategoryProductsOrderModal } from './CategoryProductsOrderModal';
import { 
  FolderTree, 
  Plus, 
  MapPin, 
  Tag, 
  Sparkles, 
  Layers, 
  Search, 
  Edit3, 
  Check, 
  Trash2,
  ChevronRight,
  ShoppingBag,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  ArrowUpDown,
  ListOrdered,
  LayoutGrid,
  Package,
  Star,
  SlidersHorizontal,
  RotateCcw,
  AlertTriangle,
  Globe,
  Image as ImageIcon,
  Key,
  X,
  Truck,
  Save
} from 'lucide-react';

const EMOJI_SUGGESTIONS = ['🫒', '🧼', '✈️', '🏺', '🧵', '✨', '🧸', '⚡', '🔧', '🚰', '💡', '🔌', '🧹', '🎨', '🍯', '🌿', '☕', '🍞', '🧀', '🍇', '🇱🇧', '🕯️', '📦'];

const ARABIC_KEYWORD_SUGGESTIONS = [
  'مونة بلدية',
  'زيت زيتون كورة',
  'زعتر بلدي جبلي',
  'عسل سدر لبناني',
  'صابون غار طرابلس',
  'حرف يدوية لبنانية',
  'فخار بيت شباب',
  'زجاج صرفند',
  'شحن مغتربين',
  'صناعة لبنانية أصيلة',
  'دبس رمان طبيعي',
  'ماء زهر وورد'
];

const ENGLISH_KEYWORD_SUGGESTIONS = [
  'lebanese mouneh',
  'koura olive oil',
  'wild zaatar',
  'cedar honey',
  'tripoli laurel soap',
  'handcrafted in lebanon',
  'sarafand blown glass',
  'diaspora express shipping',
  'authentic lebanese crafts',
  'artisan pantry'
];

export const CategoriesDetailsView: React.FC = () => {
  const { 
    categories, 
    addCategory, 
    updateCategory, 
    deleteCategory, 
    reorderCategories,
    regions,
    updateRegion,
    addRegion,
    deleteRegion,
    products, 
    showToast 
  } = useShop();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'regions'>('categories');
  const [filterPublished, setFilterPublished] = useState<'all' | 'published' | 'hidden'>('all');
  const [categoryViewMode, setCategoryViewMode] = useState<'grid' | 'reorder'>('grid');
  const [selectedCategoryForProductOrder, setSelectedCategoryForProductOrder] = useState<CategoryItem | null>(null);

  // Add / Edit Category State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  
  const [catForm, setCatForm] = useState<{
    id: string;
    nameEn: string;
    nameAr: string;
    icon: string;
    description: string;
    descriptionAr: string;
    subcategories: string[];
    newSubcatInput: string;
    bannerUrl: string;
    arabicKeywords: string[];
    newArabicKeywordInput: string;
    englishKeywords: string[];
    newEnglishKeywordInput: string;
    isPublished: boolean;
  }>({
    id: '',
    nameEn: '',
    nameAr: '',
    icon: '🫒',
    description: '',
    descriptionAr: '',
    subcategories: [],
    newSubcatInput: '',
    bannerUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=800',
    arabicKeywords: [],
    newArabicKeywordInput: '',
    englishKeywords: [],
    newEnglishKeywordInput: '',
    isPublished: true
  });

  // Delete Category Safeguard Modal
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryItem | null>(null);
  const [reassignTargetCatId, setReassignTargetCatId] = useState<string>('');
  const [deleteProductsAction, setDeleteProductsAction] = useState<'reassign' | 'delete' | 'unlink'>('reassign');

  // Quick remove subcategory directly from category
  const handleRemoveSubcategory = async (cat: CategoryItem, subToRemove: string) => {
    try {
      const nextSubcats = (cat.subcategories || []).filter(s => s !== subToRemove);
      await updateCategory(cat.id, { subcategories: nextSubcats });
      showToast(`Removed subcategory "${subToRemove}" from "${cat.nameEn}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not remove subcategory.', 'warning');
    }
  };

  // Quick remove Arabic SEO keyword directly from category
  const handleRemoveArabicKeyword = async (cat: CategoryItem, kwToRemove: string) => {
    try {
      const nextKws = (cat.arabicKeywords || []).filter(k => k !== kwToRemove);
      await updateCategory(cat.id, { arabicKeywords: nextKws });
      showToast(`Removed keyword "${kwToRemove}" from "${cat.nameEn}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not remove keyword.', 'warning');
    }
  };

  // Region Add/Edit Modal
  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<TerroirRegion | null>(null);
  const [regionForm, setRegionForm] = useState<{
    id: string;
    nameEn: string;
    nameAr: string;
    baseDeliveryUSD: number;
    expressAvailable: boolean;
    majorCities: string[];
    newCityInput: string;
    estimatedTimeEn: string;
    estimatedTimeAr: string;
  }>({
    id: '',
    nameEn: '',
    nameAr: '',
    baseDeliveryUSD: 3.0,
    expressAvailable: true,
    majorCities: [],
    newCityInput: '',
    estimatedTimeEn: 'Same-day delivery (2-4 hours)',
    estimatedTimeAr: 'توصيل في نفس اليوم (٢-٤ ساعات)'
  });

  const [regionToDelete, setRegionToDelete] = useState<TerroirRegion | null>(null);

  // Filter Categories
  const filteredCategories = categories.filter(c => {
    const matchesSearch = 
      c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nameAr.includes(searchQuery) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.subcategories || []).some(s => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.arabicKeywords || []).some(k => k.includes(searchQuery)) ||
      (c.englishKeywords || []).some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterPublished === 'published') return c.isPublished !== false;
    if (filterPublished === 'hidden') return c.isPublished === false;
    return true;
  });

  // Filter Regions
  const filteredRegions = regions.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.nameEn.toLowerCase().includes(q) ||
      r.nameAr.includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (r.majorCities || []).some(city => city.toLowerCase().includes(q)) ||
      (r.estimatedTimeEn || '').toLowerCase().includes(q)
    );
  });

  const getProductCountForCategory = (catId: string) => {
    return products.filter(p => p.category === catId).length;
  };

  // Open Create Category Modal
  const handleOpenCreateCategory = () => {
    setEditingCategory(null);
    setCatForm({
      id: '',
      nameEn: '',
      nameAr: '',
      icon: '🫒',
      description: '',
      descriptionAr: '',
      subcategories: ['General'],
      newSubcatInput: '',
      bannerUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=800',
      arabicKeywords: ['مونة بلدية', 'زيت زيتون', 'صناعة لبنانية'],
      newArabicKeywordInput: '',
      englishKeywords: ['mouneh', 'artisan', 'lebanese'],
      newEnglishKeywordInput: '',
      isPublished: true
    });
    setIsCategoryModalOpen(true);
  };

  // Open Edit Category Modal
  const handleOpenEditCategory = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setCatForm({
      id: cat.id,
      nameEn: cat.nameEn,
      nameAr: cat.nameAr,
      icon: cat.icon || '🏷️',
      description: cat.description || '',
      descriptionAr: cat.descriptionAr || '',
      subcategories: [...(cat.subcategories || [])],
      newSubcatInput: '',
      bannerUrl: cat.bannerUrl || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=800',
      arabicKeywords: [...(cat.arabicKeywords || [])],
      newArabicKeywordInput: '',
      englishKeywords: [...(cat.englishKeywords || [])],
      newEnglishKeywordInput: '',
      isPublished: cat.isPublished !== false
    });
    setIsCategoryModalOpen(true);
  };

  // Submit Category Form (Create or Update)
  const handleSaveCategory = async (e?: React.FormEvent, isPublic?: boolean) => {
    if (e) e.preventDefault();
    if (!catForm.nameEn.trim()) {
      showToast('English category name is required', 'warning');
      return;
    }

    const targetPublish = isPublic !== undefined ? isPublic : catForm.isPublished;

    const payload: Omit<CategoryItem, 'id'> & { id?: string } = {
      nameEn: catForm.nameEn.trim(),
      nameAr: catForm.nameAr.trim() || catForm.nameEn.trim(),
      icon: catForm.icon.trim() || '🏷️',
      description: catForm.description.trim(),
      descriptionAr: catForm.descriptionAr.trim(),
      subcategories: catForm.subcategories.filter(Boolean),
      bannerUrl: catForm.bannerUrl.trim(),
      arabicKeywords: catForm.arabicKeywords.filter(Boolean),
      englishKeywords: catForm.englishKeywords.filter(Boolean),
      isPublished: targetPublish
    };

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        showToast(
          targetPublish 
            ? `Category "${catForm.nameEn}" updated & published to Public Store!`
            : `Category "${catForm.nameEn}" saved as Draft (Hidden).`,
          'success'
        );
      } else {
        payload.id = catForm.id.trim() || catForm.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await addCategory(payload);
        showToast(
          targetPublish 
            ? `Category "${catForm.nameEn}" created & published to Public Store!`
            : `Category "${catForm.nameEn}" saved as Draft (Unpublished).`,
          'success'
        );
      }
      setIsCategoryModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Could not save category. Please try again.', 'warning');
    }
  };

  // Reorder Category Items (Step or Extreme)
  const handleMoveCategory = async (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    let targetIdx = index;
    if (direction === 'up') targetIdx = index - 1;
    if (direction === 'down') targetIdx = index + 1;
    if (direction === 'top') targetIdx = 0;
    if (direction === 'bottom') targetIdx = categories.length - 1;

    if (targetIdx < 0 || targetIdx >= categories.length || targetIdx === index) return;

    const newCategories = [...categories];
    const item = newCategories.splice(index, 1)[0];
    newCategories.splice(targetIdx, 0, item);

    try {
      await reorderCategories(newCategories);
      showToast(`Category "${item.nameEn}" moved to position #${targetIdx + 1}!`, 'success');
    } catch (err: any) {
      showToast('Could not save category order. Please try again.', 'warning');
    }
  };

  // Direct rank positioning for categories
  const handleSetCategoryRank = async (currentIndex: number, newRankStr: string) => {
    const newRank = parseInt(newRankStr, 10);
    if (isNaN(newRank) || newRank < 1 || newRank > categories.length) return;
    
    const targetIdx = newRank - 1;
    if (targetIdx === currentIndex) return;

    const newCategories = [...categories];
    const item = newCategories.splice(currentIndex, 1)[0];
    newCategories.splice(targetIdx, 0, item);

    try {
      await reorderCategories(newCategories);
      showToast(`Category "${item.nameEn}" moved to position #${newRank}!`, 'success');
    } catch (err: any) {
      showToast('Could not save category order. Please try again.', 'warning');
    }
  };

  // Quick preset sorting for categories
  const handleSortCategories = async (mode: 'az_en' | 'az_ar' | 'products' | 'default') => {
    let sorted = [...categories];
    if (mode === 'az_en') {
      sorted.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    } else if (mode === 'az_ar') {
      sorted.sort((a, b) => a.nameAr.localeCompare(b.nameAr));
    } else if (mode === 'products') {
      sorted.sort((a, b) => getProductCountForCategory(b.id) - getProductCountForCategory(a.id));
    } else if (mode === 'default') {
      sorted.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
    }

    try {
      await reorderCategories(sorted);
      showToast('Categories order updated & saved!', 'success');
    } catch (err: any) {
      showToast('Could not save category order.', 'warning');
    }
  };

  // Confirm Delete Category
  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      const targetReassign = deleteProductsAction === 'delete'
        ? '__delete_products__'
        : deleteProductsAction === 'unlink'
          ? 'general'
          : (reassignTargetCatId || undefined);

      await deleteCategory(categoryToDelete.id, targetReassign, deleteProductsAction === 'delete');
      showToast(`Category "${categoryToDelete.nameEn}" deleted successfully`, 'success');
      setCategoryToDelete(null);
      setReassignTargetCatId('');
      setDeleteProductsAction('reassign');
    } catch (err: any) {
      showToast(err.message || 'Could not delete category.', 'warning');
    }
  };

  // Open Add Region Modal
  const handleOpenCreateRegion = () => {
    setEditingRegion(null);
    setRegionForm({
      id: '',
      nameEn: '',
      nameAr: '',
      baseDeliveryUSD: 4.0,
      expressAvailable: true,
      majorCities: ['Beirut', 'Jounieh'],
      newCityInput: '',
      estimatedTimeEn: 'Within 24-48 hours',
      estimatedTimeAr: 'خلال ٢٤-٤٨ ساعة'
    });
    setIsRegionModalOpen(true);
  };

  // Open Edit Region Modal
  const handleOpenEditRegion = (reg: TerroirRegion) => {
    setEditingRegion(reg);
    setRegionForm({
      id: reg.id,
      nameEn: reg.nameEn,
      nameAr: reg.nameAr,
      baseDeliveryUSD: reg.baseDeliveryUSD,
      expressAvailable: reg.expressAvailable,
      majorCities: [...(reg.majorCities || [])],
      newCityInput: '',
      estimatedTimeEn: reg.estimatedTimeEn || 'Within 24-48 hours',
      estimatedTimeAr: reg.estimatedTimeAr || 'خلال ٢٤-٤٨ ساعة'
    });
    setIsRegionModalOpen(true);
  };

  // Save Region Form
  const handleSaveRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regionForm.nameEn.trim()) return;

    const payload: TerroirRegion = {
      id: editingRegion ? editingRegion.id : (regionForm.id.trim() || regionForm.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')),
      nameEn: regionForm.nameEn.trim(),
      nameAr: regionForm.nameAr.trim() || regionForm.nameEn.trim(),
      baseDeliveryUSD: Number(regionForm.baseDeliveryUSD) || 0,
      expressAvailable: regionForm.expressAvailable,
      majorCities: regionForm.majorCities.filter(Boolean),
      estimatedTimeEn: regionForm.estimatedTimeEn.trim(),
      estimatedTimeAr: regionForm.estimatedTimeAr.trim()
    };

    try {
      if (editingRegion) {
        await updateRegion(editingRegion.id, payload);
        showToast(`Logistics for "${payload.nameEn}" updated!`, 'success');
      } else {
        await addRegion(payload);
        showToast(`Region zone "${payload.nameEn}" added!`, 'success');
      }
      setIsRegionModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Could not save region. Please try again.', 'warning');
    }
  };

  return (
    <div className="space-y-6" id="categories-details-management-view">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#4f46e5] shadow-xs">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  Categories & Details Management
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Full CRUD & Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage full taxonomy, Arabic SEO keywords, subcategories, artisan guilds, and regional logistics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'categories' ? (
            <button
              onClick={handleOpenCreateCategory}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Category</span>
            </button>
          ) : (
            <button
              onClick={handleOpenCreateRegion}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#c5a059] hover:bg-[#b08d46] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Regional Zone</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'categories' 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Store Categories ({categories.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('regions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'regions' 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            <span>Lebanon Terroir Logistics ({regions.length})</span>
          </button>
        </div>

        {activeTab === 'categories' ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle: Grid Cards vs Interactive Reorder List */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setCategoryViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  categoryViewMode === 'grid' 
                    ? 'bg-white text-slate-900 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid Cards</span>
              </button>
              <button
                onClick={() => setCategoryViewMode('reorder')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  categoryViewMode === 'reorder' 
                    ? 'bg-[#4f46e5] text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Organize Category & Product Order"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Organize Order ({categories.length})</span>
              </button>
            </div>

            {/* Quick Sort Presets for Categories */}
            <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase px-1.5 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-indigo-500" />
                <span>Sort:</span>
              </span>
              <button
                onClick={() => handleSortCategories('az_en')}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                title="Sort Alphabetically (English A-Z)"
              >
                A-Z (EN)
              </button>
              <button
                onClick={() => handleSortCategories('az_ar')}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[11px] font-semibold font-serif transition-all cursor-pointer shadow-2xs"
                title="Sort Alphabetically (Arabic أ-ي)"
              >
                أ-ي (AR)
              </button>
              <button
                onClick={() => handleSortCategories('products')}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                title="Sort by Product Count (Most items first)"
              >
                Most Products
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setFilterPublished('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${filterPublished === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                All ({categories.length})
              </button>
              <button
                onClick={() => setFilterPublished('published')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${filterPublished === 'published' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
              >
                Published ({categories.filter(c => c.isPublished !== false).length})
              </button>
              <button
                onClick={() => setFilterPublished('hidden')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${filterPublished === 'hidden' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
              >
                Hidden ({categories.filter(c => c.isPublished === false).length})
              </button>
            </div>

            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] shadow-2xs"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Search Delivery Zones */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search delivery zones & hubs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 shadow-2xs"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs font-bold text-slate-500 hidden sm:inline">
              Showing {filteredRegions.length} of {regions.length} zones
            </span>
          </div>
        )}
      </div>

      {/* Live Storefront Navigation Sequence Strip */}
      {activeTab === 'categories' && categories.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-900/90 via-slate-900 to-slate-900 text-white p-3.5 sm:p-4 rounded-2xl border border-indigo-500/20 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                Live Storefront Customer Navigation Bar & Category Flow:
              </span>
            </div>
            <span className="text-[11px] text-indigo-300 font-medium">
              Reorder below using Up/Down arrows, Top/Bottom jumps, or typing position numbers.
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {categories.map((cat, idx) => (
              <div 
                key={cat.id}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 rounded-xl shrink-0 text-xs transition-all cursor-pointer"
                onClick={() => setSelectedCategoryForProductOrder(cat)}
                title={`Click to organize products in ${cat.nameEn}`}
              >
                <span className="w-4 h-4 rounded-full bg-indigo-400/40 text-[10px] font-mono font-bold flex items-center justify-center text-indigo-200">
                  {idx + 1}
                </span>
                <span>{cat.icon}</span>
                <span className="font-semibold text-white truncate max-w-[120px]">{cat.nameEn}</span>
                <span className="text-[10px] text-amber-300 font-serif">({getProductCountForCategory(cat.id)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 1: Categories Content */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {filteredCategories.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-2xl">
                📂
              </div>
              <h3 className="text-base font-bold text-slate-800">No matching categories found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No categories matched "{searchQuery}". You can create a new category or clear your search query.
              </p>
              <button
                onClick={() => { setSearchQuery(''); setFilterPublished('all'); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reset Search Filters
              </button>
            </div>
          ) : categoryViewMode === 'reorder' ? (
            /* Mode 2: Dedicated Interactive Reorder List */
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-5 h-5 text-[#4f46e5]" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Category & Product Order Organizer
                    </h3>
                    <p className="text-xs text-slate-500">
                      Arrange categories in display sequence. Click "Order Products" to reorder products within any category.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    Total: {categories.length} Categories
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {categories.map((cat, index) => {
                  const count = getProductCountForCategory(cat.id);
                  const isPublished = cat.isPublished !== false;
                  const isFirst = index === 0;
                  const isLast = index === categories.length - 1;

                  return (
                    <div 
                      key={cat.id}
                      className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:bg-slate-50/80 ${
                        !isPublished ? 'opacity-70 bg-slate-50/50' : ''
                      }`}
                    >
                      {/* Left: Position Rank & Move Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Position input / badge */}
                        <div className="flex flex-col items-center justify-center">
                          <div className={`w-9 h-9 rounded-xl font-mono font-black text-xs flex items-center justify-center shadow-xs ${
                            isFirst ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-slate-900 text-white'
                          }`}>
                            #{index + 1}
                          </div>
                          <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Rank</span>
                        </div>

                        {/* Step Controls */}
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleMoveCategory(index, 'up')}
                            disabled={isFirst}
                            title="Move Up 1 spot"
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-[#4f46e5] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveCategory(index, 'down')}
                            disabled={isLast}
                            title="Move Down 1 spot"
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-[#4f46e5] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Instant Jump to #1 (Top) Action */}
                        <button
                          onClick={() => handleMoveCategory(index, 'top')}
                          disabled={isFirst}
                          title="Instantly jump category to Rank #1 (First in Storefront)"
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer shadow-xs ${
                            isFirst 
                              ? 'bg-amber-100 text-amber-800 opacity-60 cursor-default' 
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white hover:scale-105 active:scale-95'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 fill-current" />
                          <span>{isFirst ? 'Top #1' : 'Make #1'}</span>
                        </button>

                        {/* Jump to Bottom */}
                        <button
                          onClick={() => handleMoveCategory(index, 'bottom')}
                          disabled={isLast}
                          title="Jump to Bottom"
                          className="hidden md:flex w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-all"
                        >
                          <ChevronsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Middle: Category Info & Details */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-2xl flex items-center justify-center shadow-2xs shrink-0">
                          {cat.icon || '🏷️'}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900 truncate">
                              {cat.nameEn}
                            </h4>
                            <span className="text-xs text-[#c5a059] font-serif font-bold truncate">
                              {cat.nameAr}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {cat.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                            <span>{cat.description || 'No description'}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-700">
                              {cat.subcategories?.length || 0} subcategories
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Product Ordering Button & Direct Controls */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {/* Direct Position Rank Changer */}
                        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                          <span className="text-[10px] text-slate-400 font-bold pl-1">Move to:</span>
                          <input
                            type="number"
                            min="1"
                            max={categories.length}
                            defaultValue={index + 1}
                            key={index + 1}
                            id={`cat-rank-input-${cat.id}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSetCategoryRank(index, (e.target as HTMLInputElement).value);
                              }
                            }}
                            className="w-11 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg px-1 py-1 text-xs focus:outline-none focus:border-indigo-500"
                            title={`Type target rank (1 to ${categories.length}) and press Enter`}
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`cat-rank-input-${cat.id}`) as HTMLInputElement;
                              if (input) handleSetCategoryRank(index, input.value);
                            }}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                            title="Apply target position immediately"
                          >
                            Go
                          </button>
                        </div>

                        {/* Order Products Button */}
                        <button
                          onClick={() => setSelectedCategoryForProductOrder(cat)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                          title={`Organize and order products in ${cat.nameEn}`}
                        >
                          <Package className="w-4 h-4 text-amber-600" />
                          <span>Order Products ({count})</span>
                        </button>

                        {/* Publish Status Toggle */}
                        <button
                          onClick={() => updateCategory(cat.id, { isPublished: !isPublished })}
                          className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isPublished 
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title={isPublished ? 'Click to hide category' : 'Click to publish category'}
                        >
                          {isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditCategory(cat)}
                          className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4f46e5] text-xs font-bold transition-all cursor-pointer"
                          title="Edit Category Details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Mode 1: Grid Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((cat, index) => {
                const count = getProductCountForCategory(cat.id);
                const isPublished = cat.isPublished !== false;
                const isFirst = index === 0;
                const isLast = index === categories.length - 1;

                return (
                  <div 
                    key={cat.id} 
                    className={`bg-white rounded-3xl border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                      !isPublished ? 'opacity-75 border-dashed border-slate-300 bg-slate-50/50' : 'border-slate-200/80 hover:border-indigo-200'
                    }`}
                  >
                    {/* Header Image / Pattern banner */}
                    {cat.bannerUrl && (
                      <div className="h-28 w-full rounded-t-3xl relative overflow-hidden bg-slate-900">
                        <img 
                          src={cat.bannerUrl} 
                          alt={cat.nameEn} 
                          className="w-full h-full object-cover opacity-80"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                        
                        {/* Top quick badges & reordering controls */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-white text-[11px] font-mono font-bold border backdrop-blur-xs ${
                            isFirst ? 'bg-amber-500/90 border-amber-300 ring-2 ring-amber-400/50' : 'bg-black/70 border-white/10'
                          }`}>
                            #{index + 1}
                          </span>

                          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-xs p-1 rounded-xl border border-white/10">
                            {/* Make #1 Button */}
                            <button
                              onClick={() => handleMoveCategory(index, 'top')}
                              disabled={isFirst}
                              title="Instantly jump category to Rank #1 (Top)"
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                isFirst 
                                  ? 'bg-amber-400/30 text-amber-200 opacity-60 cursor-default' 
                                  : 'bg-amber-500 hover:bg-amber-400 text-white shadow-xs'
                              }`}
                            >
                              <Sparkles className="w-3 h-3 fill-current" />
                              <span>{isFirst ? '#1' : 'Make #1'}</span>
                            </button>

                            {/* Step Controls */}
                            <button
                              onClick={() => handleMoveCategory(index, 'up')}
                              disabled={isFirst}
                              title="Move Up 1 spot"
                              className="p-1 rounded-lg text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveCategory(index, 'down')}
                              disabled={isLast}
                              title="Move Down 1 spot"
                              className="p-1 rounded-lg text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Banner bottom title */}
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xs text-xl flex items-center justify-center shadow-xs">
                            {cat.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-white truncate drop-shadow-xs">{cat.nameEn}</h4>
                            <p className="text-[11px] text-amber-300 font-serif font-bold truncate drop-shadow-xs">{cat.nameAr}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Card Body */}
                    <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        {!cat.bannerUrl && (
                          <div className="space-y-2.5 pb-2 border-b border-slate-100">
                            {/* Top ranking bar for cards without banner */}
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold border ${
                                isFirst ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-900 text-white border-slate-800'
                              }`}>
                                #{index + 1}
                              </span>

                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                                <button
                                  onClick={() => handleMoveCategory(index, 'top')}
                                  disabled={isFirst}
                                  title="Instantly jump category to Rank #1"
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                    isFirst 
                                      ? 'bg-amber-200 text-amber-900 opacity-60 cursor-default' 
                                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                                  }`}
                                >
                                  <Sparkles className="w-3 h-3 fill-current" />
                                  <span>{isFirst ? '#1' : 'Make #1'}</span>
                                </button>
                                <button
                                  onClick={() => handleMoveCategory(index, 'up')}
                                  disabled={isFirst}
                                  title="Move Up 1 spot"
                                  className="p-1 rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"
                                >
                                  <MoveUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveCategory(index, 'down')}
                                  disabled={isLast}
                                  title="Move Down 1 spot"
                                  className="p-1 rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-all"
                                >
                                  <MoveDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-2xl flex items-center justify-center shadow-2xs">
                                  {cat.icon}
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 leading-snug">{cat.nameEn}</h4>
                                  <p className="text-xs text-[#c5a059] font-serif font-bold">{cat.nameAr}</p>
                                </div>
                              </div>

                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-[#4f46e5]">
                                {count} {count === 1 ? 'item' : 'items'}
                              </span>
                            </div>
                          </div>
                        )}

                        {cat.bannerUrl && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[11px] text-slate-400">
                              slug: <strong className="text-slate-700">{cat.id}</strong>
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-[#4f46e5]">
                              {count} {count === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {cat.description || 'No description provided.'}
                        </p>

                        {/* Arabic SEO Keywords Chip Section */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059] flex items-center gap-1">
                              <Key className="w-3 h-3" />
                              <span>Arabic SEO Keywords ({cat.arabicKeywords?.length || 0}):</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {cat.arabicKeywords && cat.arabicKeywords.length > 0 ? (
                              cat.arabicKeywords.map((kw, kwIdx) => (
                                <span key={kwIdx} className="px-2 py-0.5 rounded-md bg-amber-50/80 border border-amber-200/60 text-amber-900 text-[10px] font-serif font-bold">
                                  #{kw}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">No Arabic SEO keywords added yet</span>
                            )}
                          </div>
                        </div>

                        {/* Subcategories tags */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Subcategories & Guilds ({cat.subcategories?.length || 0}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {cat.subcategories && cat.subcategories.length > 0 ? (
                              cat.subcategories.map((sub, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium">
                                  {sub}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400">None</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Order Products Button */}
                          <button
                            onClick={() => setSelectedCategoryForProductOrder(cat)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                            title={`Organize and order products in ${cat.nameEn}`}
                          >
                            <Package className="w-3.5 h-3.5 text-amber-600" />
                            <span>Order Products ({count})</span>
                          </button>

                          {/* Quick Make #1 Footer Button */}
                          {!isFirst && (
                            <button
                              onClick={() => handleMoveCategory(index, 'top')}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                              title="Instantly make this category #1 on the store homepage"
                            >
                              <Sparkles className="w-3 h-3 fill-white" />
                              <span>Make #1</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Publish Status Toggle */}
                          <button
                            onClick={() => updateCategory(cat.id, { isPublished: !isPublished })}
                            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isPublished 
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                            title={isPublished ? 'Click to hide category from store' : 'Click to publish category'}
                          >
                            {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditCategory(cat)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4f46e5] text-xs font-bold transition-all cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => {
                              setCategoryToDelete(cat);
                              setReassignTargetCatId(categories.find(c => c.id !== cat.id)?.id || '');
                            }}
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all cursor-pointer"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Lebanon Terroir Regions & Logistics Map */}
      {activeTab === 'regions' && (
        <div className="space-y-4">
          {filteredRegions.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No delivery zones found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery ? `No delivery zones match "${searchQuery}".` : 'No delivery zones currently configured.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRegions.map((reg) => (
                <div key={reg.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between hover:border-amber-200 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-[#c5a059] flex items-center justify-center shadow-2xs">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{reg.nameEn}</h4>
                          <p className="text-xs text-amber-700 font-serif font-bold">{reg.nameAr}</p>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-900 text-white">
                        ${reg.baseDeliveryUSD.toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Major Artisan Villages & Delivery Hubs ({reg.majorCities?.length || 0}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {reg.majorCities && reg.majorCities.map((city, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/60 text-slate-700 text-[11px]">
                            {city}
                          </span>
                        ))}
                      </div>
                    </div>

                    {reg.estimatedTimeEn && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{reg.estimatedTimeEn}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Express Delivery:</span>
                      <span className={`font-bold ${reg.expressAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {reg.expressAvailable ? '✓ Available (Same Day)' : 'Standard (24-48h)'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-slate-400">id: {reg.id}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditRegion(reg)}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Zone</span>
                      </button>
                      <button
                        onClick={() => setRegionToDelete(reg)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-rose-200/60 shadow-2xs active:scale-95"
                        title={`Delete "${reg.nameEn}" delivery zone`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category Create / Edit Modal with full Arabic SEO Keywords */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white max-w-2xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-[#4f46e5] flex items-center justify-center font-bold">
                  {editingCategory ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingCategory ? `Edit Category: ${editingCategory.nameEn}` : 'Create New Store Category'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure names, icons, subcategories, and Arabic search engine keywords.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-5 text-xs">
              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Name (English) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Organic Mouneh & Pantry"
                    value={catForm.nameEn}
                    onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Name (Arabic) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. المونة والأغذية البلدية"
                    value={catForm.nameAr}
                    onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] text-right font-serif text-sm font-bold text-slate-900"
                    dir="rtl"
                  />
                </div>
              </div>

              {/* Icon & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Icon Emoji</label>
                  <input
                    type="text"
                    value={catForm.icon}
                    onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-center text-lg"
                  />
                  {/* Emoji Quick Picker */}
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto p-1 bg-slate-50 rounded-lg border border-slate-200">
                    {EMOJI_SUGGESTIONS.map((em, emIdx) => (
                      <button
                        key={emIdx}
                        type="button"
                        onClick={() => setCatForm({ ...catForm, icon: em })}
                        className="w-6 h-6 rounded hover:bg-white text-xs flex items-center justify-center cursor-pointer transition-all"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Category Slug / Identifier {!editingCategory && <span className="text-slate-400 font-normal">(Leave blank to auto-generate)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. organic-mouneh"
                    value={catForm.id}
                    disabled={!!editingCategory}
                    onChange={(e) => setCatForm({ ...catForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-mono disabled:opacity-60 disabled:bg-slate-100"
                  />
                  {editingCategory && (
                    <p className="text-[10px] text-slate-400 mt-1">Slug is locked during edits to protect existing product links.</p>
                  )}
                </div>
              </div>

              {/* Descriptions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Description (English)</label>
                  <textarea
                    rows={2}
                    placeholder="Brief description for category banners and SEO snippets..."
                    value={catForm.description}
                    onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Description (Arabic)</label>
                  <textarea
                    rows={2}
                    placeholder="وصف مختصر للقسم يظهر في الترويسات ومحركات البحث..."
                    value={catForm.descriptionAr}
                    onChange={(e) => setCatForm({ ...catForm, descriptionAr: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-right font-serif leading-relaxed"
                    dir="rtl"
                  />
                </div>
              </div>

              {/* Banner URL & Live Preview */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Category Banner Image URL</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={catForm.bannerUrl}
                    onChange={(e) => setCatForm({ ...catForm, bannerUrl: e.target.value })}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
                {catForm.bannerUrl && (
                  <div className="mt-2 h-20 w-full rounded-xl overflow-hidden relative border border-slate-200 bg-slate-100">
                    <img 
                      src={catForm.bannerUrl} 
                      alt="Banner Preview" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-1 right-2 px-2 py-0.5 bg-black/60 text-white rounded text-[10px] font-bold">
                      Banner Preview
                    </span>
                  </div>
                )}
              </div>

              {/* SUB-CATEGORIES TAGS MANAGER */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="block font-bold text-slate-800">
                  Subcategories & Product Filter Tags ({catForm.subcategories.length})
                </label>
                <p className="text-[11px] text-slate-500">
                  Type a subcategory name and click "Add" or press Enter.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Olive Oils, Cedar Honey, Artisan Jams..."
                    value={catForm.newSubcatInput}
                    onChange={(e) => setCatForm({ ...catForm, newSubcatInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (catForm.newSubcatInput.trim()) {
                          setCatForm({
                            ...catForm,
                            subcategories: [...catForm.subcategories, catForm.newSubcatInput.trim()],
                            newSubcatInput: ''
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (catForm.newSubcatInput.trim()) {
                        setCatForm({
                          ...catForm,
                          subcategories: [...catForm.subcategories, catForm.newSubcatInput.trim()],
                          newSubcatInput: ''
                        });
                      }
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-black text-white font-bold rounded-xl cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {catForm.subcategories.map((sub, sIdx) => (
                    <span key={sIdx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs">
                      <span>{sub}</span>
                      <button
                        type="button"
                        onClick={() => setCatForm({
                          ...catForm,
                          subcategories: catForm.subcategories.filter((_, i) => i !== sIdx)
                        })}
                        className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* ARABIC SEO KEYWORDS SECTION */}
              <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-bold text-amber-950 flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-[#c5a059]" />
                      <span>الكلمات الدلالية لمحركات البحث بالعربية (Arabic SEO Keywords)</span>
                    </label>
                    <p className="text-[11px] text-amber-800/80 mt-0.5">
                      تساعد محركات البحث وميزة البحث المباشر في المتجر على إظهار القسم والمنتجات المرتبطة به.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-black font-serif">
                    {catForm.arabicKeywords.length} كلمة
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اكتب كلمة مفتاحية واضغط Enter (مثال: مونة بلدية لبنانية)"
                    value={catForm.newArabicKeywordInput}
                    onChange={(e) => setCatForm({ ...catForm, newArabicKeywordInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (catForm.newArabicKeywordInput.trim()) {
                          setCatForm({
                            ...catForm,
                            arabicKeywords: [...catForm.arabicKeywords, catForm.newArabicKeywordInput.trim()],
                            newArabicKeywordInput: ''
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-white rounded-xl border border-amber-200 focus:outline-none text-right font-serif"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (catForm.newArabicKeywordInput.trim()) {
                        setCatForm({
                          ...catForm,
                          arabicKeywords: [...catForm.arabicKeywords, catForm.newArabicKeywordInput.trim()],
                          newArabicKeywordInput: ''
                        });
                      }
                    }}
                    className="px-4 py-2 bg-[#c5a059] hover:bg-[#b08d46] text-white font-bold rounded-xl cursor-pointer font-serif"
                  >
                    إضافة
                  </button>
                </div>

                {/* Quick Suggestion Pills */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    اقتراحات سريعة (انقر للإضافة):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ARABIC_KEYWORD_SUGGESTIONS.map((sug, sugIdx) => {
                      const alreadyAdded = catForm.arabicKeywords.includes(sug);
                      return (
                        <button
                          key={sugIdx}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            if (!alreadyAdded) {
                              setCatForm({
                                ...catForm,
                                arabicKeywords: [...catForm.arabicKeywords, sug]
                              });
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-serif transition-all ${
                            alreadyAdded 
                              ? 'bg-amber-200/50 text-amber-600 cursor-not-allowed opacity-60' 
                              : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer'
                          }`}
                        >
                          + {sug}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Added Arabic Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {catForm.arabicKeywords.map((kw, kIdx) => (
                    <span key={kIdx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 text-amber-950 rounded-lg text-xs font-serif font-bold shadow-2xs">
                      <span>#{kw}</span>
                      <button
                        type="button"
                        onClick={() => setCatForm({
                          ...catForm,
                          arabicKeywords: catForm.arabicKeywords.filter((_, i) => i !== kIdx)
                        })}
                        className="text-amber-400 hover:text-rose-600 cursor-pointer font-bold ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Publish Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="block font-bold text-slate-800">Publish in Store Catalog</span>
                  <span className="text-[11px] text-slate-500">When active, shoppers can browse this category on the web store.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCatForm({ ...catForm, isPublished: !catForm.isPublished })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    catForm.isPublished ? 'bg-[#4f46e5]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      catForm.isPublished ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Submit / Cancel Actions */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleSaveCategory(e, false)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs active:scale-95 transition-all"
                    title="Save category as private draft"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save (Draft)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSaveCategory(e, true)}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs cursor-pointer shadow-md active:scale-95 transition-all"
                    title="Save and publish live to public storefront"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public (Publish Live)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Category Safeguard Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white max-w-md w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete Category "{categoryToDelete.nameEn}"?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                This category currently has <strong className="text-slate-800">{getProductCountForCategory(categoryToDelete.id)}</strong> products linked to it.
              </p>
            </div>

            {getProductCountForCategory(categoryToDelete.id) > 0 && (
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
                <label className="block text-xs font-bold text-amber-900">
                  Reassign existing products to another category:
                </label>
                <select
                  value={reassignTargetCatId}
                  onChange={(e) => setReassignTargetCatId(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs font-semibold focus:outline-none"
                >
                  {categories.filter(c => c.id !== categoryToDelete.id).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn} ({c.nameAr})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Region Add / Edit Modal */}
      {isRegionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white max-w-lg w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingRegion ? `Edit Region: ${editingRegion.nameEn}` : 'Add Regional Delivery Zone'}
              </h3>
              <button 
                onClick={() => setIsRegionModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRegion} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region Name (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mount Lebanon"
                    value={regionForm.nameEn}
                    onChange={(e) => setRegionForm({ ...regionForm, nameEn: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region Name (Arabic)</label>
                  <input
                    type="text"
                    placeholder="e.g. جبل لبنان"
                    value={regionForm.nameAr}
                    onChange={(e) => setRegionForm({ ...regionForm, nameAr: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-right font-serif"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Delivery Rate ($ USD)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={regionForm.baseDeliveryUSD}
                    onChange={(e) => setRegionForm({ ...regionForm, baseDeliveryUSD: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-bold"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regionForm.expressAvailable}
                      onChange={(e) => setRegionForm({ ...regionForm, expressAvailable: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <span className="font-bold text-slate-700">Express Delivery Available</span>
                  </label>
                </div>
              </div>

              {/* Major Cities Tag Manager */}
              <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <label className="block font-bold text-slate-700">Major Cities & Delivery Hubs</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Jounieh, Byblos, Aley..."
                    value={regionForm.newCityInput}
                    onChange={(e) => setRegionForm({ ...regionForm, newCityInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (regionForm.newCityInput.trim()) {
                          setRegionForm({
                            ...regionForm,
                            majorCities: [...regionForm.majorCities, regionForm.newCityInput.trim()],
                            newCityInput: ''
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (regionForm.newCityInput.trim()) {
                        setRegionForm({
                          ...regionForm,
                          majorCities: [...regionForm.majorCities, regionForm.newCityInput.trim()],
                          newCityInput: ''
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 text-white font-bold rounded-xl"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {regionForm.majorCities.map((city, cIdx) => (
                    <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs flex items-center gap-1">
                      <span>{city}</span>
                      <button
                        type="button"
                        onClick={() => setRegionForm({
                          ...regionForm,
                          majorCities: regionForm.majorCities.filter((_, i) => i !== cIdx)
                        })}
                        className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Estimated Delivery Timeline (English)</label>
                <input
                  type="text"
                  placeholder="e.g. Within 2-4 hours across Beirut"
                  value={regionForm.estimatedTimeEn}
                  onChange={(e) => setRegionForm({ ...regionForm, estimatedTimeEn: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                {editingRegion ? (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = editingRegion;
                      setIsRegionModalOpen(false);
                      setRegionToDelete(toDel);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs cursor-pointer border border-rose-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete This Zone</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRegionModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#c5a059] hover:bg-[#b08d46] text-white font-bold text-xs shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    Save Region
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Region Safeguard Modal */}
      {regionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white max-w-md w-full p-6 sm:p-7 rounded-3xl shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete Delivery Zone?
                </h3>
                <p className="text-xs text-slate-500 font-mono">id: {regionToDelete.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl space-y-1.5">
              <div className="font-bold text-xs text-rose-950 flex items-center justify-between">
                <span>{regionToDelete.nameEn}</span>
                <span className="font-serif text-amber-800">{regionToDelete.nameAr}</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                Base Fee: <strong>${regionToDelete.baseDeliveryUSD.toFixed(2)}</strong> • {regionToDelete.majorCities?.length || 0} delivery hubs
              </p>
              <p className="text-[11px] text-slate-600 pt-1">
                Are you sure you want to permanently delete this delivery zone? Shoppers will no longer be able to select it at checkout.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRegionToDelete(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetName = regionToDelete.nameEn;
                  const targetId = regionToDelete.id;
                  try {
                    await deleteRegion(targetId);
                    setRegionToDelete(null);
                    showToast(`Delivery zone "${targetName}" deleted successfully!`, 'success');
                  } catch (err: any) {
                    showToast(err.message || 'Could not delete delivery zone.', 'warning');
                  }
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer active:scale-95 transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Products Order Modal */}
      {selectedCategoryForProductOrder && (
        <CategoryProductsOrderModal
          category={selectedCategoryForProductOrder}
          isOpen={!!selectedCategoryForProductOrder}
          onClose={() => setSelectedCategoryForProductOrder(null)}
        />
      )}
    </div>
  );
};
