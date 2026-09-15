import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260915050000_platform_authorization_inventory_search_order_notifications.sql'), 'utf8');

describe('platform foundation contract', () => {
  it('defines role permissions and explicit ownership permissions', () => {
    expect(migration).toContain('role_permissions');
    expect(migration).toContain('products.manage_own');
    expect(migration).toContain('orders.manage_own');
    expect(migration).toContain('profile.manage_own');
  });

  it('defines server-authoritative inventory changes', () => {
    expect(migration).toContain('record_inventory_change');
    expect(migration).toContain('quantity_change');
    expect(migration).toContain('auth.uid()');
  });

  it('defines ranked PostgreSQL search and lifecycle audit tables', () => {
    expect(migration).toContain('search_products');
    expect(migration).toContain('order_events');
    expect(migration).toContain('notifications');
    expect(migration).toContain('analytics_events');
  });
});
