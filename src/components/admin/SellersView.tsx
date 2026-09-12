import React, { useState, useRef, useEffect } from 'react';
import { sanitizeRowForCsv } from '../../utils/csvSafe';
import { useShop } from '../../context/ShopContext';
import { Seller, Product, SellerApplication } from '../../types';
import { 
  Store, 
  Plus, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Edit3, 
  Trash2, 
  Power, 
  FileText,
  Search,
  Check,
  FileSpreadsheet,
  MessageSquare,
  Phone,
  Mail,
  ExternalLink,
  Clock,
  Sparkles,
  UserCheck,
  UserX,
  Copy,
  Send,
  Share2,
  Key,
  RefreshCw,
  AlertCircle,
  Filter,
  Eye
} from 'lucide-react';
import { 
  downloadFullMasterReport, 
  downloadSellerPerformanceReport 
} from '../../utils/exportMasterReport';
import { safeHref } from '../../lib/safeUrl';
import { resolveSeller, resolveCategory, parsePrice, parseStock, isCsvRowEmpty } from '../../utils/importerResolvers';
import { checkDuplicateSellerItemCode } from '../../lib/productValidation';
import { normalizeLebanesePhone, isValidLebanesePhone } from '../../utils/phoneUtils';
import { generateSecurePassword } from '../../lib/passwordPolicy';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getAuth as getSecondaryAuth, 
  createUserWithEmailAndPassword as createSecondaryUser,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, deleteDoc, collection, onSnapshot, updateDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth, firebaseConfig } from '../../firebase';

const buildSellerWelcomeNotification = (data: {
  sellerName: string;
  contactName?: string;
  email: string;
  phone: string;
  tempPassword?: string;
}) => {
  const portalUrl = window.location.origin;
  const norm = normalizeLebanesePhone(data.phone);
  const waPhone = norm.cleanDigits ? `961${norm.cleanDigits}` : data.phone.replace(/[^0-9]/g, '');
  
  const arText = `أهلاً وسهلاً ${data.contactName || data.sellerName}،
مبروك! تم اعتماد وتفعيل حساب متجركم / شركتكم "${data.sellerName}" على منصة يلا لبنان (Yalla.lb).

تم إرسال رابط آمن إلى بريدك الإلكتروني لإعداد كلمة المرور الخاصة بك. يرجى مراجعة بريدك الإلكتروني.

بيانات تسجيل الدخول لبوابة البائعين:
- البريد الإلكتروني: ${data.email}
- رقم الهاتف المسجل: ${data.phone}

رابط الدخول للبوابة:
${portalUrl}

نتمنى لكم دوام التوفيق والازدهار في تسويق منتجاتكم على منصة يلا!
إدارة منصة يلا لبنان`;

  const enText = `Hello ${data.contactName || data.sellerName},
Congratulations! Your seller company account "${data.sellerName}" has been approved and activated on Yalla Lebanon (Yalla.lb).

A secure password setup link has been sent to your email address. Please check your inbox.

Seller Portal Credentials:
- Email: ${data.email}
- Registered Phone: ${data.phone}

Login Portal:
${portalUrl}

Welcome to the Lebanese Seller Collective!
Yalla Lebanon Team`;

  const fullText = `${arText}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${enText}`;
  const whatsappLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(fullText)}`;
  const mailtoLink = `mailto:${data.email}?subject=${encodeURIComponent(`Welcome to Yalla Lebanon Seller Portal - ${data.sellerName}`)}&body=${encodeURIComponent(fullText)}`;
  const smsLink = `sms:+961${norm.cleanDigits || ''}?body=${encodeURIComponent(fullText)}`;

  return { whatsappLink, mailtoLink, smsLink, fullText, arText, enText, waPhone };
};

const buildSellerRejectionNotification = (data: {
  sellerName: string;
  contactName?: string;
  email: string;
  phone: string;
  rejectionReason?: string;
}) => {
  const norm = normalizeLebanesePhone(data.phone);
  const waPhone = norm.cleanDigits ? `961${norm.cleanDigits}` : data.phone.replace(/[^0-9]/g, '');
  const reasonText = data.rejectionReason?.trim()
    ? `ملاحظات الإدارة: ${data.rejectionReason.trim()}`
    : 'نعتذر عن عدم قبول الطلب في الوقت الحالي لعدم اكتمال المتطلبات والشروط.';

  const fullText = `أهلاً وسهلاً ${data.contactName || data.sellerName}،
تحية طيبة من فريق منصة يلا لبنان (Yalla.lb).

بخصوص طلب تسجيل البائع "${data.sellerName}":
${reasonText}

نشكر اهتمامكم، ويمكنكم إعادة التواصل معنا عند استيفاء المتطلبات.
فريق يلا لبنان`;

  const whatsappLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(fullText)}`;
  const mailtoLink = `mailto:${data.email}?subject=${encodeURIComponent(`Yalla Lebanon Seller Application Status - ${data.sellerName}`)}&body=${encodeURIComponent(fullText)}`;
  const smsLink = `sms:+961${norm.cleanDigits || ''}?body=${encodeURIComponent(fullText)}`;

  return { whatsappLink, mailtoLink, smsLink, fullText, waPhone };
};

const LEBANON_GOVERNORATES_DATA: Record<string, { nameEn: string; districts: string[] }> = {
  akkar: {
    nameEn: 'Akkar Governorate',
    districts: ['Akkar']
  },
  baalbek_hermel: {
    nameEn: 'Baalbek-Hermel Governorate',
    districts: ['Baalbek', 'Hermel']
  },
  beirut: {
    nameEn: 'Beirut Governorate',
    districts: ['Beirut City']
  },
  bekaa: {
    nameEn: 'Beqaa Governorate',
    districts: ['Zahlé', 'Western Beqaa', 'Rashaya']
  },
  keserwan_jbeil: {
    nameEn: 'Keserwan-Jbeil Governorate',
    districts: ['Keserwan', 'Byblos (Jbeil)']
  },
  mount_lebanon: {
    nameEn: 'Mount Lebanon Governorate',
    districts: ['Baabda', 'Aley', 'Chouf', 'Matn (Metn)']
  },
  nabatieh: {
    nameEn: 'Nabatieh Governorate',
    districts: ['Nabatieh', 'Bint Jbeil', 'Marjeyoun', 'Hasbaya']
  },
  north: {
    nameEn: 'North Governorate',
    districts: ['Tripoli', 'Batroun', 'Bsharri', 'Koura', 'Miniyeh-Danniyeh', 'Zgharta', 'Akkar']
  },
  south: {
    nameEn: 'South Governorate',
    districts: ['Sidon (Saida)', 'Tyre', 'Jezzine']
  }
};

const isProductLinkedToSeller = (p: Product, seller: Seller) => {
  if (p.sellerId && seller.id && p.sellerId.toLowerCase() === seller.id.toLowerCase()) return true;
  const pSeller = (p.seller || p.artisan || '').trim().toLowerCase();
  const sName = seller.nameEn.trim().toLowerCase();
  if (pSeller && sName && pSeller === sName) return true;
  return false;
};

export const SellersView: React.FC = () => {
  const { isAdminUser, sellers, addSeller, updateSeller, toggleSellerActive, deleteSeller, bulkImportProducts, products, orders = [], categories, showToast } = useShop();

  const [activeSubTab, setActiveSubTab] = useState<'sellers' | 'applications' | 'import'>('sellers');
  const [searchQuery, setSearchQuery] = useState('');
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);

  // Applications state
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [appStatusFilter, setAppStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [appSearchQuery, setAppSearchQuery] = useState('');
  
  // Realtime subscribe to seller_applications
  useEffect(() => {
    if (!isAdminUser) return;
    const appsCol = query(
      collection(db, 'seller_applications'),
      orderBy('submittedAt', 'desc'),
      limit(300)
    );
    const unsub = onSnapshot(appsCol, (snapshot) => {
      const list: SellerApplication[] = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      }));
      list.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      setApplications(list);
    }, (err) => {
      console.warn('[SellersView] Failed to subscribe to seller_applications:', err);
    });
    return () => unsub();
  }, []);

  const pendingAppsCount = applications.filter(a => a.status === 'pending').length;

  // Form state
  const [formSellerCode, setFormSellerCode] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formGovernorate, setFormGovernorate] = useState('mount_lebanon');
  const [formDistrict, setFormDistrict] = useState('Chouf');
  const [formVillage, setFormVillage] = useState('');
  const [formExactAddress, setFormExactAddress] = useState('');
  const [formRegion, setFormRegion] = useState('mount_lebanon');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const handleGovernorateChange = (gov: string) => {
    setFormGovernorate(gov);
    setFormRegion(gov);
    const districts = LEBANON_GOVERNORATES_DATA[gov]?.districts || [];
    setFormDistrict(districts[0] || '');
  };

  // Delete reassign state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  // CSV Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [rawImportRows, setRawImportRows] = useState<any[]>([]);
  const [targetSellerId, setTargetSellerId] = useState<string>('auto');
  const [fallbackCategoryId, setFallbackCategoryId] = useState<string>('auto');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account management state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountTargetSeller, setAccountTargetSeller] = useState<Seller | null>(null);
  const [accountEmailInput, setAccountEmailInput] = useState('');
  const [accountPhoneInput, setAccountPhoneInput] = useState('');
  const [accountPasswordInput, setAccountPasswordInput] = useState('');
  const [isAccountActionLoading, setIsAccountActionLoading] = useState(false);

  // Approval Modal State
  const [selectedAppForApproval, setSelectedAppForApproval] = useState<SellerApplication | null>(null);
  const [approveSellerCode, setApproveSellerCode] = useState('');
  const [approveWorkshopName, setApproveWorkshopName] = useState('');
  const [approveWorkshopNameAr, setApproveWorkshopNameAr] = useState('');
  const [approveGovernorate, setApproveGovernorate] = useState('mount_lebanon');
  const [approveDistrict, setApproveDistrict] = useState('Chouf');
  const [approveVillage, setApproveVillage] = useState('');
  const [approveEmail, setApproveEmail] = useState('');
  const [approvePhone, setApprovePhone] = useState('');
  const [approvePassword, setApprovePassword] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Rejection Modal State
  const [selectedAppForRejection, setSelectedAppForRejection] = useState<SellerApplication | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Unified Notification Dispatch Modal State
  const [notificationModalData, setNotificationModalData] = useState<{
    isOpen: boolean;
    type: 'approved' | 'created' | 'rejected';
    sellerName: string;
    contactName?: string;
    email: string;
    phone: string;
    tempPassword?: string;
    rejectionReason?: string;
  } | null>(null);

  const [copiedNotificationText, setCopiedNotificationText] = useState(false);

  const handleOpenAccountModal = (seller: Seller) => {
    setAccountTargetSeller(seller);
    setAccountEmailInput(seller.accountEmail || seller.contactEmail || '');
    setAccountPhoneInput(seller.contactPhone || '');
    setAccountPasswordInput('');
    setIsAccountModalOpen(true);
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountTargetSeller) return;
    if (!accountEmailInput.trim()) {
      showToast('Please enter an email address for this seller.', 'warning');
      return;
    }
    if (!accountPhoneInput.trim()) {
      showToast('Please enter a mobile phone number for this seller.', 'warning');
      return;
    }
    if (accountPasswordInput.length < 6) {
      showToast('Password must be at least 6 characters.', 'warning');
      return;
    }
    setIsAccountActionLoading(true);
    
    const tempAppName = `TempApp_${accountTargetSeller.id}_${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getSecondaryAuth(tempApp);

    try {
      const userCredential = await createSecondaryUser(tempAuth, accountEmailInput.trim(), accountPasswordInput);
      const uid = userCredential.user.uid;
      const normPhone = normalizeLebanesePhone(accountPhoneInput.trim());
      const formattedPhone = normPhone.isValid ? normPhone.formatted : accountPhoneInput.trim();

      // Create Profile in /users/{uid}
      const userProfileRef = doc(db, 'users', uid);
      await setDoc(userProfileRef, {
        uid,
        name: accountTargetSeller.nameEn,
        firstName: accountTargetSeller.nameEn.split(' ')[0] || accountTargetSeller.nameEn,
        lastName: accountTargetSeller.nameEn.split(' ').slice(1).join(' ') || '',
        email: accountEmailInput.trim(),
        phone: formattedPhone,
        avatar: accountTargetSeller.logoUrl || '',
        defaultGovernorate: accountTargetSeller.governorate || '',
        defaultCity: accountTargetSeller.village || '',
        defaultAddress: accountTargetSeller.exactAddress || '',
        role: 'seller',
        sellerId: accountTargetSeller.id,
        createdAt: new Date().toISOString()
      });

      // Update Seller document
      await updateSeller(accountTargetSeller.id, {
        hasAccount: true,
        accountEmail: accountEmailInput.trim(),
        contactPhone: formattedPhone,
        accountUid: uid
      });

      try {
        await sendPasswordResetEmail(auth, accountEmailInput.trim().toLowerCase());
      } catch (pwErr) {
        console.warn('Failed to send password reset email automatically:', pwErr);
      }

      showToast(`Successfully created login account for "${accountTargetSeller.nameEn}"!`, 'success');
      setIsAccountModalOpen(false);

      // Open instant WhatsApp & Email Notification Dispatch Modal
      setNotificationModalData({
        isOpen: true,
        type: 'created',
        sellerName: accountTargetSeller.nameEn,
        contactName: accountTargetSeller.nameEn,
        email: accountEmailInput.trim(),
        phone: formattedPhone
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to create seller login account.', 'warning');
    } finally {
      setIsAccountActionLoading(false);
      try {
        await deleteApp(tempApp);
      } catch {}
    }
  };

  const handleOpenApproveModal = (app: SellerApplication) => {
    setSelectedAppForApproval(app);
    setApproveSellerCode(`SLR-${sellers.length + 101}`);
    const company = app.sellerCompany || app.workshopName || '';
    setApproveWorkshopName(company);
    setApproveWorkshopNameAr(app.workshopNameAr || company);
    const defaultGov = app.governorate || 'mount_lebanon';
    setApproveGovernorate(defaultGov);
    const dists = LEBANON_GOVERNORATES_DATA[defaultGov]?.districts || ['Chouf'];
    setApproveDistrict(dists[0] || 'Chouf');
    setApproveVillage(app.village || '');
    setApproveEmail(app.email || '');
    setApprovePhone(app.phone || '');
    setApprovePassword(generateSecurePassword(12));
  };

  const handleConfirmApprovalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForApproval) return;
    if (!approveEmail.trim() || !approvePhone.trim() || approvePassword.length < 6) {
      showToast('Please fill all required fields (Password min 6 characters).', 'warning');
      return;
    }
    setIsApproving(true);
    const tempAppName = `TempApp_Approve_${selectedAppForApproval.id}_${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getSecondaryAuth(tempApp);

    try {
      const userCredential = await createSecondaryUser(tempAuth, approveEmail.trim(), approvePassword);
      const uid = userCredential.user.uid;
      const normPhone = normalizeLebanesePhone(approvePhone.trim());
      const formattedPhone = normPhone.isValid ? normPhone.formatted : approvePhone.trim();

      const newSellerId = `seller-${Date.now()}`;
      await addSeller({
        id: newSellerId,
        sellerCode: approveSellerCode.trim() || undefined,
        nameEn: approveWorkshopName.trim(),
        nameAr: approveWorkshopNameAr.trim() || approveWorkshopName.trim(),
        governorate: approveGovernorate,
        district: approveDistrict,
        village: approveVillage.trim(),
        region: approveGovernorate,
        contactPhone: formattedPhone,
        contactEmail: approveEmail.trim().toLowerCase(),
        accountEmail: approveEmail.trim().toLowerCase(),
        accountUid: uid,
        hasAccount: true,
        isActive: true,
        bioEn: selectedAppForApproval.bio || '',
        craftCategory: selectedAppForApproval.craftCategory || ''
      });

      const applicantFullName = `${selectedAppForApproval.firstName || ''} ${selectedAppForApproval.middleName || ''} ${selectedAppForApproval.lastName || ''}`.trim() || selectedAppForApproval.contactName || approveWorkshopName.trim();

      const userProfileRef = doc(db, 'users', uid);
      await setDoc(userProfileRef, {
        uid,
        name: approveWorkshopName.trim(),
        firstName: selectedAppForApproval.firstName || applicantFullName.split(' ')[0] || approveWorkshopName.trim(),
        lastName: selectedAppForApproval.lastName || applicantFullName.split(' ').slice(1).join(' ') || '',
        email: approveEmail.trim().toLowerCase(),
        phone: formattedPhone,
        role: 'seller',
        sellerId: newSellerId,
        defaultGovernorate: approveGovernorate,
        defaultCity: approveVillage.trim(),
        createdAt: new Date().toISOString()
      });

      const appRef = doc(db, 'seller_applications', selectedAppForApproval.id);
      await updateDoc(appRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        createdSellerId: newSellerId
      });

      try {
        await sendPasswordResetEmail(auth, approveEmail.trim().toLowerCase());
      } catch (pwErr) {
        console.warn('Failed to send password reset email automatically:', pwErr);
      }

      showToast(`Approved "${approveWorkshopName}" and provisioned seller portal access!`, 'success');

      setNotificationModalData({
        isOpen: true,
        type: 'approved',
        sellerName: approveWorkshopName.trim(),
        contactName: applicantFullName,
        email: approveEmail.trim().toLowerCase(),
        phone: formattedPhone
      });

      setSelectedAppForApproval(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve seller application', 'warning');
    } finally {
      setIsApproving(false);
      try {
        await deleteApp(tempApp);
      } catch {}
    }
  };

  const handleOpenRejectModal = (app: SellerApplication) => {
    setSelectedAppForRejection(app);
    setRejectionReasonInput('');
  };

  const handleConfirmRejectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForRejection) return;
    setIsRejecting(true);
    try {
      const appRef = doc(db, 'seller_applications', selectedAppForRejection.id);
      await updateDoc(appRef, {
        status: 'rejected',
        rejectionReason: rejectionReasonInput.trim(),
        reviewedAt: new Date().toISOString()
      });

      showToast(`Application for "${selectedAppForRejection.sellerCompany || selectedAppForRejection.workshopName || 'Seller'}" marked as rejected.`, 'info');

      const appCompanyName = selectedAppForRejection.sellerCompany || selectedAppForRejection.workshopName || 'Seller';
      const appContactName = `${selectedAppForRejection.firstName || ''} ${selectedAppForRejection.middleName || ''} ${selectedAppForRejection.lastName || ''}`.trim() || selectedAppForRejection.contactName || appCompanyName;

      setNotificationModalData({
        isOpen: true,
        type: 'rejected',
        sellerName: appCompanyName,
        contactName: appContactName,
        email: selectedAppForRejection.email,
        phone: selectedAppForRejection.phone,
        rejectionReason: rejectionReasonInput.trim()
      });

      setSelectedAppForRejection(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to update application status', 'warning');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    try {
      if (!email) return;
      const target = email.trim().toLowerCase();
      const isRegistered = sellers.some(s => 
        (s.accountEmail && s.accountEmail.toLowerCase() === target) ||
        ((s as any).email && (s as any).email.toLowerCase() === target)
      );

      if (!isRegistered) {
        showToast(`The email ${target} is not registered in the database as an authorized seller.`, 'error');
        return;
      }

      await sendPasswordResetEmail(auth, target);
      showToast(`A secure password reset link has been dispatched to ${target}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send password reset email.', 'warning');
    }
  };

  const handleDeleteAccountConfirm = async (seller: Seller) => {
    if (!seller.accountUid) return;
    if (window.confirm(`Are you sure you want to revoke account access for "${seller.nameEn}"? They will no longer be able to log in to their dashboard.`)) {
      try {
        // Delete Profile in /users/{uid}
        const userProfileRef = doc(db, 'users', seller.accountUid);
        await deleteDoc(userProfileRef);

        // Update Seller document
        await updateSeller(seller.id, {
          hasAccount: false,
          accountEmail: '',
          accountUid: ''
        });

        showToast(`Revoked access credentials for "${seller.nameEn}".`, 'success');
      } catch (err: any) {
        showToast(err.message || 'Failed to revoke account.', 'warning');
      }
    }
  };

  const filteredSellers = sellers.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    const linkedProducts = products.filter(p => isProductLinkedToSeller(p, s));
    const matchesInfo = s.nameEn.toLowerCase().includes(q) ||
      (s.nameAr && s.nameAr.includes(q)) ||
      s.id.toLowerCase().includes(q) ||
      (s.sellerCode && s.sellerCode.toLowerCase().includes(q)) ||
      (s.contactEmail && s.contactEmail.toLowerCase().includes(q)) ||
      (s.accountEmail && s.accountEmail.toLowerCase().includes(q)) ||
      (s.contactPhone && s.contactPhone.toLowerCase().includes(q));

    const matchesProduct = linkedProducts.some(p =>
      (p.sellerItemCode && p.sellerItemCode.toLowerCase().includes(q)) ||
      p.id.toLowerCase().includes(q) ||
      (p.name && p.name.toLowerCase().includes(q))
    );

    const matchesSearch = !q || matchesInfo || matchesProduct;

    if (sellerStatusFilter === 'active') return matchesSearch && s.isActive;
    if (sellerStatusFilter === 'inactive') return matchesSearch && !s.isActive;
    return matchesSearch;
  });

  const filteredApplications = applications.filter(app => {
    const q = appSearchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      app.workshopName?.toLowerCase().includes(q) ||
      (app.workshopNameAr && app.workshopNameAr.includes(q)) ||
      app.contactName?.toLowerCase().includes(q) ||
      app.email?.toLowerCase().includes(q) ||
      app.phone?.toLowerCase().includes(q) ||
      app.village?.toLowerCase().includes(q);

    if (appStatusFilter === 'all') return matchesSearch;
    return matchesSearch && app.status === appStatusFilter;
  });

  const handleOpenAdd = () => {
    setEditingSeller(null);
    const nextCodeNum = sellers.length + 101;
    setFormSellerCode(`SLR-${nextCodeNum}`);
    setFormNameEn('');
    setFormNameAr('');
    setFormGovernorate('mount_lebanon');
    setFormDistrict('Chouf');
    setFormVillage('');
    setFormExactAddress('');
    setFormRegion('mount_lebanon');
    setFormPhone('');
    setFormEmail('');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const resolveGovernorateAndDistrict = (seller: Seller) => {
    if (seller.governorate && LEBANON_GOVERNORATES_DATA[seller.governorate]) {
      return {
        governorate: seller.governorate,
        district: seller.district || LEBANON_GOVERNORATES_DATA[seller.governorate].districts[0]
      };
    }
    const reg = (seller.region || '').toLowerCase();
    if (reg.includes('beirut')) return { governorate: 'beirut', district: 'Beirut City' };
    if (reg.includes('koura') || reg.includes('batroun') || reg.includes('tripoli') || reg.includes('bsharre') || reg.includes('zgharta')) {
      return { governorate: 'north', district: seller.district || 'Tripoli' };
    }
    if (reg.includes('akkar')) {
      return { governorate: 'akkar', district: 'Akkar' };
    }
    if (reg.includes('chouf') || reg.includes('mount') || reg.includes('baskinta') || reg.includes('baabda') || reg.includes('aley') || reg.includes('matn') || reg.includes('metn')) {
      return { governorate: 'mount_lebanon', district: reg.includes('chouf') ? 'Chouf' : reg.includes('aley') ? 'Aley' : reg.includes('baabda') ? 'Baabda' : 'Matn (Metn)' };
    }
    if (reg.includes('kesrouan') || reg.includes('byblos') || reg.includes('jbeil')) {
      return { governorate: 'keserwan_jbeil', district: reg.includes('byblos') || reg.includes('jbeil') ? 'Byblos (Jbeil)' : 'Keserwan' };
    }
    if (reg.includes('zahle') || reg.includes('bekaa') || reg.includes('rashaya')) {
      return { governorate: 'bekaa', district: reg.includes('zahle') ? 'Zahlé' : 'Rashaya' };
    }
    if (reg.includes('sidon') || reg.includes('tyre') || reg.includes('sarafand') || reg.includes('jezzine') || reg.includes('south')) {
      return { governorate: 'south', district: reg.includes('tyre') ? 'Tyre' : reg.includes('jezzine') ? 'Jezzine' : 'Sidon (Saida)' };
    }
    if (reg.includes('nabatieh') || reg.includes('bint') || reg.includes('marjeyoun') || reg.includes('hasbaya')) {
      return { governorate: 'nabatieh', district: 'Nabatieh' };
    }
    if (reg.includes('baalbek') || reg.includes('hermel')) {
      return { governorate: 'baalbek_hermel', district: reg.includes('hermel') ? 'Hermel' : 'Baalbek' };
    }
    return { governorate: 'mount_lebanon', district: 'Chouf' };
  };

  const handleOpenEdit = (s: Seller) => {
    setEditingSeller(s);
    setFormSellerCode(s.sellerCode || 'SLR-101');
    setFormNameEn(s.nameEn);
    setFormNameAr(s.nameAr || '');
    const resolved = resolveGovernorateAndDistrict(s);
    setFormGovernorate(resolved.governorate);
    setFormDistrict(resolved.district);
    setFormVillage(s.village || (s.region && !['beirut', 'mount_lebanon', 'north', 'south', 'bekaa', 'nabatieh', 'baalbek_hermel', 'keserwan_jbeil', 'akkar'].includes(s.region.toLowerCase()) ? s.region : ''));
    setFormExactAddress(s.exactAddress || '');
    setFormRegion(resolved.governorate);
    setFormPhone(s.contactPhone || '');
    setFormEmail(s.contactEmail || '');
    setFormIsActive(s.isActive);
    setIsModalOpen(true);
  };

  const handleSaveSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNameEn.trim()) {
      showToast('Seller English name is required', 'warning');
      return;
    }
    try {
      const trimmedEmail = formEmail.trim().toLowerCase();
      if (editingSeller) {
        await updateSeller(editingSeller.id, {
          sellerCode: formSellerCode.trim() || undefined,
          nameEn: formNameEn.trim(),
          nameAr: formNameAr.trim(),
          governorate: formGovernorate,
          district: formDistrict,
          village: formVillage.trim(),
          exactAddress: formExactAddress.trim(),
          region: formGovernorate,
          contactPhone: formPhone.trim(),
          contactEmail: trimmedEmail,
          accountEmail: editingSeller.hasAccount ? (trimmedEmail || editingSeller.accountEmail) : (trimmedEmail || undefined),
          isActive: formIsActive
        });
        showToast('Seller updated successfully!');
      } else {
        await addSeller({
          sellerCode: formSellerCode.trim() || undefined,
          nameEn: formNameEn.trim(),
          nameAr: formNameAr.trim(),
          governorate: formGovernorate,
          district: formDistrict,
          village: formVillage.trim(),
          exactAddress: formExactAddress.trim(),
          region: formGovernorate,
          contactPhone: formPhone.trim(),
          contactEmail: trimmedEmail,
          accountEmail: trimmedEmail || undefined,
          isActive: formIsActive
        });
        showToast('Seller created successfully!');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save seller', 'warning');
    }
  };

  const handleDeleteClick = async (sellerId: string) => {
    const targetSeller = sellers.find(s => s.id === sellerId);
    const affected = targetSeller ? products.filter(p => isProductLinkedToSeller(p, targetSeller)) : [];
    if (affected.length > 0) {
      setDeleteTargetId(sellerId);
      setReassignTargetId(sellers.find(s => s.id !== sellerId)?.id || '');
    } else {
      if (window.confirm('Are you sure you want to delete this seller?')) {
        try {
          await deleteSeller(sellerId);
          showToast('Seller deleted successfully');
        } catch (err: any) {
          showToast(err.message, 'warning');
        }
      }
    }
  };

  const handleConfirmDeleteWithReassign = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteSeller(deleteTargetId, reassignTargetId);
      showToast('Seller deleted and products reassigned successfully');
      setDeleteTargetId(null);
    } catch (err: any) {
      showToast(err.message, 'warning');
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'sku',
      'name_en',
      'name_ar',
      'seller_id',
      'seller_item_code',
      'category',
      'price_usd',
      'original_price_usd',
      'stock',
      'image_url',
      'additional_images',
      'video_url',
      'additional_videos',
      'description_en',
      'description_ar',
      'tags',
      'is_published',
      'origin_terroir',
      'weight_or_volume'
    ];

    const csvContent = headers.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `yalla_catalog_template_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSellersReport = () => {
    import('papaparse').then((Papa) => {
      const dataToExport = filteredSellers.map(seller => ({
        seller_id: seller.id,
        name_en: seller.nameEn,
        name_ar: seller.nameAr || '',
        status: seller.isActive ? 'Active' : 'Inactive',
        region: seller.region || 'Lebanon',
        contact_phone: seller.contactPhone || '',
        contact_email: seller.contactEmail || seller.accountEmail || '',
        linked_products_count: products.filter(p => isProductLinkedToSeller(p, seller)).length,
        created_at: seller.createdAt || '',
      }));

      const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `yalla_sellers_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Sellers report downloaded successfully', 'success');
    });
  };

  const recomputePreview = (rows: any[], targetSeller: string, fallbackCat: string) => {
    const parsedPreview: any[] = [];

    rows.forEach((row, idx) => {
      if (isCsvRowEmpty(row)) return;
      const rowNum = idx + 2;
      const name = (row.name_en || row.name || row.title || '').toString().trim();
      const resolvedSeller = resolveSeller(row, sellers, targetSeller);
      const resolvedCategory = resolveCategory(row, categories, fallbackCat);
      const priceUSD = parsePrice(row.price_usd || row.price || row.unit_price);
      const stock = parseStock(row.stock !== undefined ? row.stock : row.qty);

      const rowIssues: string[] = [];
      if (!name) rowIssues.push('name_en required');
      if (!resolvedSeller) {
        const rawSeller = row.seller_id || row.seller || row.seller_artisan || 'empty';
        rowIssues.push(`seller "${rawSeller}" unknown (Select Target Seller above)`);
      }
      if (!resolvedCategory) {
        const rawCat = row.category || row.category_id || 'empty';
        rowIssues.push(`category "${rawCat}" unknown`);
      }
      if (priceUSD <= 0) rowIssues.push('price_usd must be > 0');
      if (isNaN(stock) || stock < 0) rowIssues.push('stock must be >= 0');

      const sku = (row.sku || row.product_id || '').toString().trim();
      const isUpdate = sku ? products.some(p => p.id === sku) : false;
      const sellerItemCode = (row.seller_item_code || row.seller_code || row.item_code || '').toString().trim();

      if (sellerItemCode) {
        const dupCheck = checkDuplicateSellerItemCode(sellerItemCode, isUpdate ? sku : null, resolvedSeller?.sellerId, resolvedSeller?.sellerName, products);
        if (dupCheck.isDuplicate) {
          rowIssues.push(`Duplicate seller item code "${sellerItemCode}" for seller "${resolvedSeller?.sellerName || ''}"`);
        }
      }

      parsedPreview.push({
        rowNum,
        sku: sku || '(auto-generated)',
        name: name || 'Unnamed',
        sellerName: resolvedSeller?.sellerName || 'Unassigned',
        categoryName: resolvedCategory?.categoryName || 'Unassigned',
        action: isUpdate ? 'Update' : 'Create',
        issues: rowIssues
      });
    });

    setPreviewRows(parsedPreview);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Parse with PapaParse for dry run preview
      import('papaparse').then((Papa) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toLowerCase(),
          complete: (results) => {
            const rows = (results.data as any[]).filter(r => !isCsvRowEmpty(r));
            setRawImportRows(rows);
            recomputePreview(rows, targetSellerId, fallbackCategoryId);
          }
        });
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleTargetSellerSelect = (newSellerId: string) => {
    setTargetSellerId(newSellerId);
    if (rawImportRows.length > 0) {
      recomputePreview(rawImportRows, newSellerId, fallbackCategoryId);
    }
  };

  const handleFallbackCategorySelect = (newCatId: string) => {
    setFallbackCategoryId(newCatId);
    if (rawImportRows.length > 0) {
      recomputePreview(rawImportRows, targetSellerId, newCatId);
    }
  };

  const handleCommitImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const result = await bulkImportProducts(text, {
          targetSellerId: targetSellerId,
          fallbackCategoryId: fallbackCategoryId
        });
        setImportResult(result);
        if (result.created > 0 || result.updated > 0) {
          showToast(`Successfully imported products! Created: ${result.created}, Updated: ${result.updated}`, 'success');
        } else if (result.errors.length > 0) {
          showToast(`Import encountered issues: ${result.errors[0]}`, 'warning');
        }
      } catch (err: any) {
        showToast(err.message || 'Import failed', 'warning');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(importFile, 'UTF-8');
  };

  return (
    <div className="space-y-6">
      {/* Header & Subtabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
            <Store className="w-3.5 h-3.5" />
            <span>Seller Network & Catalog Import</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Sellers & CSV Bulk Operations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage authenticated suppliers, normalize product linkages, and bulk import/export inventory via CSV.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveSubTab('sellers')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'sellers'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Registered Sellers ({sellers.length})
          </button>
          <button
            onClick={() => setActiveSubTab('applications')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeSubTab === 'applications'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Seller Signups</span>
            {pendingAppsCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                {pendingAppsCount} New
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black">
                {applications.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('import')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'import'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            CSV Bulk Import / Export
          </button>
        </div>
      </div>

      {activeSubTab === 'sellers' ? (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, seller code, or product code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setSellerStatusFilter('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    sellerStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({sellers.length})
                </button>
                <button
                  onClick={() => setSellerStatusFilter('active')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    sellerStatusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active ({sellers.filter(s => s.isActive).length})
                </button>
                <button
                  onClick={() => setSellerStatusFilter('inactive')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    sellerStatusFilter === 'inactive' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inactive ({sellers.filter(s => !s.isActive).length})
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto">
              <button
                onClick={() => {
                  downloadSellerPerformanceReport(products, sellers, orders);
                  showToast('Seller Performance & Sales report downloaded successfully.', 'success');
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs shrink-0"
                title="Download Seller Sales, Revenue & Payout Ledger"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Sales & Performance</span>
              </button>
              <button
                onClick={handleDownloadSellersReport}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-2xs shrink-0"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Download Directory</span>
              </button>
              <button
                onClick={handleOpenAdd}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Seller</span>
              </button>
            </div>
          </div>

          {/* Sellers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredSellers.map((seller) => {
              const productCount = products.filter(p => isProductLinkedToSeller(p, seller)).length;
              return (
                <div 
                  key={seller.id}
                  className={`bg-white rounded-3xl p-5 sm:p-6 border transition-all shadow-xs flex flex-col justify-between ${
                    seller.isActive ? 'border-slate-200' : 'border-amber-200 bg-amber-50/20 opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                            {seller.sellerCode || 'SLR-101'}
                          </span>
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-slate-100 text-slate-500 truncate max-w-[120px]">
                            {seller.id}
                          </span>
                        </div>
                        <h3 className="text-base font-black text-slate-900 mt-2 truncate" title={seller.nameEn}>{seller.nameEn}</h3>
                        {seller.nameAr && <p className="text-xs font-semibold text-slate-500 truncate" title={seller.nameAr}>{seller.nameAr}</p>}
                      </div>
                      <button
                        onClick={() => toggleSellerActive(seller.id, !seller.isActive)}
                        className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                          seller.isActive 
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                        title={seller.isActive ? 'Deactivate seller (hides products)' : 'Activate seller'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1.5 py-3 border-t border-b border-slate-100 text-xs text-slate-600">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Location:</span>
                        <span className="font-bold truncate max-w-[150px] text-right" title={`${seller.village ? seller.village + ', ' : ''}${seller.district ? seller.district + ' • ' : ''}${LEBANON_GOVERNORATES_DATA[seller.governorate || seller.region || '']?.nameEn || seller.governorate || seller.region || 'Lebanon'}`}>
                          {seller.village ? `${seller.village}, ` : ''}{seller.district ? `${seller.district}` : (LEBANON_GOVERNORATES_DATA[seller.governorate || seller.region || '']?.nameEn || seller.governorate || seller.region || 'Lebanon')}
                        </span>
                      </div>
                      {seller.exactAddress && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Address:</span>
                          <span className="font-medium truncate max-w-[150px] text-right" title={seller.exactAddress}>{seller.exactAddress}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Linked Products:</span>
                        <span className="font-black text-indigo-600">{productCount} products</span>
                      </div>
                      {seller.contactPhone && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">WhatsApp:</span>
                          <span className="font-bold truncate max-w-[140px] text-right font-mono text-[11px]">{seller.contactPhone}</span>
                        </div>
                      )}
                      {(seller.contactEmail || seller.accountEmail) && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Email:</span>
                          <span className="font-medium truncate max-w-[150px] text-right font-mono text-[11px] text-indigo-600" title={seller.contactEmail || seller.accountEmail}>
                            {seller.contactEmail || seller.accountEmail}
                          </span>
                        </div>
                      )}
                      
                      {/* Admin Credentials Manager for Merchant Portal Access */}
                      <div className="pt-2.5 mt-2.5 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Merchant Portal Access</span>
                        </div>
                        {seller.hasAccount ? (
                          <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-800 truncate flex items-center gap-1.5" title={seller.accountEmail}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                              <span className="truncate max-w-[170px]">{seller.accountEmail}</span>
                            </p>
                            <div className="flex gap-1 pt-1">
                              <button
                                onClick={() => handleSendPasswordReset(seller.accountEmail || '')}
                                className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold transition-all cursor-pointer"
                                title="Send official password reset email link"
                              >
                                Reset Pass
                              </button>
                              <button
                                onClick={() => handleDeleteAccountConfirm(seller)}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-bold transition-all cursor-pointer"
                                title="Revoke access and unlink account credentials"
                              >
                                Revoke Account
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 italic">No access configured</p>
                            <button
                              onClick={() => handleOpenAccountModal(seller)}
                              className="w-full mt-1.5 py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                            >
                              <span>Configure Credentials</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      seller.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {seller.isActive ? 'Active Storefront' : 'Inactive / Hidden'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(seller)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                        title="Edit seller"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(seller.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Delete seller"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeSubTab === 'applications' ? (
        <div className="space-y-6">
          {/* Applications Filter & Search Header */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search applicants, workshop, village..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setAppStatusFilter('pending')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    appStatusFilter === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending ({applications.filter(a => a.status === 'pending').length})
                </button>
                <button
                  onClick={() => setAppStatusFilter('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    appStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({applications.length})
                </button>
                <button
                  onClick={() => setAppStatusFilter('approved')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    appStatusFilter === 'approved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Approved ({applications.filter(a => a.status === 'approved').length})
                </button>
                <button
                  onClick={() => setAppStatusFilter('rejected')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap text-center ${
                    appStatusFilter === 'rejected' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rejected ({applications.filter(a => a.status === 'rejected').length})
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium self-end xl:self-center">
              Showing {filteredApplications.length} applications
            </div>
          </div>

          {/* Applications Grid */}
          {filteredApplications.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xs space-y-3">
              <Store className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-black text-slate-800">No Applications Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {appStatusFilter === 'pending'
                  ? 'There are no pending seller signups awaiting review.'
                  : 'No seller applications match your active search filters.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredApplications.map((app) => {
                const isPending = app.status === 'pending';
                const isApproved = app.status === 'approved';
                const isRejected = app.status === 'rejected';
                const companyName = app.sellerCompany || app.workshopName || 'Seller Workshop';
                const contactFullName = `${app.firstName || ''} ${app.middleName || ''} ${app.lastName || ''}`.trim() || app.contactName || companyName;

                const notifData = buildSellerWelcomeNotification({
                  sellerName: companyName,
                  contactName: contactFullName,
                  email: app.email,
                  phone: app.phone
                });

                return (
                  <div 
                    key={app.id} 
                    className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-xs hover:border-slate-200 transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isPending ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {app.status}
                            </span>
                            {app.craftCategory && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                                {app.craftCategory}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono">
                              {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-slate-900 mt-1">
                            {companyName}
                          </h3>
                          {app.workshopNameAr && (
                            <p className="text-xs font-bold text-slate-500 font-arabic">
                              {app.workshopNameAr}
                            </p>
                          )}
                        </div>

                        {/* Quick WhatsApp Link Button */}
                        <a
                          href={notifData.whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold shadow-2xs"
                          title="Chat with applicant on WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4 text-emerald-600" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      </div>

                      {/* Contact & Location Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Seller / Contact</span>
                          <span className="font-bold text-slate-800">{contactFullName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phone</span>
                          <span className="font-mono font-bold text-slate-800">{app.phone}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Email</span>
                          <span className="font-mono text-slate-700 truncate block">{app.email}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Location</span>
                          <span className="font-medium text-slate-700">
                            {app.village ? `${app.village}, ` : ''}{app.governorate ? LEBANON_GOVERNORATES_DATA[app.governorate]?.nameEn || app.governorate : ''}
                          </span>
                        </div>
                      </div>

                      {/* Bio & Craft Story */}
                      {app.bio && (
                        <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Craft & Heritage Story</span>
                          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{app.bio}</p>
                        </div>
                      )}

                      {/* Social Portfolio Links */}
                      {app.socialLink && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <a href={safeHref(app.socialLink)} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs">
                            {app.socialLink}
                          </a>
                        </div>
                      )}

                      {/* Rejection Note if any */}
                      {isRejected && app.rejectionReason && (
                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-100 text-xs text-rose-800 space-y-0.5">
                          <span className="font-black text-[10px] uppercase tracking-wider block text-rose-600">Rejection Feedback</span>
                          <p>{app.rejectionReason}</p>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      {isPending ? (
                        <>
                          <button
                            onClick={() => handleOpenRejectModal(app)}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <UserX className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={() => handleOpenApproveModal(app)}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 ml-auto"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span>Approve & Create Account</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-xs text-slate-500 font-medium">
                            {isApproved ? 'Account active and provisioned.' : 'Application marked as rejected.'}
                          </span>
                          <button
                            onClick={() => {
                              if (isApproved) {
                                setNotificationModalData({
                                  isOpen: true,
                                  type: 'approved',
                                  sellerName: companyName,
                                  contactName: contactFullName,
                                  email: app.email,
                                  phone: app.phone
                                });
                              } else {
                                setNotificationModalData({
                                  isOpen: true,
                                  type: 'rejected',
                                  sellerName: companyName,
                                  contactName: contactFullName,
                                  email: app.email,
                                  phone: app.phone,
                                  rejectionReason: app.rejectionReason
                                });
                              }
                            }}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Dispatch Message</span>
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
      ) : (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 space-y-6 shadow-xs">
          <div>
            <h3 className="text-lg font-black text-slate-900">CSV Inventory Bulk Import & Template Export</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Download your current catalog template, edit prices or stock in Excel, and re-import via CSV with dry-run preview validation.
            </p>
          </div>

          {/* Quick Target Seller & Fallback Category Mapping */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-indigo-600" />
                <span>Quick Supplier Assignment & Fallbacks</span>
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">Auto-resolves missing or unmapped CSV columns</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Target Seller / Supplier:
                </label>
                <select
                  value={targetSellerId}
                  onChange={(e) => handleTargetSellerSelect(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="auto">⚡ Auto-Detect from CSV (by ID, Name, or Slug)</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameEn} ({s.id})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Select a seller here to automatically link all imported items to that vendor.
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Default Fallback Category:
                </label>
                <select
                  value={fallbackCategoryId}
                  onChange={(e) => handleFallbackCategorySelect(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="auto">⚡ Auto-Detect from CSV</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn} ({c.id})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Used if the CSV row has a blank or unrecognized category.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <button
              onClick={() => {
                downloadFullMasterReport(products, sellers, orders);
                showToast('Full Master Report downloaded successfully (Products, Sellers, Stock & Sales)', 'success');
              }}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-2 shadow-2xs"
              title="Download 360° master dataset"
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>Full Master Export</span>
            </button>

            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>CSV Catalog Template</span>
            </button>

            <button
              onClick={handleDownloadSellersReport}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Sellers Directory CSV</span>
            </button>

            <div className="flex-1"></div>

            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Select CSV File</span>
            </button>
          </div>

          {importFile && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-black text-sm text-slate-900">Dry-Run Preview: {importFile.name}</h4>
                  <p className="text-xs text-slate-500">
                    {previewRows.length} rows detected ({previewRows.filter(r => r.issues.length === 0).length} valid, {previewRows.filter(r => r.issues.length > 0).length} with issues)
                  </p>
                </div>
                <button
                  onClick={handleCommitImport}
                  disabled={isImporting || previewRows.filter(r => r.issues.length === 0).length === 0}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2 ${
                    previewRows.filter(r => r.issues.length === 0).length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed w-full sm:w-auto'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm w-full sm:w-auto'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isImporting
                      ? 'Committing...'
                      : previewRows.filter(r => r.issues.length === 0).length > 0
                        ? `Commit ${previewRows.filter(r => r.issues.length === 0).length} Valid ${previewRows.filter(r => r.issues.length === 0).length === 1 ? 'Row' : 'Rows'}`
                        : 'No Valid Rows'}
                  </span>
                </button>
              </div>

              {previewRows.some(r => r.issues.length > 0) && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Validation errors found:</span> Some rows contain missing data or unknown `seller_id` or `category` IDs. Fix them in CSV before committing.
                  </div>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 sticky top-0 text-slate-700 font-bold">
                    <tr>
                      <th className="py-3 px-4">Row</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Assigned Seller</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Issues / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className={row.issues.length > 0 ? 'bg-rose-50/50' : 'bg-white'}>
                        <td className="py-3 px-4 text-slate-500 font-bold">{row.rowNum}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.sku}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.name}</td>
                        <td className="py-3 px-4 text-indigo-700 font-medium">{row.sellerName}</td>
                        <td className="py-3 px-4 text-slate-600">{row.categoryName}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.action === 'Create' ? 'bg-sky-50 text-sky-700' : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {row.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {row.issues.length > 0 ? (
                            <span className="text-rose-600 font-bold">{row.issues.join(', ')}</span>
                          ) : (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importResult && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
              <div className="font-black text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Import Completed Successfully!
              </div>
              <p>Created: <strong className="font-black">{importResult.created}</strong> new products.</p>
              <p>Updated: <strong className="font-black">{importResult.updated}</strong> existing products.</p>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Seller Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950">
                {editingSeller ? 'Edit Seller Details' : 'Register New Seller'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSeller} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unique Seller Code *</label>
                <input
                  type="text"
                  required
                  value={formSellerCode}
                  onChange={(e) => setFormSellerCode(e.target.value)}
                  placeholder="e.g. SLR-101"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">English Name *</label>
                <input
                  type="text"
                  required
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="e.g. Chouf Eco Soap"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Arabic Name</label>
                <input
                  type="text"
                  value={formNameAr}
                  onChange={(e) => setFormNameAr(e.target.value)}
                  placeholder="e.g. صابون الشوف البيئي"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 text-right"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Governorate *</label>
                  <select
                    value={formGovernorate}
                    onChange={(e) => handleGovernorateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {Object.entries(LEBANON_GOVERNORATES_DATA).map(([key, g]) => (
                      <option key={key} value={key}>{g.nameEn}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">District (Qada) *</label>
                  <select
                    value={formDistrict}
                    onChange={(e) => setFormDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {(LEBANON_GOVERNORATES_DATA[formGovernorate]?.districts || []).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Village / Town *</label>
                  <input
                    type="text"
                    required
                    value={formVillage}
                    onChange={(e) => setFormVillage(e.target.value)}
                    placeholder="e.g. Deir El Qamar"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exact Address / Street / Building</label>
                  <input
                    type="text"
                    value={formExactAddress}
                    onChange={(e) => setFormExactAddress(e.target.value)}
                    placeholder="e.g. Main Street, Cooperatives Bldg"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp / Contact Phone</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="e.g. +961 70 123 456"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seller Gmail / Email Address</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. artisan@gmail.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 -mt-2">
                The seller email is used for order communications and merchant portal authentication.
              </p>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveSeller"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="isActiveSeller" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Active Storefront (Products are visible to customers)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                >
                  {editingSeller ? 'Save Changes' : 'Create Seller'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Reassign Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-black text-slate-900">Reassign Products Before Deleting</h3>
            <p className="text-xs text-slate-600">
              There are <strong className="text-indigo-600">{products.filter(p => {
                const target = sellers.find(s => s.id === deleteTargetId);
                return target ? isProductLinkedToSeller(p, target) : false;
              }).length}</strong> products linked to this seller. Choose a new seller to reassign them to:
            </p>
            <select
              value={reassignTargetId}
              onChange={(e) => setReassignTargetId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              {sellers.filter(s => s.id !== deleteTargetId).map(s => (
                <option key={s.id} value={s.id}>{s.nameEn}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteWithReassign}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Reassign & Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Seller Access Modal */}
      {isAccountModalOpen && accountTargetSeller && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950">Setup Supplier Credentials</h3>
              <button 
                onClick={() => setIsAccountModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">{accountTargetSeller.sellerCode || 'Supplier'}</span>
              <h4 className="text-sm font-black text-slate-900">{accountTargetSeller.nameEn}</h4>
              <p className="text-xs text-slate-500">Creating login credentials grants the seller direct portal access to modify their stock, update pricing, write craft stories, and track their dispatches.</p>
            </div>

            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Seller Gmail / Email Address *</label>
                <input
                  type="email"
                  required
                  value={accountEmailInput}
                  onChange={(e) => setAccountEmailInput(e.target.value)}
                  placeholder="e.g. seller@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Seller Mobile Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={accountPhoneInput}
                  onChange={(e) => setAccountPhoneInput(e.target.value)}
                  placeholder="e.g. 70 123 456 or +961 70 123456"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Sellers log in using their Gmail, this mobile number, and their password.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={accountPasswordInput}
                  onChange={(e) => setAccountPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAccountActionLoading}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isAccountActionLoading ? 'Creating User...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve Application & Provision Credentials Modal */}
      {selectedAppForApproval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">Approve Seller Signup</h3>
                  <p className="text-xs text-slate-500">Confirm details & create merchant portal credentials</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedAppForApproval(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmApprovalSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seller Code *</label>
                  <input
                    type="text"
                    required
                    value={approveSellerCode}
                    onChange={(e) => setApproveSellerCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seller Company Name *</label>
                  <input
                    type="text"
                    required
                    value={approveWorkshopName}
                    onChange={(e) => setApproveWorkshopName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Seller Arabic Name</label>
                <input
                  type="text"
                  value={approveWorkshopNameAr}
                  onChange={(e) => setApproveWorkshopNameAr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 text-right"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Governorate *</label>
                  <select
                    value={approveGovernorate}
                    onChange={(e) => {
                      setApproveGovernorate(e.target.value);
                      const dists = LEBANON_GOVERNORATES_DATA[e.target.value]?.districts || [];
                      setApproveDistrict(dists[0] || '');
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {Object.entries(LEBANON_GOVERNORATES_DATA).map(([key, g]) => (
                      <option key={key} value={key}>{g.nameEn}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">District (Qada) *</label>
                  <select
                    value={approveDistrict}
                    onChange={(e) => setApproveDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {(LEBANON_GOVERNORATES_DATA[approveGovernorate]?.districts || []).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Village / Town *</label>
                <input
                  type="text"
                  required
                  value={approveVillage}
                  onChange={(e) => setApproveVillage(e.target.value)}
                  placeholder="e.g. Deir El Qamar, Jezzine, Tripoli..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Login Email *</label>
                  <input
                    type="email"
                    required
                    value={approveEmail}
                    onChange={(e) => setApproveEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Phone (WhatsApp) *</label>
                  <input
                    type="tel"
                    required
                    value={approvePhone}
                    onChange={(e) => setApprovePhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password *</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={approvePassword}
                  onChange={(e) => setApprovePassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">This temporary password will be sent to the seller via WhatsApp/Email immediately.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAppForApproval(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isApproving ? 'Provisioning...' : 'Approve & Activate Seller'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Application Modal */}
      {selectedAppForRejection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <UserX className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black text-slate-950">Decline Application</h3>
              </div>
              <button 
                onClick={() => setSelectedAppForRejection(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              You are rejecting the signup request from <strong className="text-slate-900">"{selectedAppForRejection.sellerCompany || selectedAppForRejection.workshopName}"</strong> ({`${selectedAppForRejection.firstName || ''} ${selectedAppForRejection.middleName || ''} ${selectedAppForRejection.lastName || ''}`.trim() || selectedAppForRejection.contactName}).
            </p>

            <form onSubmit={handleConfirmRejectionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Feedback for Seller (Optional)</label>
                <textarea
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Please provide photos of your handcrafted goods, or your workshop is located outside our current courier pickup route..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quick Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRejectionReasonInput('يرجى تزويدنا بصور إضافية للمنتجات وتفاصيل الأسعار.')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium"
                  >
                    صور إضافية للمنتجات
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectionReasonInput('نعتذر، فئة المنتجات مكتملة حالياً في منطقتكم وسنتواصل معكم فور فتح الشواغر.')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium"
                  >
                    الفئة مكتملة
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectionReasonInput('المنطقة الجغرافية الحالية خارج نطاق شبكة التوصيل والاستلام المباشر.')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium"
                  >
                    خارج نطاق التوصيل
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAppForRejection(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRejecting}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Notification Dispatch Modal (WhatsApp / Email / SMS) */}
      {notificationModalData && notificationModalData.isOpen && (() => {
        const isApproveOrCreated = notificationModalData.type === 'approved' || notificationModalData.type === 'created';
        const notif = isApproveOrCreated 
          ? buildSellerWelcomeNotification({
              sellerName: notificationModalData.sellerName,
              contactName: notificationModalData.contactName,
              email: notificationModalData.email,
              phone: notificationModalData.phone,
              tempPassword: notificationModalData.tempPassword
            })
          : buildSellerRejectionNotification({
              sellerName: notificationModalData.sellerName,
              contactName: notificationModalData.contactName,
              email: notificationModalData.email,
              phone: notificationModalData.phone,
              rejectionReason: notificationModalData.rejectionReason
            });

        const handleCopyText = () => {
          navigator.clipboard.writeText(notif.fullText);
          setCopiedNotificationText(true);
          setTimeout(() => setCopiedNotificationText(false), 2500);
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${isApproveOrCreated ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-950">
                      {isApproveOrCreated ? 'Notify Seller: Account Ready' : 'Notify Applicant: Status Update'}
                    </h3>
                    <p className="text-xs text-slate-500">Send confirmation via WhatsApp, Email, or SMS</p>
                  </div>
                </div>
                <button 
                  onClick={() => setNotificationModalData(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Recipient summary */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">Seller / Company:</span>
                  <span className="font-black text-slate-900">{notificationModalData.sellerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">Mobile WhatsApp:</span>
                  <span className="font-mono font-bold text-slate-900">{notificationModalData.phone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">Email Address:</span>
                  <span className="font-mono font-bold text-slate-900">{notificationModalData.email}</span>
                </div>
                {notificationModalData.tempPassword && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-indigo-700">
                    <span className="font-bold">Generated Password:</span>
                    <span className="font-mono font-black">{notificationModalData.tempPassword}</span>
                  </div>
                )}
              </div>

              {/* Notification Message Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Message Content Preview:</span>
                  <button
                    onClick={handleCopyText}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer inline-flex items-center gap-1"
                  >
                    {copiedNotificationText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl text-xs font-mono whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto border border-slate-800">
                  {notif.fullText}
                </div>
              </div>

              {/* Action Buttons: WhatsApp / Email / SMS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <a
                  href={notif.whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send on WhatsApp</span>
                </a>

                <a
                  href={notif.mailtoLink}
                  className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Send Email</span>
                </a>
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={notif.smsLink}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer inline-flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Trigger Mobile SMS</span>
                </a>

                <button
                  onClick={() => setNotificationModalData(null)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
