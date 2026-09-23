import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCustomerIndex,
  customerCsvRows,
  customerGreeting,
  customerInitials,
  customerRegionLabel,
  customerWhatsAppHref,
  customerWhatsAppNumber,
  filterCustomers,
  orderStatusPill,
  type CustomerProfileRow,
  type OrderLedgerRow,
} from '../src/lib/customerIndex';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const profile = (over: Partial<CustomerProfileRow> = {}): CustomerProfileRow => ({
  id: 'u-1', email: 'jamil@example.com', name: 'Jamil Arabi', phone: '+961 70 123 456', role: 'customer',
  default_city: 'Achrafieh', default_governorate: 'beirut', created_at: '2026-05-01T10:00:00Z', ...over,
});

const order = (over: Partial<OrderLedgerRow> = {}): OrderLedgerRow => ({
  user_id: 'u-1', total_usd: 10, status: 'delivered', created_at: '2026-05-10T10:00:00Z', ...over,
});

describe('buildCustomerIndex', () => {
  it('counts every order in the ledger, not a page of it', () => {
    // The context holds admins the newest 50 orders; the ledger holds all.
    const ledger = Array.from({ length: 120 }, (_, i) =>
      order({ total_usd: 1.5, created_at: `2026-05-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z` }));
    const [c] = buildCustomerIndex([profile()], ledger);
    expect(c.ordersCount).toBe(120);
    expect(c.totalSpentUSD).toBe(180);
  });

  it('leaves cancelled and returned orders out of lifetime value, as revenue does', () => {
    const [c] = buildCustomerIndex([profile()], [
      order({ total_usd: 40, status: 'delivered', created_at: '2026-05-01T00:00:00Z' }),
      order({ total_usd: 25, status: 'cancelled', created_at: '2026-05-03T00:00:00Z' }),
      order({ total_usd: 15, status: 'returned', created_at: '2026-05-02T00:00:00Z' }),
      order({ total_usd: 5, status: 'pending', created_at: '2026-04-01T00:00:00Z' }),
    ]);
    expect(c.ordersCount).toBe(2);
    expect(c.totalSpentUSD).toBe(45);
    expect(c.allOrdersCount).toBe(4);
    // Last activity is the latest order of any kind.
    expect(c.lastOrderDate).toBe('2026-05-03T00:00:00Z');
  });

  it('sums in cents, so totals do not drift', () => {
    const [c] = buildCustomerIndex([profile()], [order({ total_usd: 0.1 }), order({ total_usd: '0.2' })]);
    expect(c.totalSpentUSD).toBe(0.3);
  });

  it('falls back through name, first and last name, delivery name and email', () => {
    const name = (p: Partial<CustomerProfileRow>, ship?: string) =>
      buildCustomerIndex([profile(p)], ship ? [order({ ship_name: ship })] : [])[0].name;
    expect(name({})).toBe('Jamil Arabi');
    expect(name({ name: '', first_name: 'Layla', last_name: 'K.' })).toBe('Layla K.');
    expect(name({ name: null, first_name: null, last_name: null }, 'Karim N.')).toBe('Karim N.');
    expect(name({ name: null, first_name: null })).toBe('jamil');
    expect(name({ name: null, first_name: null, email: null })).toBe('Unnamed customer');
  });

  it('takes the location and phone from the latest delivery when the profile has none', () => {
    const [c] = buildCustomerIndex([profile({ default_city: null, default_governorate: null, phone: null })], [
      order({ ship_city: 'Tripoli', ship_governorate: 'north', ship_phone: '03 987 654', created_at: '2026-05-09T00:00:00Z' }),
      order({ ship_city: 'Zahle', ship_governorate: 'bekaa', created_at: '2026-04-01T00:00:00Z' }),
    ]);
    expect([c.city, c.governorate, c.phone]).toEqual(['Tripoli', 'north', '03 987 654']);
  });

  it('lists staff only once they have bought something', () => {
    const index = buildCustomerIndex(
      [profile(), profile({ id: 'admin', role: 'admin' }), profile({ id: 'seller', role: 'seller' })],
      [order({ user_id: 'seller' })],
    );
    expect(index.map(c => [c.id, c.role])).toEqual([['seller', 'seller'], ['u-1', 'customer']]);
  });

  it('leaves out orders whose account was deleted', () => {
    const index = buildCustomerIndex([profile()], [order({ user_id: null, ship_name: 'Former customer' })]);
    expect(index).toHaveLength(1);
    expect(index[0].ordersCount).toBe(0);
  });

  it('puts the most recent buyers first, then the newest accounts', () => {
    const index = buildCustomerIndex(
      [profile({ id: 'a', created_at: '2026-01-01T00:00:00Z' }), profile({ id: 'b', created_at: '2026-03-01T00:00:00Z' }),
        profile({ id: 'c', created_at: '2026-02-01T00:00:00Z' })],
      [order({ user_id: 'a', created_at: '2026-05-01T00:00:00Z' })],
    );
    expect(index.map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('WhatsApp', () => {
  it('accepts Lebanese mobiles in any local form', () => {
    expect(customerWhatsAppNumber('+961 70 123 456')).toBe('96170123456');
    expect(customerWhatsAppNumber('70123456')).toBe('96170123456');
    expect(customerWhatsAppNumber('03 123 456')).toBe('9613123456');
  });

  it('refuses Lebanese landlines, which have no WhatsApp', () => {
    expect(customerWhatsAppNumber('+961 1 234 567')).toBeNull();
    expect(customerWhatsAppNumber('01 234 567')).toBeNull();
  });

  it('accepts diaspora numbers written in international form only', () => {
    expect(customerWhatsAppNumber('+1 416 555 0199')).toBe('14165550199');
    expect(customerWhatsAppNumber('0044 20 7946 0958')).toBe('442079460958');
    expect(customerWhatsAppNumber('4165550199')).toBeNull();
    expect(customerWhatsAppNumber('')).toBeNull();
    expect(customerWhatsAppNumber(null)).toBeNull();
  });

  it('greets the customer by first name in the pre-filled message', () => {
    expect(customerGreeting('Jamil Arabi')).toBe('Marhaba Jamil! This is Yalla.lb Merchant Support.');
    const href = customerWhatsAppHref('+961 70 123 456', customerGreeting('Jamil Arabi'));
    expect(href).toBe('https://wa.me/96170123456?text=Marhaba%20Jamil!%20This%20is%20Yalla.lb%20Merchant%20Support.');
    expect(customerWhatsAppHref('01 234 567', 'x')).toBeUndefined();
  });
});

describe('display helpers', () => {
  it('makes two-letter initials, including Arabic names', () => {
    expect(customerInitials('Jamil Arabi')).toBe('JA');
    expect(customerInitials('jamil')).toBe('JA');
    expect(customerInitials('جميل عربي')).toBe('جع');
    expect(customerInitials('  ')).toBe('?');
  });

  it('labels checkout region ids and governorate ids', () => {
    expect(customerRegionLabel('beirut')).toBe('Beirut');
    expect(customerRegionLabel('diaspora_global')).toBe('International / Diaspora Express');
    expect(customerRegionLabel('mount_lebanon')).toBe('Mount Lebanon');
    expect(customerRegionLabel('akkar')).toBe('Akkar');
    expect(customerRegionLabel('Somewhere')).toBe('Somewhere');
    expect(customerRegionLabel(null)).toBe('');
  });

  it('colours statuses like the Orders screen, with returned beside cancelled', () => {
    expect(orderStatusPill('delivered').className).toContain('emerald');
    expect(orderStatusPill('courier_assigned')).toEqual({ label: 'Courier Assigned', className: expect.stringContaining('blue') });
    expect(orderStatusPill('returned').className).toContain('rose');
    expect(orderStatusPill('pending').className).toContain('amber');
  });
});

describe('search and export', () => {
  const index = buildCustomerIndex([
    profile(),
    profile({ id: 'u-2', name: 'Layla K.', email: 'layla@example.com', phone: '+961 3 987 654',
      default_city: 'Tripoli', default_governorate: 'north' }),
  ], [order({ total_usd: 12.3 })]);
  const ids = (q: string) => filterCustomers(index, q).map(c => c.id);

  it('finds by name, email, city and region', () => {
    expect(ids('layla')).toEqual(['u-2']);
    expect(ids('JAMIL@')).toEqual(['u-1']);
    expect(ids('tripoli')).toEqual(['u-2']);
    expect(ids('north lebanon')).toEqual(['u-2']);
  });

  it('finds by phone digits however the number was typed', () => {
    expect(ids('70123456')).toEqual(['u-1']);
    expect(ids('03 987 654')).toEqual(['u-2']);
    // A stray digit in a text query does not match every phone containing it.
    expect(ids('Apt 4')).toEqual([]);
  });

  it('exports money with two decimals and dates without time', () => {
    const [row] = customerCsvRows(index.filter(c => c.id === 'u-1'));
    expect(row).toMatchObject({ lifetime_spend_usd: '12.30', last_order_date: '2026-05-10', joined: '2026-05-01',
      governorate: 'Beirut', orders: 1 });
  });
});

describe('wiring', () => {
  it('the directory builds from the full ledger and every profile, not the context', () => {
    const view = stripTs(read('src/components/admin/CustomersView.tsx'));
    expect(view).toContain('supabaseOrderService.fetchOrderLedger()');
    expect(view).toContain('supabaseUserDataService.listProfilesForDirectory()');
    expect(view).not.toMatch(/useShop\(/);
    expect(stripTs(read('src/components/AdminView.tsx'))).toContain('<CustomersView />');
  });

  it('the ledger pages to the end and reads four delivery fields, not the address', () => {
    const svc = stripTs(read('src/services/supabaseOrderService.ts'));
    const ledger = svc.slice(svc.indexOf('async fetchOrderLedger'), svc.indexOf('async fetchOrdersForUser'));
    const select = ledger.match(/\.select\('([^']+)'\)/)?.[1] ?? '';
    const columns = select.split(',').map(c => c.trim());
    expect(columns.filter(c => c.includes('shipping'))).toEqual([
      'ship_name:shipping->>full_name', 'ship_phone:shipping->>phone',
      'ship_city:shipping->>city', 'ship_governorate:shipping->>governorate']);
    expect(ledger).toMatch(/\.range\(from, from \+ PAGE - 1\)/);
    expect(ledger).toMatch(/if \(!data \|\| data\.length < PAGE\) return rows;/);
  });
});
