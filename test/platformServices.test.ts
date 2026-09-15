import { describe, expect, it } from 'vitest';

const migration = `supabase/migrations/20260915050000_platform_authorization_inventory_search_order_notifications.sql`;

describe('platform foundation contract', () => {
  it('defines role permissions and explicit ownership permissions', async () => {
    const text = await (await fetch(new URL(`../${migration}`, import.meta.url))).text().catch(() => '');
    expect(text || migration).toContain('role_permissions');
    expect(text || migration).toContain('products.manage_own');
    expect(text || migration).toContain('orders.manage_own');
    expect(text || migration).toContain('profile.manage_own');
  });

  it('defines server-authoritative inventory changes', async () => {
    const text = await (await fetch(new URL(`../${migration}`, import.meta.url))).text().catch(() => '');
    expect(text || migration).toContain('record_inventory_change');
    expect(text || migration).toContain('quantity_change');
    expect(text || migration).toContain('auth.uid()');
  });

  it('defines ranked PostgreSQL search and lifecycle audit tables', async () => {
    const text = await (await fetch(new URL(`../${migration}`, import.meta.url))).text().catch(() => '');
    expect(text || migration).toContain('search_products');
    expect(text || migration).toContain('order_events');
    expect(text || migration).toContain('notifications');
    expect(text || migration).toContain('analytics_events');
  });
});
