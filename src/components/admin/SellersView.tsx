import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertTriangle, BarChart3, BookUser, Check, CheckCircle2, Download, Edit3, FileSpreadsheet,
  Lock, Mail, MapPin, MessageCircle, Plus, Power, RefreshCw, Search, Store, Trash2, Upload, UserPlus, X, XCircle,
} from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { supabase } from '../../lib/supabase';
import { generateSecurePassword } from '../../lib/passwordPolicy';
import { isSafeImageUrl } from '../../lib/safeUrl';
import { useDialog } from '../../hooks/useDialog';
import { sanitizeRowForCsv } from '../../utils/csvSafe';
import { downloadSellerPerformanceReport } from '../../utils/exportMasterReport';
import type { Seller } from '../../types';
import {
  CSV_TEMPLATE_HEADERS,
  LEBANON_GOVERNORATES_DATA,
  applicationPhotos,
  buildSellerPayload,
  catalogExportRows,
  filterSellers,
  governorateId,
  linkedProductCounts,
  mergeSellerPrivate,
  previewCsvImport,
  sellerLocationLabel,
  sellerStatusCounts,
  sellerToForm,
  validateSellerForm,
  whatsAppHref,
  type ImportPreviewRow,
  type SellerForm,
  type SellerPrivateRow,
  type SellerStatusFilter,
} from '../../lib/sellerAdmin';
import { SearchableSelect } from '../ui/SearchableSelect';

type Tab = 'registered' | 'signups' | 'bulk';

const downloadCsv = (rows: Record<string, unknown>[] | { fields: string[]; data: unknown[] }, filename: string) => {
  const csv = Array.isArray(rows) ? Papa.unparse(rows.map(sanitizeRowForCsv)) : Papa.unparse(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const SellersView: React.FC = () => {
  const shop = useShop() as any;
  const sellers: Seller[] = shop.sellers || [];
  const products = shop.products || [];
  const categories = shop.categories || [];
  const orders = shop.orders || [];
  const toast = (msg: string, kind: 'success' | 'error' | 'warning' = 'success') => shop.showToast?.(msg, kind);

  const [tab, setTab] = useState<Tab>('registered');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SellerStatusFilter>('all');

  // Email, address and commission are not granted to clients; admins read them
  // through the verified-admin RPC and they are merged in for display/export.
  const [privateRows, setPrivateRows] = useState<SellerPrivateRow[] | null>(null);
  const loadPrivate = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_seller_private');
    setPrivateRows(error ? null : (data as SellerPrivateRow[]) || []);
  }, []);
  useEffect(() => { loadPrivate(); }, [loadPrivate, sellers.length]);
  const allSellers = useMemo(
    () => (privateRows ? mergeSellerPrivate(sellers, privateRows) : sellers),
    [sellers, privateRows],
  );

  const counts = useMemo(() => sellerStatusCounts(allSellers), [allSellers]);
  const visible = useMemo(
    () => filterSellers(allSellers, products, query, status),
    [allSellers, products, query, status],
  );

  const [editing, setEditing] = useState<{ id?: string; initial: SellerForm } | null>(null);
  const [deleting, setDeleting] = useState<Seller | null>(null);

  const [apps, setApps] = useState<any[]>([]);
  const [appsBusy, setAppsBusy] = useState(false);
  const [handling, setHandling] = useState<string | null>(null);
  const loadApps = useCallback(async () => {
    setAppsBusy(true);
    const { data, error } = await supabase
      .from('seller_applications').select('*').order('created_at', { ascending: false });
    if (error) toast(error.message || 'Could not load applications.', 'error');
    else setApps(data || []);
    setAppsBusy(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Loaded up front, not on first visit, so the tab's "N New" count is real.
  useEffect(() => { loadApps(); }, [loadApps]);
  const pendingApps = apps.filter(a => a.status === 'pending').length;

  // ── Registered sellers actions ────────────────────────────────────────────

  const togglePower = async (s: Seller) => {
    const activating = s.isActive === false;
    const { live } = linkedProductCounts(products, s.id);
    if (!activating && live > 0 &&
        !confirm(`Deactivate ${s.nameEn}? Their ${live} live product(s) will disappear from the storefront.`)) return;
    try {
      await shop.toggleSellerActive(s.id, activating);
      toast(`${s.nameEn} ${activating ? 'activated' : 'deactivated'} store-wide.`);
    } catch {
      // toggleSellerActive reports its own failure.
    }
  };

  const manageAccount = async (s: Seller) => {
    const email = s.accountEmail || s.contactEmail;
    if (!email) return toast('Add the seller\'s email before creating a portal account.', 'warning');
    const password = generateSecurePassword(16);
    try {
      const r = await supabase.functions.invoke('admin-seller-provision', { body: { sellerId: s.id, email, password } });
      if (r.error) {
        // A non-2xx only says "non-2xx"; the function's own reason is in the body.
        const body = await r.error.context?.json?.().catch(() => null);
        throw new Error(body?.error || r.error.message);
      }
      alert(`Seller portal credentials\n\nEmail: ${email}\nTemporary password: ${password}\n\nShare them securely; the seller should change the password on first sign-in.`);
      toast('Seller portal account ready.');
    } catch (e: any) {
      toast(e?.message || 'Could not provision the portal account.', 'error');
    }
  };

  const exportDirectory = () => downloadCsv(allSellers.map(s => {
    const { live, total } = linkedProductCounts(products, s.id);
    return {
      seller_code: s.sellerCode || '', name_en: s.nameEn, name_ar: s.nameAr || '',
      status: s.isActive === false ? 'Inactive' : 'Active',
      whatsapp: s.contactPhone || '', contact_email: s.contactEmail || '', login_email: s.accountEmail || '',
      governorate: s.governorate || '', district: s.district || '', village: s.village || '',
      exact_address: s.exactAddress || '', commission_pct: s.commissionPct ?? '',
      products_live: live, products_total: total,
    };
  }), `yalla_seller_directory_${new Date().toISOString().slice(0, 10)}.csv`);

  const exportPerformance = () => {
    if (!privateRows) toast('Commission rates could not be loaded, so payouts assume 0% commission.', 'warning');
    downloadSellerPerformanceReport(products, allSellers, orders);
  };

  // ── Applications ──────────────────────────────────────────────────────────

  const approve = async (a: any) => {
    const p = a.payload || {};
    const base = {
      nameEn: String(p.name_en || p.nameEn || p.business_name || p.name || 'Applicant'),
      nameAr: p.name_ar || p.nameAr, contactPhone: p.phone || p.contact_phone || p.whatsapp,
      contactEmail: p.email || p.contact_email, governorate: governorateId(p.governorate) || undefined, district: p.district,
      village: p.village || p.city || p.town, exactAddress: p.exact_address || p.address,
      craftCategory: p.category || p.craft_category, bioEn: p.workshop_description || p.description,
      bioAr: p.description_ar, isActive: true,
    };
    setHandling(a.id);
    // Claim the application before creating anything: the status filter turns
    // a second click, or a second admin, into a no-op rather than a second
    // seller under the next code.
    const { data: claimed, error: claimError } = await supabase.from('seller_applications')
      .update({ status: 'approved' }).eq('id', a.id).eq('status', 'pending').select('id');
    if (claimError || !claimed?.length) {
      toast(claimError?.message || 'This application was already handled, or your administrator session is not verified.', 'error');
      setHandling(null);
      loadApps();
      return;
    }

    try {
      // The database assigns the code, so two admins approving at once
      // cannot be handed the same one.
      const created: Seller = await shop.addSeller(base);
      toast(`Approved — ${base.nameEn} is seller ${created.sellerCode}.`);
    } catch (e: any) {
      // No seller was created, so put the application back in the queue.
      const { data: reverted } = await supabase.from('seller_applications')
        .update({ status: 'pending' }).eq('id', a.id).eq('status', 'approved').select('id');
      toast(`${e?.message || 'Approval failed.'}${reverted?.length ? '' : ' The application is still marked approved; set it back to pending before retrying.'}`, 'error');
    }
    setHandling(null);
    loadApps();
  };

  const decline = async (a: any) => {
    const reason = prompt('Feedback for the applicant:', 'Additional photos required');
    if (reason === null) return;
    setHandling(a.id);
    const { data, error } = await supabase.from('seller_applications')
      .update({ status: 'declined', payload: { ...(a.payload || {}), decline_reason: reason } })
      .eq('id', a.id).eq('status', 'pending').select('id');
    if (error) toast(error.message, 'error');
    else if (!data?.length) toast('This application was already handled, or your administrator session is not verified.', 'error');
    else toast('Application declined with feedback.');
    setHandling(null);
    loadApps();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="space-y-5 text-slate-900">
      <header>
        <p className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Seller Network &amp; Catalog Import</p>
        <h2 className="text-2xl font-black tracking-tight">Sellers &amp; CSV Bulk Operations</h2>
        <p className="text-sm text-slate-500">Manage authenticated suppliers, normalize linkages, and bulk import/export</p>
      </header>

      <div role="tablist" aria-label="Seller sections" className="bg-white border border-slate-200 rounded-2xl p-1 flex flex-col sm:flex-row gap-1">
        {([
          ['registered', `Registered Sellers (${counts.all})`],
          ['signups', `Seller Signups (${pendingApps} New)`],
          ['bulk', 'CSV Bulk Import/Export'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 px-3 py-3 rounded-xl text-sm font-black transition ${tab === id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'registered' && (
        <>
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
              <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search sellers"
                placeholder="Name, SLR code or item code…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            <div role="group" aria-label="Filter by status" className="flex gap-1.5">
              {([
                ['all', `All (${counts.all})`, 'bg-slate-900 text-white', 'bg-slate-100 text-slate-600'],
                ['active', `Active (${counts.active})`, 'bg-emerald-600 text-white', 'bg-emerald-50 text-emerald-700'],
                ['inactive', `Inactive (${counts.inactive})`, 'bg-amber-500 text-white', 'bg-amber-50 text-amber-700'],
              ] as Array<[SellerStatusFilter, string, string, string]>).map(([id, label, on, off]) => (
                <button key={id} aria-pressed={status === id} onClick={() => setStatus(id)}
                  className={`px-3 py-2 rounded-full text-xs font-black ${status === id ? on : off}`}>{label}</button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 xl:ml-auto">
              <button onClick={exportPerformance} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-600" aria-hidden /> Sales &amp; Performance
              </button>
              <button onClick={exportDirectory} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black flex items-center gap-1.5">
                <BookUser className="w-4 h-4 text-indigo-600" aria-hidden /> Download Directory
              </button>
              <button onClick={() => setEditing({ initial: sellerToForm() })}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5">
                <Plus className="w-4 h-4" aria-hidden /> Add New Seller
              </button>
            </div>
          </div>

          {!privateRows && (
            <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Emails, exact addresses and commission rates are hidden until your administrator session is verified. Edits leave them unchanged.
            </p>
          )}

          {visible.length === 0 ? (
            <div className="p-10 text-center bg-white border border-slate-200 rounded-3xl text-sm text-slate-500">
              {allSellers.length === 0 ? 'No sellers yet. Add one or approve an application.' : 'No sellers match these filters.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visible.map(s => {
                const { live, total } = linkedProductCounts(products, s.id);
                const inactive = s.isActive === false;
                const wa = whatsAppHref(s.contactPhone);
                const loginEmail = s.accountEmail || s.contactEmail;
                return (
                  <article key={s.id} className={`bg-white rounded-3xl border border-slate-200 p-5 flex flex-col ${inactive ? 'opacity-75' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-black font-mono">{s.sellerCode || 'NO CODE'}</span>
                          <span className="text-[10px] font-mono text-slate-400 truncate" title={s.id}>{s.legacyId || s.id.slice(0, 8)}</span>
                          {inactive && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black">Inactive</span>}
                        </div>
                        <h3 className="mt-2 font-black leading-tight">{s.nameEn}</h3>
                        {s.nameAr && <p dir="rtl" className="text-sm text-slate-500 text-right">{s.nameAr}</p>}
                      </div>
                      <button onClick={() => togglePower(s)} aria-pressed={!inactive}
                        aria-label={inactive ? `Activate ${s.nameEn} store-wide` : `Deactivate ${s.nameEn} store-wide`}
                        title={inactive ? 'Activate store-wide' : 'Deactivate store-wide'}
                        className={`p-2 rounded-xl border ${inactive ? 'border-slate-200 text-slate-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                        <Power className="w-4 h-4" aria-hidden />
                      </button>
                    </div>

                    <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden />
                        <dt className="sr-only">WhatsApp</dt>
                        <dd className="font-mono">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="hover:underline">{s.contactPhone}</a> : (s.contactPhone || '—')}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                        <dt className="sr-only">Login email</dt>
                        <dd className="truncate">{loginEmail || (privateRows ? '—' : 'Hidden')}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                        <dt className="sr-only">Location</dt>
                        <dd>{sellerLocationLabel(s) || '—'}</dd>
                      </div>
                    </dl>

                    <p className="mt-3 text-xs font-black text-slate-800">
                      {live} Products Linked{total !== live && <span className="font-semibold text-slate-400"> ({total} incl. drafts)</span>}
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5 mt-auto">
                      <button onClick={() => manageAccount(s)} className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-black flex items-center gap-1">
                        <UserPlus className="w-3.5 h-3.5" aria-hidden /> Manage Account{s.hasAccount && <span className="text-emerald-600"> · linked</span>}
                      </button>
                      <button onClick={() => setEditing({ id: s.id, initial: sellerToForm(s) })} className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-black flex items-center gap-1">
                        <Edit3 className="w-3.5 h-3.5" aria-hidden /> Edit
                      </button>
                      <button onClick={() => setDeleting(s)} className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-black flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden /> Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'signups' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Supplier applications. The storefront does not yet have a form that submits them.</p>
            <button onClick={loadApps} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 ${appsBusy ? 'animate-spin' : ''}`} aria-hidden /> Refresh
            </button>
          </div>
          {apps.length === 0 && !appsBusy && (
            <div className="p-10 text-center bg-white border border-slate-200 rounded-3xl text-sm text-slate-500">No applications.</div>
          )}
          {apps.map(a => {
            const p = a.payload || {};
            const photos = applicationPhotos(p, isSafeImageUrl);
            return (
              <article key={a.id} className="bg-white border border-slate-200 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{p.name_en || p.name || p.business_name || 'Seller Applicant'}</h3>
                    <p className="text-xs text-slate-500 font-mono">{p.phone || p.whatsapp || 'No phone'}</p>
                    <p className="text-xs text-slate-500">{[p.village || p.city, p.district, p.governorate].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[11px] font-black ${a.status === 'pending' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                </div>
                <p className="text-sm text-slate-600 mt-3 whitespace-pre-line">{p.workshop_description || p.description || 'No workshop story provided.'}</p>
                {photos.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {photos.map(url => <img key={url} src={url} alt="Sample of the applicant's work" className="w-20 h-20 rounded-xl object-cover border border-slate-200" loading="lazy" />)}
                  </div>
                )}
                {a.status === 'pending' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => approve(a)} disabled={handling !== null} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                      <CheckCircle2 className="w-4 h-4" aria-hidden /> {handling === a.id ? 'Working…' : 'Approve & Assign Code'}
                    </button>
                    <button onClick={() => decline(a)} disabled={handling !== null} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                      <XCircle className="w-4 h-4" aria-hidden /> Decline
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'bulk' && (
        <BulkImportPanel shop={shop} sellers={allSellers} products={products} categories={categories} />
      )}

      {editing && (
        <SellerEditModal
          editing={editing}
          privateLoaded={!!privateRows}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadPrivate(); }}
          shop={shop}
        />
      )}

      {deleting && (
        <DeleteSellerModal
          seller={deleting}
          sellers={allSellers}
          linked={linkedProductCounts(products, deleting.id).total}
          onClose={() => setDeleting(null)}
          shop={shop}
        />
      )}
    </section>
  );
};

// ── Edit / create modal ─────────────────────────────────────────────────────

const SellerEditModal: React.FC<{
  editing: { id?: string; initial: SellerForm };
  privateLoaded: boolean;
  onClose: () => void;
  onSaved: () => void;
  shop: any;
}> = ({ editing, privateLoaded, onClose, onSaved, shop }) => {
  const isCreate = !editing.id;
  const [form, setForm] = useState<SellerForm>(editing.initial);
  const [errors, setErrors] = useState<Partial<Record<keyof SellerForm, string>>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const { containerRef } = useDialog({ isOpen: true, onClose, initialFocusRef: firstField });
  const set = <K extends keyof SellerForm>(k: K, v: SellerForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const districts = LEBANON_GOVERNORATES_DATA[form.governorate]?.districts ?? [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateSellerForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload = buildSellerPayload(editing.initial, form, isCreate);
    if (!isCreate && Object.keys(payload).length === 0) { onClose(); return; }
    setSaving(true);
    setFailure('');
    try {
      if (isCreate) {
        const created: Seller = await shop.addSeller(payload);
        shop.showToast?.(`Seller created with code ${created.sellerCode}.`, 'success');
      } else {
        await shop.updateSeller(editing.id, payload);
        shop.showToast?.('Seller updated.', 'success');
      }
      onSaved();
    } catch (err: any) {
      setFailure(err?.message || 'The seller could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const field = (k: keyof SellerForm, label: string, opts: { required?: boolean; mono?: boolean; rtl?: boolean; placeholder?: string; type?: string; ref?: React.Ref<HTMLInputElement> } = {}) => (
    <label className="block">
      <span className="text-xs font-black text-slate-700">{label}{opts.required && ' *'}</span>
      <input ref={opts.ref} type={opts.type || 'text'} value={form[k] as string} dir={opts.rtl ? 'rtl' : undefined}
        onChange={e => set(k, e.target.value as never)}
        placeholder={opts.placeholder} aria-invalid={!!errors[k]}
        className={`mt-1 w-full px-3 py-2.5 rounded-xl border text-sm ${errors[k] ? 'border-rose-400 bg-rose-50' : 'border-slate-200'} ${opts.mono ? 'font-mono' : ''} ${opts.rtl ? 'text-right' : ''}`} />
      {errors[k] && <span className="text-[11px] font-bold text-rose-600">{errors[k]}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="seller-modal-title"
        className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 id="seller-modal-title" className="text-lg font-black text-slate-950">{isCreate ? 'Add New Seller' : 'Edit Seller Details'}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" aria-hidden /></button>
        </div>

        <form onSubmit={save} className="space-y-3" noValidate>
          {!privateLoaded && !isCreate && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Email, exact address and commission are hidden until your session is verified. Leave them blank to keep the current values.
            </p>
          )}
          <div>
            <span className="text-xs font-black text-slate-700">Unique Seller Code</span>
            <p className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
              {isCreate
                ? <span className="text-slate-500">Assigned automatically when you save</span>
                : <span className="font-mono font-black text-slate-900">{form.sellerCode || 'NO CODE'}</span>}
            </p>
            <span className="text-[11px] font-bold text-slate-500">
              {isCreate ? 'The system gives each new seller the next free code.' : 'Assigned by the system. It cannot be changed.'}
            </span>
          </div>
          {field('nameEn', 'English Name', { required: true, placeholder: 'Chouf Eco Soap', ref: firstField })}
          {field('nameAr', 'Arabic Name', { rtl: true, placeholder: 'صابون الشوف البيئي' })}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-black text-slate-700">Governorate *</span>
              <SearchableSelect value={form.governorate} onChange={e => setForm(f => ({ ...f, governorate: e.target.value, district: '' }))}
                aria-invalid={!!errors.governorate}
                className={`mt-1 w-full px-3 py-2.5 rounded-xl border text-sm ${errors.governorate ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}>
                <option value="">Select…</option>
                {Object.entries(LEBANON_GOVERNORATES_DATA).map(([id, g]) => <option key={id} value={id}>{g.label}</option>)}
                {form.governorate && !LEBANON_GOVERNORATES_DATA[form.governorate] && (
                  <option value={form.governorate}>{form.governorate} (unrecognised)</option>
                )}
              </SearchableSelect>
              {errors.governorate && <span className="text-[11px] font-bold text-rose-600">{errors.governorate}</span>}
            </label>
            <label className="block">
              <span className="text-xs font-black text-slate-700">District *</span>
              <SearchableSelect value={form.district} onChange={e => set('district', e.target.value)} disabled={!form.governorate}
                aria-invalid={!!errors.district}
                className={`mt-1 w-full px-3 py-2.5 rounded-xl border text-sm disabled:bg-slate-50 ${errors.district ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}>
                <option value="">Select…</option>
                {districts.map(d => <option key={d}>{d}</option>)}
                {form.district && !districts.includes(form.district) && (
                  <option value={form.district}>{form.district} (unrecognised)</option>
                )}
              </SearchableSelect>
              {errors.district && <span className="text-[11px] font-bold text-rose-600">{errors.district}</span>}
            </label>
          </div>
          {field('village', 'Village / Town', { required: true, placeholder: 'Deir El Qamar' })}
          {field('exactAddress', 'Exact Address / Building', { placeholder: 'Main Square, Bldg 4' })}
          {field('contactPhone', 'WhatsApp Phone', { mono: true, placeholder: '+961 70 123 456', type: 'tel' })}
          {field('contactEmail', 'Seller Gmail / Email', { placeholder: 'artisan@gmail.com', type: 'email' })}
          <label className="flex items-start gap-2 text-sm font-bold">
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="mt-0.5" />
            <span>Active Storefront <span className="font-medium text-slate-500">(products visible to customers)</span></span>
          </label>

          <details className="rounded-2xl border border-slate-200 p-3">
            <summary className="text-xs font-black text-slate-700 cursor-pointer">Additional details</summary>
            <div className="mt-3 space-y-3">
              {field('commissionPct', 'Commission %', { mono: true, placeholder: '10' })}
              {field('craftCategory', 'Craft Category')}
              {field('region', 'Regional Code')}
              {field('logoUrl', 'Logo URL')}
              {field('bannerImage', 'Banner Image URL')}
              <label className="block"><span className="text-xs font-black text-slate-700">Workshop story — English</span>
                <textarea value={form.bioEn} onChange={e => set('bioEn', e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" /></label>
              <label className="block"><span className="text-xs font-black text-slate-700">Workshop story — Arabic</span>
                <textarea dir="rtl" value={form.bioAr} onChange={e => set('bioAr', e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-right" /></label>
            </div>
          </details>

          {failure && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{failure}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-60">
              {saving ? 'Saving…' : isCreate ? 'Create Seller' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Delete & reassign modal ─────────────────────────────────────────────────

const DeleteSellerModal: React.FC<{
  seller: Seller;
  sellers: Seller[];
  linked: number;
  onClose: () => void;
  shop: any;
}> = ({ seller, sellers, linked, onClose, shop }) => {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const { containerRef } = useDialog({ isOpen: true, onClose });
  const others = sellers.filter(s => s.id !== seller.id)
    .sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false) || a.nameEn.localeCompare(b.nameEn));

  const confirmDelete = async () => {
    setBusy(true);
    setFailure('');
    try {
      await shop.deleteSeller(seller.id, linked > 0 ? target : undefined);
      shop.showToast?.(linked > 0 ? `${linked} product(s) moved and ${seller.nameEn} deleted.` : `${seller.nameEn} deleted.`, 'success');
      onClose();
    } catch (e: any) {
      setFailure(e?.message || 'The seller could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={containerRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-seller-title"
        className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600"><AlertTriangle className="w-5 h-5" aria-hidden /></div>
          <div>
            <h3 id="delete-seller-title" className="text-lg font-black">Delete {seller.nameEn}?</h3>
            {linked > 0 ? (
              <p className="text-sm text-slate-600 mt-1">There are {linked} products linked to this seller. Choose a new seller to reassign them to before deletion.</p>
            ) : (
              <p className="text-sm text-slate-600 mt-1">No products are linked to this seller. This cannot be undone.</p>
            )}
          </div>
        </div>

        {linked > 0 && (
          <label className="block mt-4">
            <span className="text-xs font-black text-slate-700">Reassign products to *</span>
            <SearchableSelect value={target} onChange={e => setTarget(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
              <option value="">Choose a seller…</option>
              {others.map(s => <option key={s.id} value={s.id}>{s.sellerCode ? `${s.sellerCode} · ` : ''}{s.nameEn}{s.isActive === false ? ' (inactive)' : ''}</option>)}
            </SearchableSelect>
            {others.length === 0 && <span className="text-[11px] font-bold text-amber-700">Add another seller first — products cannot be left without one.</span>}
          </label>
        )}

        {failure && <p role="alert" className="mt-3 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{failure}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black">Cancel</button>
          <button onClick={confirmDelete} disabled={busy || (linked > 0 && !target)}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black disabled:opacity-50">
            {busy ? 'Working…' : linked > 0 ? 'Reassign & Delete' : 'Delete Seller'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── CSV bulk import / export ────────────────────────────────────────────────

const BulkImportPanel: React.FC<{ shop: any; sellers: Seller[]; products: any[]; categories: any[] }> = ({ shop, sellers, products, categories }) => {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [target, setTarget] = useState('');
  const [fallback, setFallback] = useState('');
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const validate = useCallback((text: string) => {
    setResult(null);
    if (!text.trim()) { setPreview([]); return; }
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() });
    setPreview(previewCsvImport(parsed.data as any[], {
      products, sellers, categories, targetSellerId: target || undefined, fallbackCategoryId: fallback || undefined,
    }));
  }, [products, sellers, categories, target, fallback]);

  // Seller and category resolution depend on the target/fallback pickers.
  useEffect(() => { if (csv) validate(csv); }, [target, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      shop.showToast?.('Choose a .csv file.', 'warning');
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    validate(text);
  };

  const invalid = preview.filter(r => r.issues.length > 0).length;
  const ready = preview.length - invalid;

  const execute = async () => {
    setRunning(true);
    try {
      const r = await shop.bulkImportProducts(csv, { targetSellerId: target || undefined, fallbackCategoryId: fallback || undefined });
      setResult(r);
      shop.showToast?.(`Import finished: ${r.created} created, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} errors` : ''}.`, r.errors.length ? 'warning' : 'success');
    } catch (e: any) {
      shop.showToast?.(e?.message || 'Import failed.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-wrap items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-indigo-600" aria-hidden />
        <h3 className="font-black mr-auto">Templates &amp; exports</h3>
        <button onClick={() => downloadCsv({ fields: [...CSV_TEMPLATE_HEADERS], data: [] }, 'yalla_catalog_template.csv')}
          className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black flex items-center gap-1.5">
          <Download className="w-4 h-4" aria-hidden /> Download Blank CSV Template
        </button>
        <button onClick={() => downloadCsv(catalogExportRows(products), `yalla_full_catalog_${new Date().toISOString().slice(0, 10)}.csv`)}
          className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black flex items-center gap-1.5">
          <Download className="w-4 h-4" aria-hidden /> Export Full Catalog CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <SearchableSelect value={target} onChange={e => setTarget(e.target.value)} aria-label="Target seller" className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="">Seller from each row</option>
            {sellers.map(s => <option key={s.id} value={s.id}>Assign all to {s.sellerCode ? `${s.sellerCode} · ` : ''}{s.nameEn}</option>)}
          </SearchableSelect>
          <SearchableSelect value={fallback} onChange={e => setFallback(e.target.value)} aria-label="Fallback category" className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="">No fallback category</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>Fallback: {c.nameEn}</option>)}
          </SearchableSelect>
        </div>

        <div role="button" tabIndex={0} aria-label="Drop a CSV file here or press Enter to choose one"
          onClick={() => fileInput.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files?.[0]); }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <Upload className="w-7 h-7 mx-auto text-indigo-500" aria-hidden />
          <p className="mt-2 text-sm font-black">{fileName || 'Drag & drop a .csv file'}</p>
          <p className="text-xs text-slate-500">or click to browse</p>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={e => loadFile(e.target.files?.[0])} />
        </div>

        <details>
          <summary className="text-xs font-black text-slate-600 cursor-pointer">…or paste CSV text</summary>
          <textarea value={csv} onChange={e => setCsv(e.target.value)} onBlur={() => validate(csv)}
            placeholder={CSV_TEMPLATE_HEADERS.join(',')} className="mt-2 w-full min-h-32 border border-slate-200 rounded-xl p-3 font-mono text-xs" />
        </details>
      </div>

      {preview.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <p className="text-sm font-black">{ready} ready · <span className={invalid ? 'text-rose-600' : ''}>{invalid} with issues</span></p>
            <button onClick={execute} disabled={running || invalid > 0}
              title={invalid > 0 ? 'Fix the highlighted rows first' : undefined}
              className="ml-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50">
              {running ? 'Importing…' : 'Execute Import'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>{['Row #', 'SKU', 'Product Name', 'Assigned Seller', 'Category', 'Action', 'Issues / Status'].map(h => <th key={h} scope="col" className="p-3 font-black">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map(r => (
                  <tr key={r.row} className={`border-t border-slate-100 ${r.issues.length ? 'bg-rose-50' : ''}`}>
                    <td className="p-3 font-mono">{r.row}</td>
                    <td className="p-3 font-mono">{r.sku || '—'}</td>
                    <td className="p-3">{r.name || '—'}</td>
                    <td className="p-3">{r.seller}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full font-black ${r.action === 'Create' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{r.action}</span></td>
                    <td className="p-3">
                      {r.issues.length === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-black"><Check className="w-3.5 h-3.5" aria-hidden /> Ready</span>
                      ) : (
                        <ul className="text-rose-700 font-bold space-y-0.5">{r.issues.map(i => <li key={i}>{i}</li>)}</ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div role="alert" className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
          <b>{result.errors.length} row(s) were not imported</b>
          <ul className="list-disc ml-5 mt-1">{result.errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
};

export default SellersView;
