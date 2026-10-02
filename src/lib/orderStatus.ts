import type { OrderStatus } from '../types';
import { orderStatusPill } from './customerIndex';

export interface StatusConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red button: the change ends an order rather than moving it along. */
  danger: boolean;
}

/** A change the shop refuses outright; the screen says so at once instead of asking first. */
export const orderStatusBlock = (from: OrderStatus, to: OrderStatus): string | null =>
  from === 'delivered' && to === 'cancelled' ? 'Cannot cancel an order that has already been delivered.' : null;

const FINISHED: OrderStatus[] = ['delivered', 'cancelled', 'returned'];

export const shortOrderId = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

/**
 * The status changes that ask first: a mis-tap on a phone must not cancel an
 * order, close it as delivered, or reopen a finished one. Every other change
 * (the routine steps between pending and in transit, either way) goes through
 * at once, as before. Which changes are allowed at all is the shop owner's call;
 * this only asks "are you sure" and refuses nothing the shop did not already refuse.
 */
export function orderStatusConfirmation(orderId: string, from: OrderStatus, to: OrderStatus): StatusConfirmation | null {
  if (from === to || orderStatusBlock(from, to)) return null;
  const id = `#${shortOrderId(orderId)}`;
  const was = orderStatusPill(from).label;
  const now = orderStatusPill(to).label;

  if (FINISHED.includes(from)) {
    return {
      danger: false,
      title: `Reopen order ${id}?`,
      message: `This order is already ${was}. Moving it back to ${now} reopens it.`,
      confirmLabel: `Move to ${now}`,
      cancelLabel: `Keep as ${was}`,
    };
  }
  if (to === 'cancelled') {
    return {
      danger: true,
      title: `Cancel order ${id}?`,
      message: `The order will be marked Cancelled. Do this only if the customer will not receive it.`,
      confirmLabel: 'Mark as cancelled',
      cancelLabel: `Keep as ${was}`,
    };
  }
  if (to === 'delivered') {
    return {
      danger: false,
      title: `Mark order ${id} as delivered?`,
      message: `The order will be marked Delivered. Do this only once the customer has received it.`,
      confirmLabel: 'Mark as delivered',
      cancelLabel: `Keep as ${was}`,
    };
  }
  return null;
}
