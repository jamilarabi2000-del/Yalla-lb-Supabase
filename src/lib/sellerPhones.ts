import type { Seller } from '../types';

/**
 * A seller's phone number is not in the public seller read (RT-8): an administrator (every seller) or a seller (their own)
 * fetches it privately, and it is put on the list in memory only. It is never written to the browser's catalogue cache,
 * and a list that came from the cache or from the public read never carries one.
 */
export const withSellerPhones = (list: Seller[], phones: Record<string, string>): Seller[] =>
  list.map(s => (phones[s.id] ? { ...s, contactPhone: phones[s.id] } : s));

export const withoutSellerPhone = (s: Seller): Seller => {
  if (s.contactPhone === undefined) return s;
  const { contactPhone: _private, ...rest } = s;
  return rest;
};
