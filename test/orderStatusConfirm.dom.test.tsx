// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The Orders screen and the storefront's block controls changed live data the
// instant a control was used. Cancelling, closing as delivered, reopening an
// order and deleting a block now ask first; routine steps still go straight
// through, and a failed change leaves the order as it was.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
// The real select is a custom list; a native one is enough to drive onChange.
vi.mock('../src/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ value, onChange, children }: any) => <select value={value} onChange={onChange}>{children}</select>,
}));

const { OrdersRoute } = await import('../src/components/admin/routes/OrdersRoute');
const { CustomBlocksRenderer } = await import('../src/components/CustomBlocksRenderer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const order = (id: string, status: string) => ({
  id, status, date: '2026-09-01', items: [{ quantity: 1 }], totalUSD: 20, totalLBP: 0,
  shipping: { fullName: 'Rima', phone: '70123456', city: 'Beirut', governorate: 'Beirut' },
});

let host: HTMLDivElement;
let root: Root;
const render = (node: React.ReactElement) => act(async () => { root.render(node); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const choose = (select: HTMLSelectElement, value: string) => act(async () => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
const rowSelect = (nth = 0) => host.querySelectorAll<HTMLSelectElement>('tbody select')[nth];
// The confirmation, not the order inspector (which is a dialog too).
const dialog = () => host.querySelector('[aria-labelledby="confirm-modal-title"]');
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (b: HTMLButtonElement | undefined) => act(async () => { b!.click(); });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, {
    hasMoreOrders: false, isLoadingMoreOrders: false, loadMoreOrders: vi.fn(),
    updateOrderStatus: vi.fn(async () => {}), formatPrice: (n: number) => `$${n}`, showToast: vi.fn(), logAdminActivity: vi.fn(),
    orders: [order('ord-1', 'pending')],
    // storefront block controls
    siteContent: { customBlocks: [{ id: 'b1', title: 'Summer sale', targetPage: 'all', position: 'top', order: 1, isPublished: true }] },
    siteContentReady: true, isAdminUnlocked: true, isVisualEditMode: false,
    setActiveTab: vi.fn(), setSelectedCategory: vi.fn(), deleteCustomBlock: vi.fn(async () => {}), setCustomBlockToEdit: vi.fn(), setIsCustomBlockModalOpen: vi.fn(),
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('changing an order\'s status', () => {
  it('a routine step goes straight through, with no question and no second toast', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'confirmed');
    expect(dialog()).toBeNull();
    expect(shop.updateOrderStatus).toHaveBeenCalledWith('ord-1', 'confirmed');
    expect(shop.showToast).not.toHaveBeenCalled();   // updateOrderStatus already reports success
  });

  it('cancelling asks first and changes nothing until confirmed', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'cancelled');
    expect(dialog()?.textContent).toContain('Cancel order #ord-1?');
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
    expect(rowSelect().value).toBe('pending');          // the screen still shows the real status
  });

  it('"Keep as Pending" closes the question and leaves the order alone', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'cancelled');
    await click(button('Keep as Pending'));
    expect(dialog()).toBeNull();
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
    expect(rowSelect().value).toBe('pending');
  });

  it('confirming makes the one change', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'cancelled');
    await click(button('Mark as cancelled'));
    await flush();
    expect(shop.updateOrderStatus).toHaveBeenCalledTimes(1);
    expect(shop.updateOrderStatus).toHaveBeenCalledWith('ord-1', 'cancelled');
    expect(dialog()).toBeNull();
  });

  it('marking an order delivered asks', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'delivered');
    expect(dialog()?.textContent).toContain('Mark order #ord-1 as delivered?');
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('reopening a finished order asks, naming both statuses', async () => {
    shop.orders = [order('ord-2', 'delivered')];
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'in_transit');
    expect(dialog()?.textContent).toContain('Reopen order #ord-2?');
    expect(dialog()?.textContent).toContain('This order is already Delivered. Moving it back to In Transit reopens it.');
    await click(button('Move to In Transit'));
    await flush();
    expect(shop.updateOrderStatus).toHaveBeenCalledWith('ord-2', 'in_transit');
  });

  it('cancelling a delivered order is refused at once, without a question', async () => {
    shop.orders = [order('ord-2', 'delivered')];
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'cancelled');
    expect(dialog()).toBeNull();
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
    expect(shop.showToast).toHaveBeenCalledWith('Cannot cancel an order that has already been delivered.', 'warning');
  });

  it('a failed change is not an unhandled error, and the screen keeps the real status', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      shop.updateOrderStatus = vi.fn(async () => { throw new Error('write rejected'); });
      await render(<OrdersRoute />);
      await choose(rowSelect(), 'confirmed');
      await flush();
      await new Promise(r => setTimeout(r, 20));
      expect(shop.updateOrderStatus).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
      expect(rowSelect().value).toBe('pending');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('choosing the status the order already has does nothing', async () => {
    await render(<OrdersRoute />);
    await choose(rowSelect(), 'pending');
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});

describe('the status control inside the order inspector', () => {
  const open = async () => { await render(<OrdersRoute />); await click(button('Inspect')); };
  const inspectorSelect = () => host.querySelector<HTMLSelectElement>('.fixed select')!;

  it('asks the same way, and the inspector shows the new status only after the change succeeds', async () => {
    await open();
    await choose(inspectorSelect(), 'cancelled');
    expect(dialog()?.textContent).toContain('Cancel order #ord-1?');
    expect(shop.updateOrderStatus).not.toHaveBeenCalled();
    expect(inspectorSelect().value).toBe('pending');
    await click(button('Mark as cancelled'));
    await flush();
    expect(shop.updateOrderStatus).toHaveBeenCalledWith('ord-1', 'cancelled');
    expect(inspectorSelect().value).toBe('cancelled');
  });

  it('keeps the old status in the inspector when the change fails', async () => {
    shop.updateOrderStatus = vi.fn(async () => { throw new Error('write rejected'); });
    await open();
    await choose(inspectorSelect(), 'confirmed');
    await flush();
    expect(inspectorSelect().value).toBe('pending');
  });
});

describe('deleting a custom block from the storefront', () => {
  it('asks first, naming the block, and deletes nothing yet', async () => {
    await render(<CustomBlocksRenderer page="home" position="top" />);
    await click(host.querySelector('button[title^="Delete"]') as HTMLButtonElement);
    expect(dialog()?.textContent).toContain('Delete this block?');
    expect(dialog()?.textContent).toContain('"Summer sale" will be removed from the live storefront.');
    expect(shop.deleteCustomBlock).not.toHaveBeenCalled();
  });

  it('"Keep block" leaves it alone', async () => {
    await render(<CustomBlocksRenderer page="home" position="top" />);
    await click(host.querySelector('button[title^="Delete"]') as HTMLButtonElement);
    await click(button('Keep block'));
    expect(dialog()).toBeNull();
    expect(shop.deleteCustomBlock).not.toHaveBeenCalled();
  });

  it('confirming deletes that block once; a failure is not an unhandled error', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      shop.deleteCustomBlock = vi.fn(async () => { throw new Error('delete rejected'); });
      await render(<CustomBlocksRenderer page="home" position="top" />);
      await click(host.querySelector('button[title^="Delete"]') as HTMLButtonElement);
      await click(button('Delete block'));
      await flush();
      await new Promise(r => setTimeout(r, 20));
      expect(shop.deleteCustomBlock).toHaveBeenCalledTimes(1);
      expect(shop.deleteCustomBlock).toHaveBeenCalledWith('b1');
      expect(unhandled).toEqual([]);
      expect(dialog()).toBeNull();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
