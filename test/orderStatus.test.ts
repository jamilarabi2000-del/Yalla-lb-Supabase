import { describe, it, expect } from 'vitest';
import type { OrderStatus } from '../src/types';
import { orderStatusBlock, orderStatusConfirmation, shortOrderId } from '../src/lib/orderStatus';

// Changing an order's status used to take effect the moment the administrator
// picked it, so a mis-tap on a phone could cancel an order or close it as
// delivered. Those changes now ask first; routine steps do not. Which changes
// are legal at all stays the shop owner's call: the only refusal is the one
// the shop already made (a delivered order cannot be cancelled).
const ALL: OrderStatus[] = ['pending', 'confirmed', 'crafting', 'courier_assigned', 'in_transit', 'delivered', 'cancelled', 'returned'];
const ACTIVE: OrderStatus[] = ['pending', 'confirmed', 'crafting', 'courier_assigned', 'in_transit'];
const FINISHED: OrderStatus[] = ['delivered', 'cancelled', 'returned'];
const ID = '11111111-2222-4333-8444-555555555555';

describe('what is refused outright', () => {
  it('only cancelling a delivered order', () => {
    for (const from of ALL) for (const to of ALL) {
      const refused = orderStatusBlock(from, to);
      if (from === 'delivered' && to === 'cancelled') expect(refused).toBe('Cannot cancel an order that has already been delivered.');
      else expect(refused, `${from} -> ${to}`).toBeNull();
    }
  });

  it('is never asked about: the screen says no at once', () => {
    expect(orderStatusConfirmation(ID, 'delivered', 'cancelled')).toBeNull();
  });
});

describe('which changes ask first', () => {
  it('nothing happens when the status does not change', () => {
    for (const status of ALL) expect(orderStatusConfirmation(ID, status, status)).toBeNull();
  });

  it('routine steps between the active statuses go straight through, in either direction', () => {
    for (const from of ACTIVE) for (const to of ACTIVE) expect(orderStatusConfirmation(ID, from, to), `${from} -> ${to}`).toBeNull();
  });

  it('cancelling an active order asks, in red', () => {
    for (const from of ACTIVE) {
      const ask = orderStatusConfirmation(ID, from, 'cancelled')!;
      expect(ask, from).not.toBeNull();
      expect(ask.danger).toBe(true);
      expect(ask.title).toBe('Cancel order #11111111…?');
      expect(ask.confirmLabel).toBe('Mark as cancelled');
    }
  });

  it('marking an active order delivered asks', () => {
    for (const from of ACTIVE) {
      const ask = orderStatusConfirmation(ID, from, 'delivered')!;
      expect(ask, from).not.toBeNull();
      expect(ask.danger).toBe(false);
      expect(ask.title).toBe('Mark order #11111111… as delivered?');
      expect(ask.message).toContain('only once the customer has received it');
    }
  });

  it('reopening a finished order asks, naming where it was and where it goes', () => {
    for (const from of FINISHED) for (const to of ALL) {
      if (from === to || (from === 'delivered' && to === 'cancelled')) continue;
      const ask = orderStatusConfirmation(ID, from, to)!;
      expect(ask, `${from} -> ${to}`).not.toBeNull();
      expect(ask.danger).toBe(false);
      expect(ask.title).toBe('Reopen order #11111111…?');
      expect(ask.cancelLabel).toMatch(/^Keep as /);
    }
    const ask = orderStatusConfirmation(ID, 'cancelled', 'confirmed')!;
    expect(ask.message).toBe('This order is already Cancelled. Moving it back to Confirmed reopens it.');
    expect(ask.confirmLabel).toBe('Move to Confirmed');
    expect(ask.cancelLabel).toBe('Keep as Cancelled');
  });

  it('a finished order moved on to another finished status still asks as a reopen, not as a plain cancel', () => {
    expect(orderStatusConfirmation(ID, 'returned', 'cancelled')!.title).toBe('Reopen order #11111111…?');
    expect(orderStatusConfirmation(ID, 'cancelled', 'delivered')!.title).toBe('Reopen order #11111111…?');
  });
});

describe('how an order is named in the question', () => {
  it('a long id is cut short, a short one is kept whole', () => {
    expect(shortOrderId(ID)).toBe('11111111…');
    expect(shortOrderId('YL-2026-0042')).toBe('YL-2026-0042');
    expect(shortOrderId('')).toBe('');
  });

  it('the cancel question names the order, the answer buttons name the choice', () => {
    const ask = orderStatusConfirmation('YL-0042', 'in_transit', 'cancelled')!;
    expect(ask.title).toBe('Cancel order #YL-0042?');
    expect(ask.cancelLabel).toBe('Keep as In Transit');
  });
});
