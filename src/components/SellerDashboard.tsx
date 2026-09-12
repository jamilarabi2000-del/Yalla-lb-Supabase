import React, { useState, useMemo } from 'react';
import { secureRandomInt } from '../utils/uuid';
import { useShop } from '../context/ShopContext';
import { Product, Order, Seller } from '../types';
import { 
  Store, 
  Package, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowLeft, 
  Save, 
  Eye, 
  User, 
  Smartphone,
  MapPin,
  Globe,
  Settings,
  X,
  PlusCircle,
  FileText
} from 'lucide-react';

export const SellerDashboard: React.FC = () => {
  const { 
    user, 
    products, 
    orders = [], 
    categories, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    updateSeller,
    updateOrderStatus,
    showToast,
    language = 'en',
    t,
    isAdminUser,
    isSellerUser,
    sellerId
  } = useShop();

  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'profile'>('products');
  
  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Product Form state
  const [formName, setFormName] = useState('');
  const [formArabicName, setFormArabicName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPrice, setFormPrice] = useState(0);
  const [formOriginalPrice, setFormOriginalPrice] = useState<number | undefined>(undefined);
  const [formStock, setFormStock] = useState(0);
  const [formImage, setFormImage] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCraftStory, setFormCraftStory] = useState('');
  const [formLowStockThreshold, setFormLowStockThreshold] = useState<number>(5);
  const [formWeightOrVolume, setFormWeightOrVolume] = useState('');
  const [formSellerItemCode, setFormSellerItemCode] = useState('');
  
  // Profile Form state
  const [profileNameAr, setProfileNameAr] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBioEn, setProfileBioEn] = useState('');
  const [profileBioAr, setProfileBioAr] = useState('');
  const [profileVillage, setProfileVillage] = useState('');
  const [profileExactAddress, setProfileExactAddress] = useState('');
  const [profileLogoUrl, setProfileLogoUrl] = useState('');
  const [profileBannerImage, setProfileBannerImage] = useState('');

  // Find Seller object
  const currentSeller = useMemo(() => {
    // If no sellerId is linked, try to find a matching seller by name/email
    if (!sellerId) return null;
    // We can fetch from sellers list or just use default values if not loaded
    return {
      id: sellerId,
      nameEn: user.name || 'Your Workshop',
      nameAr: user.lastName || '',
      logoUrl: user.avatar || '',
      bioEn: '',
      bioAr: '',
      village: user.defaultCity || '',
      exactAddress: user.defaultAddress || '',
      contactPhone: user.phone || ''
    } as Seller;
  }, [sellerId, user]);

  // Load profile inputs from current seller info
  React.useEffect(() => {
    if (currentSeller) {
      setProfileNameAr(currentSeller.nameAr || '');
      setProfilePhone(currentSeller.contactPhone || '');
      setProfileBioEn(currentSeller.bioEn || '');
      setProfileBioAr(currentSeller.bioAr || '');
      setProfileVillage(currentSeller.village || '');
      setProfileExactAddress(currentSeller.exactAddress || '');
      setProfileLogoUrl(currentSeller.logoUrl || '');
      setProfileBannerImage(currentSeller.bannerImage || '');
    }
  }, [currentSeller]);

  // Filter products belonging to this seller
  const sellerProducts = useMemo(() => {
    if (!sellerId) return [];
    return products.filter(p => p.sellerId?.toLowerCase() === sellerId.toLowerCase());
  }, [products, sellerId]);

  // Filter orders containing this seller's products
  const sellerOrders = useMemo(() => {
    if (!sellerId) return [];
    return orders.filter(o => {
      // Direct sellerIds check
      if (o.sellerIds && o.sellerIds.includes(sellerId)) return true;
      // Fallback: search items
      return o.items?.some(item => item.product.sellerId?.toLowerCase() === sellerId.toLowerCase());
    });
  }, [orders, sellerId]);

  // Search/Filter state for products
  const [searchQuery, setSearchQuery] = useState('');
  const filteredProducts = useMemo(() => {
    return sellerProducts.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.arabicName && p.arabicName.includes(searchQuery)) ||
      (p.sellerItemCode && p.sellerItemCode.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [sellerProducts, searchQuery]);

  // Low Stock warnings
  const lowStockProducts = useMemo(() => {
    return sellerProducts.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
  }, [sellerProducts]);

  // Calculate sales summary
  const salesStats = useMemo(() => {
    let totalRevenue = 0;
    let itemsSold = 0;
    sellerOrders.forEach(o => {
      o.items?.forEach(item => {
        if (item.product.sellerId?.toLowerCase() === sellerId?.toLowerCase()) {
          totalRevenue += item.product.priceUSD * item.quantity;
          itemsSold += item.quantity;
        }
      });
    });
    return {
      revenue: totalRevenue,
      units: itemsSold,
      ordersCount: sellerOrders.length
    };
  }, [sellerOrders, sellerId]);

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setFormName('');
    setFormArabicName('');
    setFormCategory(categories[0]?.id || '');
    setFormPrice(0);
    setFormOriginalPrice(undefined);
    setFormStock(10);
    setFormImage('');
    setFormDescription('');
    setFormCraftStory('');
    setFormLowStockThreshold(5);
    setFormWeightOrVolume('');
    setFormSellerItemCode('');
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormArabicName(prod.arabicName || '');
    setFormCategory(prod.category);
    setFormPrice(prod.priceUSD);
    setFormOriginalPrice(prod.originalPriceUSD);
    setFormStock(prod.stock);
    setFormImage(prod.image);
    setFormDescription(prod.description);
    setFormCraftStory(prod.craftStory || '');
    setFormLowStockThreshold(prod.lowStockThreshold ?? 5);
    setFormWeightOrVolume(prod.weightOrVolume || '');
    setFormSellerItemCode(prod.sellerItemCode || '');
    setIsProductModalOpen(true);
  };

  const handleSaveProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerId) return;

    const payload = {
      name: formName,
      arabicName: formArabicName,
      artisan: currentSeller?.nameEn || user.name || 'Local Producer',
      seller: currentSeller?.nameEn || user.name || 'Local Producer',
      sellerId: sellerId,
      category: formCategory,
      priceUSD: formPrice,
      originalPriceUSD: formOriginalPrice,
      stock: formStock,
      image: formImage || 'https://images.unsplash.com/photo-1541256996761-85df2effaa16?auto=format&fit=crop&w=400&q=80',
      description: formDescription,
      craftStory: formCraftStory,
      lowStockThreshold: formLowStockThreshold,
      weightOrVolume: formWeightOrVolume,
      sellerItemCode: formSellerItemCode || `SLR-PROD-${secureRandomInt(100, 1000)}`,
      origin: currentSeller?.village || 'Lebanon',
      rating: editingProduct?.rating ?? 5,
      reviewsCount: editingProduct?.reviewsCount ?? 0,
      isPublished: editingProduct?.isPublished ?? true,
      tags: editingProduct?.tags ?? ['Terroir', 'Local'],
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        showToast('Product updated successfully!', 'success');
      } else {
        await addProduct(payload);
        showToast('New product added to your catalog!', 'success');
      }
      setIsProductModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save product.', 'warning');
    }
  };

  const handleDeleteProductClick = async (prodId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(prodId);
        showToast('Product removed from catalog.', 'success');
      } catch (err: any) {
        showToast(err.message || 'Failed to delete product.', 'warning');
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerId) return;

    try {
      await updateSeller(sellerId, {
        nameAr: profileNameAr,
        contactPhone: profilePhone,
        bioEn: profileBioEn,
        bioAr: profileBioAr,
        village: profileVillage,
        exactAddress: profileExactAddress,
        logoUrl: profileLogoUrl,
        bannerImage: profileBannerImage
      });
      showToast('Seller profile saved and updated in real-time!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile.', 'warning');
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      showToast(`Order status updated to "${newStatus.toUpperCase()}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status.', 'warning');
    }
  };

  if (!isAdminUser && (!isSellerUser || !sellerId)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center text-slate-800">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {language === 'ar' ? 'يتطلب الوصول حساب بائع معتمد' : 'Artisan Account Required'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {language === 'ar'
              ? 'يرجى تسجيل الدخول باستخدام حساب البائع المعتمد للوصول إلى لوحة التحكم الخاصة بالحرفيين.'
              : 'Please sign in with your verified artisan merchant account to access this workshop dashboard.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-800">
      
      {/* Seller Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
            {profileLogoUrl ? (
              <img src={profileLogoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Store className="w-8 h-8 text-slate-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950">{currentSeller?.nameEn || 'Your Supplier Portal'}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-700 tracking-wide uppercase">
                {sellerId}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>{profileVillage || 'Lebanon'} • {profileExactAddress || 'Authentic Producer'}</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'products' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Products</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'orders' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Orders ({sellerOrders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'profile' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Products</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-950 mt-3">{sellerProducts.length}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Low Stock Alerts</span>
            <div className={`p-2 rounded-xl ${lowStockProducts.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black mt-3 ${lowStockProducts.length > 0 ? 'text-amber-600' : 'text-slate-950'}`}>
            {lowStockProducts.length}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Sales (USD)</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-3">${salesStats.revenue.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Units Dispatched</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-950 mt-3">{salesStats.units} units</p>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        
        {/* TAB 1: PRODUCTS CATALOG */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="w-full sm:max-w-md relative">
                <input
                  type="text"
                  placeholder="Search your products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              </div>
              <button
                onClick={handleOpenAddProduct}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            </div>

            {/* Products Grid */}
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(prod => (
                  <div key={prod.id} className="border border-slate-100 rounded-2xl p-4 space-y-4 hover:border-slate-200 hover:shadow-xs transition-all flex flex-col justify-between">
                    <div>
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2">
                        <img src={prod.image} alt={prod.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        {prod.stock <= (prod.lowStockThreshold ?? 5) && (
                          <span className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-sm">
                            Low Stock
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{prod.category}</span>
                        <h3 className="text-sm font-black text-slate-900 mt-1 truncate" title={prod.name}>{prod.name}</h3>
                        {prod.arabicName && <p className="text-xs font-semibold text-slate-500 truncate mt-0.5 text-right font-serif" dir="rtl">{prod.arabicName}</p>}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Price & Stock</p>
                        <p className="text-sm font-black text-slate-900 mt-0.5">
                          ${prod.priceUSD.toFixed(2)}
                          <span className="text-xs text-slate-500 font-semibold ml-2">({prod.stock} left)</span>
                        </p>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenEditProduct(prod)}
                          className="p-2 text-slate-500 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer"
                          title="Edit Product"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProductClick(prod.id)}
                          className="p-2 text-rose-500 hover:bg-rose-50 border border-rose-100 hover:border-rose-200 rounded-xl transition-all cursor-pointer"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-black text-slate-700">No products found</h4>
                <p className="text-xs text-slate-400 mt-1">Get started by creating your first terroir craft product.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SELLER ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900">Your Store Orders</h3>
              <p className="text-xs text-slate-500 mt-0.5">Track shipping statuses, see client details, and coordinate local dispatches.</p>
            </div>

            {sellerOrders.length > 0 ? (
              <div className="space-y-4">
                {sellerOrders.map(order => {
                  // Filter items that belong to this seller
                  const orderItems = order.items?.filter(item => item.product.sellerId?.toLowerCase() === sellerId?.toLowerCase()) || [];
                  const totalStoreEarnings = orderItems.reduce((sum, item) => sum + item.product.priceUSD * item.quantity, 0);

                  return (
                    <div key={order.id} className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white hover:shadow-xs transition-all">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">Order #{order.id.slice(0, 8).toUpperCase()}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              order.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700'
                                : order.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">Placed on: {new Date(order.date).toLocaleDateString()}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Your earnings:</span>
                          <span className="text-sm font-black text-emerald-600">${totalStoreEarnings.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Items from this supplier */}
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ordered Products</p>
                        {orderItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg border bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                <img src={item.product.image} alt={item.product.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{item.product.name}</p>
                                <p className="text-[10px] text-slate-500">Qty: {item.quantity} • Unit Price: ${item.product.priceUSD.toFixed(2)}</p>
                              </div>
                            </div>
                            <span className="font-bold text-slate-900">${(item.product.priceUSD * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Dispatch Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
                        <div className="text-xs space-y-1">
                          <p className="font-bold text-slate-800 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>Ship To: {order.shipping?.firstName} {order.shipping?.lastName}</span>
                          </p>
                          <p className="text-slate-500 flex items-center gap-1">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                            <span>WhatsApp: {order.shipping?.phone}</span>
                          </p>
                          <p className="text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>Destination: {order.shipping?.village || order.shipping?.city}, {order.shipping?.governorate}</span>
                          </p>
                        </div>

                        {/* Status dropdown */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-500">Dispatch Status:</label>
                          <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                          >
                            <option value="pending">Pending Crafting</option>
                            <option value="processing">In Production / Preparing</option>
                            <option value="shipped">Handed to Courier</option>
                            <option value="completed">Delivered Successfully</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-black text-slate-700">No orders yet</h4>
                <p className="text-xs text-slate-400 mt-1">Orders placed by customers for your items will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROFILE MANAGEMENT */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900">Manage Supplier Workshop Profile</h3>
              <p className="text-xs text-slate-500 mt-0.5">Update your brand bio, workshop location, and contact coordinates for live listings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Arabic Workshop Name</label>
                  <input
                    type="text"
                    value={profileNameAr}
                    onChange={(e) => setProfileNameAr(e.target.value)}
                    placeholder="e.g. صابون الشوف البيئي"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 text-right"
                    dir="rtl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Phone (B2B Coordination) *</label>
                  <input
                    type="text"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="e.g. +961 3 123 456"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Logo URL</label>
                  <input
                    type="text"
                    value={profileLogoUrl}
                    onChange={(e) => setProfileLogoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Banner Image URL</label>
                  <input
                    type="text"
                    value={profileBannerImage}
                    onChange={(e) => setProfileBannerImage(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Village / Town *</label>
                  <input
                    type="text"
                    required
                    value={profileVillage}
                    onChange={(e) => setProfileVillage(e.target.value)}
                    placeholder="e.g. Deir El Qamar"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exact Address</label>
                  <input
                    type="text"
                    value={profileExactAddress}
                    onChange={(e) => setProfileExactAddress(e.target.value)}
                    placeholder="e.g. Main Street, Cooperatives Building"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">English Bio / Craft Story</label>
                  <textarea
                    value={profileBioEn}
                    onChange={(e) => setProfileBioEn(e.target.value)}
                    rows={4}
                    placeholder="Share your workshop story, crafting methods, and heritage..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Arabic Bio / Craft Story</label>
                  <textarea
                    value={profileBioAr}
                    onChange={(e) => setProfileBioAr(e.target.value)}
                    rows={4}
                    placeholder="قصة ورشتكم وعراقة إنتاجكم باللغة العربية..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none text-right font-serif"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Profile Updates</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950">
                {editingProduct ? 'Edit Product Details' : 'Add New Terroir Product'}
              </h3>
              <button 
                onClick={() => setIsProductModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Name (English) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Traditional Olive Oil Soap"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Name (Arabic)</label>
                  <input
                    type="text"
                    value={formArabicName}
                    onChange={(e) => setFormArabicName(e.target.value)}
                    placeholder="e.g. صابون الغار والزيت التقليدي"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 text-right"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nameEn}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supplier / Item SKU Code</label>
                  <input
                    type="text"
                    value={formSellerItemCode}
                    onChange={(e) => setFormSellerItemCode(e.target.value)}
                    placeholder="e.g. MYS-SOAP-01"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Price (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(parseFloat(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Original Price (USD for Strikeout)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formOriginalPrice || ''}
                    onChange={(e) => setFormOriginalPrice(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Weight / Volume (e.g. 250g, 1L)</label>
                  <input
                    type="text"
                    value={formWeightOrVolume}
                    onChange={(e) => setFormWeightOrVolume(e.target.value)}
                    placeholder="e.g. 500g"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Low Stock Warning Threshold</label>
                  <input
                    type="number"
                    value={formLowStockThreshold}
                    onChange={(e) => setFormLowStockThreshold(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Main Image URL *</label>
                <input
                  type="text"
                  required
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  placeholder="Enter detailed ingredients, terroir attributes, or specifications..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Heritage Craft Story (Bilingual Content)</label>
                <textarea
                  value={formCraftStory}
                  onChange={(e) => setFormCraftStory(e.target.value)}
                  rows={3}
                  placeholder="Share the authentic story behind this workshop masterpiece..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                >
                  {editingProduct ? 'Save Product Changes' : 'Publish Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
