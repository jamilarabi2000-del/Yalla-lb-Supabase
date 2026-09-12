import { Order, UserProfile } from '../types';

export interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  governorate: string | null;
  city: string | null;
  street: string | null;
  ordersCount: number;
  totalSpentUSD: number;
  lastOrderDate: string | null;
  recentOrders: Order[];
}

/** Single keying strategy, single set of null-safe fallbacks. */
export function buildCustomerIndex(
  users: (UserProfile & { uid?: string })[],
  orders: Order[]
): Map<string, CustomerRecord> {
  const getCleanKey = (u: { uid?: string; phone?: string | null; email?: string | null; id?: string }) => {
    if (u.uid && u.uid.trim() && u.uid !== 'guest-user') return u.uid.trim();
    if (u.email && u.email.trim()) return u.email.trim().toLowerCase();
    if (u.phone && u.phone.trim()) return u.phone.trim();
    if (u.id && u.id.trim()) return u.id.trim();
    return null;
  };

  const index = new Map<string, CustomerRecord>();

  for (const u of users) {
    if (!u) continue;
    const k = getCleanKey(u);
    if (!k) continue;

    index.set(k, {
      id: u.uid || k,
      name: u.name?.trim() || (u.email ? u.email.split('@')[0] : 'Registered Shopper'),
      email: u.email?.trim() || null,
      phone: u.phone?.trim() || null,
      governorate: u.defaultGovernorate || null,
      city: u.defaultCity || null,
      street: u.defaultAddress || null,
      ordersCount: 0,
      totalSpentUSD: 0,
      lastOrderDate: null,
      recentOrders: [],
    });
  }

  for (const o of orders) {
    if (!o) continue;
    const k = getCleanKey({ uid: o.userId, phone: o.shipping?.phone, email: o.shipping?.email, id: o.id }) || `order-${o.id}`;
    const existing = index.get(k);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalSpentUSD += (typeof o.totalUSD === 'number' ? o.totalUSD : 0);
      existing.recentOrders.push(o);
      if (!existing.lastOrderDate || o.date > existing.lastOrderDate) {
        existing.lastOrderDate = o.date;
      }
      if (existing.name === 'Registered Shopper' || existing.name === 'Anonymous Shopper' || existing.name === 'Guest Shopper') {
        if (o.shipping?.fullName && o.shipping.fullName.trim()) {
          existing.name = o.shipping.fullName.trim();
        }
      }
      if (!existing.phone && o.shipping?.phone) existing.phone = o.shipping.phone.trim();
      if (!existing.email && o.shipping?.email) existing.email = o.shipping.email.trim();
      if (!existing.city && o.shipping?.city) existing.city = o.shipping.city.trim();
      if (!existing.governorate && o.shipping?.governorate) existing.governorate = o.shipping.governorate.trim();
      if (!existing.street && o.shipping?.street) existing.street = o.shipping.street.trim();
    } else {
      index.set(k, {
        id: k,
        name: o.shipping?.fullName?.trim() || 'Guest Shopper',
        email: o.shipping?.email?.trim() || null,
        phone: o.shipping?.phone?.trim() || null,
        governorate: o.shipping?.governorate || null,
        city: o.shipping?.city || null,
        street: o.shipping?.street || null,
        ordersCount: 1,
        totalSpentUSD: typeof o.totalUSD === 'number' ? o.totalUSD : 0,
        lastOrderDate: o.date,
        recentOrders: [o],
      });
    }
  }

  return index;
}
