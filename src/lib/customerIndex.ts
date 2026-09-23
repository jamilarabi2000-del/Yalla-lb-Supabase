/**
 * The admin Customers Directory's index: profiles cross-referenced with every
 * order, kept pure so it can be tested without React or a database.
 */
import { LEBANON_REGIONS } from '../data/regions';
import { governorateLabel, isValidLbMobile, normalizeLbWhatsApp } from './sellerAdmin';

/** A row from public.profiles, as the directory reads it. */
export interface CustomerProfileRow {
  id: string;
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  role?: string | null;
  default_city?: string | null;
  default_governorate?: string | null;
  created_at?: string | null;
}

/**
 * The slice of an order the index needs. It covers every order: the context
 * only loads admins the newest 50, so totals built from that page would stop
 * being lifetime values as soon as the shop passed 50 orders.
 */
export interface OrderLedgerRow {
  user_id: string | null;
  total_usd: number | string | null;
  status: string;
  created_at: string;
  ship_name?: string | null;
  ship_phone?: string | null;
  ship_city?: string | null;
  ship_governorate?: string | null;
}

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'seller' | 'admin';
  city: string;
  /** Region id as stored at checkout, e.g. 'mount_lebanon'. */
  governorate: string;
  /** Orders that count as sales -- not cancelled or returned. */
  ordersCount: number;
  totalSpentUSD: number;
  /** Every order placed, whatever became of it. */
  allOrdersCount: number;
  lastOrderDate: string | null;
  joinedAt: string | null;
}

/** Excluded from lifetime value, as they are from revenue everywhere else in the admin. */
export const NOT_COUNTED_STATUSES = ['cancelled', 'returned'];

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function buildCustomerIndex(
  profiles: CustomerProfileRow[],
  ledger: OrderLedgerRow[],
  opts: { includeStaff?: boolean } = {},
): CustomerRecord[] {
  const byUser = new Map<string, OrderLedgerRow[]>();
  for (const order of ledger) {
    // Checkout requires an account, so an order loses its user only when the
    // account is deleted (orders.user_id is ON DELETE SET NULL). A directory
    // for contacting customers leaves those people out.
    if (!order.user_id) continue;
    const list = byUser.get(order.user_id);
    if (list) list.push(order);
    else byUser.set(order.user_id, [order]);
  }

  const records: CustomerRecord[] = [];
  for (const p of profiles) {
    const orders = (byUser.get(p.id) ?? [])
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const role = p.role === 'admin' ? 'admin' : p.role === 'seller' ? 'seller' : 'customer';
    // Staff accounts belong in the directory only once they have bought
    // something; resolving a cart's owner needs every account.
    if (!opts.includeStaff && role !== 'customer' && orders.length === 0) continue;

    const counted = orders.filter(o => !NOT_COUNTED_STATUSES.includes(o.status));
    // Summed in cents: adding dollar floats drifts (0.1 + 0.2).
    const cents = counted.reduce((sum, o) => sum + Math.round((Number(o.total_usd) || 0) * 100), 0);
    const latest = orders[0];

    records.push({
      id: p.id,
      name: clean(p.name)
        || [clean(p.first_name), clean(p.last_name)].filter(Boolean).join(' ')
        || clean(latest?.ship_name)
        || clean(p.email).split('@')[0]
        || 'Unnamed customer',
      email: clean(p.email),
      phone: clean(p.phone) || clean(latest?.ship_phone),
      role,
      // Profile defaults first; the latest delivery address otherwise.
      city: clean(p.default_city) || clean(latest?.ship_city),
      governorate: clean(p.default_governorate) || clean(latest?.ship_governorate),
      ordersCount: counted.length,
      totalSpentUSD: cents / 100,
      allOrdersCount: orders.length,
      lastOrderDate: latest?.created_at ?? null,
      joinedAt: p.created_at ?? null,
    });
  }

  return records.sort((a, b) =>
    String(b.lastOrderDate ?? '').localeCompare(String(a.lastOrderDate ?? ''))
    || String(b.joinedAt ?? '').localeCompare(String(a.joinedAt ?? '')));
}

export function customerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('');
  return letters.toUpperCase();
}

/**
 * Digits for a wa.me link, or null when the number cannot receive WhatsApp.
 * Lebanese mobiles in any local form; international numbers only when written
 * with + or 00, since a bare foreign number is ambiguous. A Lebanese landline
 * is refused -- it has no WhatsApp.
 */
export function customerWhatsAppNumber(phone?: string | null): string | null {
  const raw = clean(phone);
  if (!raw) return null;
  if (isValidLbMobile(raw)) return normalizeLbWhatsApp(raw).slice(1);
  if (!/^(\+|00)/.test(raw)) return null;
  const digits = raw.replace(/^00/, '').replace(/[^0-9]/g, '');
  if (digits.startsWith('961')) return null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function customerWhatsAppHref(phone: string | null | undefined, message: string): string | undefined {
  const digits = customerWhatsAppNumber(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : undefined;
}

export function customerGreeting(name: string): string {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return `Marhaba ${first}! This is Yalla.lb Merchant Support.`;
}

/** 'mount_lebanon' -> 'Mount Lebanon'; checkout's region ids first, then governorates. */
export function customerRegionLabel(id?: string | null): string {
  const value = clean(id);
  if (!value) return '';
  const region = LEBANON_REGIONS.find(r => r.id === value);
  return region ? region.nameEn.replace(/\s*\([^)]*\)\s*$/, '') : governorateLabel(value);
}

export function customerLocation(c: Pick<CustomerRecord, 'city' | 'governorate'>): string {
  return [c.city, customerRegionLabel(c.governorate)].filter(Boolean).join(', ');
}

/** Name, email, city or region -- and phone by digits, so '70123456' finds '+961 70 123 456'. */
export function filterCustomers(records: CustomerRecord[], query: string): CustomerRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  const qDigits = q.replace(/[^0-9]/g, '');
  return records.filter(c => {
    const text = [c.name, c.email, c.city, customerRegionLabel(c.governorate), c.phone];
    if (text.some(v => v && v.toLowerCase().includes(q))) return true;
    if (qDigits.length < 3) return false;
    const phoneDigits = c.phone.replace(/[^0-9]/g, '');
    return phoneDigits.includes(qDigits)
      || (qDigits.startsWith('0') && phoneDigits.includes(qDigits.slice(1)));
  });
}

export function customerCsvRows(records: CustomerRecord[]) {
  return records.map(c => ({
    name: c.name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    governorate: customerRegionLabel(c.governorate),
    orders: c.ordersCount,
    lifetime_spend_usd: c.totalSpentUSD.toFixed(2),
    all_orders_including_cancelled: c.allOrdersCount,
    last_order_date: c.lastOrderDate ? c.lastOrderDate.slice(0, 10) : '',
    joined: c.joinedAt ? c.joinedAt.slice(0, 10) : '',
    account_type: c.role,
  }));
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', crafting: 'Crafting', courier_assigned: 'Courier Assigned',
  in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};

/** Same colours as the Orders screen; returned is grouped with cancelled since neither counts. */
export function orderStatusPill(status: string): { label: string; className: string } {
  const label = STATUS_LABELS[status] ?? status;
  if (status === 'delivered') return { label, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (NOT_COUNTED_STATUSES.includes(status)) return { label, className: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (status === 'in_transit' || status === 'courier_assigned') return { label, className: 'bg-blue-50 text-blue-700 border-blue-200' };
  return { label, className: 'bg-amber-50 text-amber-700 border-amber-200' };
}
