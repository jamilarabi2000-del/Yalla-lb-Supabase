import { describe, it, expect } from 'vitest';
import { stockOf, remainingStock, planAdd, quantityInBasket } from '../src/lib/cartQuantity';
import { addedLimitedMessage, allInBasketMessage, stockNoteMessage } from '../src/lib/shopperMessages';

// A shopper asked for 2, then 3, of a product with 1 in stock, and the basket held 1: Quick View had let them choose more
// than there was, and said "Added 3 to your basket". These are the rules that now decide, in one place.
describe('stock as a number', () => {
  it('is a whole number of at least 0, and anything unreadable is none', () => {
    expect(stockOf({ stock: 7 })).toBe(7);
    expect(stockOf({ stock: '4' })).toBe(4);
    expect(stockOf({ stock: 3.9 })).toBe(3);
    for (const stock of [0, -2, NaN, null, undefined, 'many', {}]) expect(stockOf({ stock }), String(stock)).toBe(0);
    expect(stockOf(null)).toBe(0);
    expect(stockOf(undefined)).toBe(0);
  });

  it('what is left is stock minus what is in the basket, never below 0', () => {
    expect(remainingStock(5, 2)).toBe(3);
    expect(remainingStock(5, 5)).toBe(0);
    expect(remainingStock(1, 3)).toBe(0);
    expect(remainingStock(5, -4)).toBe(5);
  });
});

describe('adding to the basket', () => {
  it('adds all that was asked for when there is enough', () => {
    expect(planAdd(10, 0, 3)).toEqual({ status: 'added', stock: 10, added: 3, total: 3 });
    expect(planAdd(10, 4, 6)).toEqual({ status: 'added', stock: 10, added: 6, total: 10 });
  });

  it('with 1 in stock, asking for 2 or 3 adds 1 and says it was limited', () => {
    expect(planAdd(1, 0, 2)).toEqual({ status: 'limited', stock: 1, added: 1, total: 1 });
    expect(planAdd(1, 0, 3)).toEqual({ status: 'limited', stock: 1, added: 1, total: 1 });
  });

  it('adds only what is left when some are already in the basket', () => {
    expect(planAdd(10, 9, 2)).toEqual({ status: 'limited', stock: 10, added: 1, total: 10 });
  });

  it('adds nothing, and says so, when everything in stock is already in the basket', () => {
    expect(planAdd(1, 1, 3)).toEqual({ status: 'at-limit', stock: 1, added: 0, total: 1 });
    expect(planAdd(4, 4, 1)).toEqual({ status: 'at-limit', stock: 4, added: 0, total: 4 });
  });

  it('brings a line that grew past the stock (it dropped after the shopper added) back to the stock', () => {
    expect(planAdd(1, 3, 1)).toEqual({ status: 'at-limit', stock: 1, added: 0, total: 1 });
  });

  it('adds nothing when there is none', () => {
    for (const stock of [0, -1]) expect(planAdd(stock, 0, 2).status).toBe('out-of-stock');
    expect(planAdd(0, 2, 1)).toEqual({ status: 'out-of-stock', stock: 0, added: 0, total: 0 });
  });

  it('treats a missing, zero, negative, fractional or unreadable quantity as 1 or its whole part', () => {
    expect(planAdd(10, 0, 0).added).toBe(1);
    expect(planAdd(10, 0, -3).added).toBe(1);
    expect(planAdd(10, 0, NaN).added).toBe(1);
    expect(planAdd(10, 0, 2.9).added).toBe(2);
    expect(planAdd(10, 0, undefined as unknown as number).added).toBe(1);
  });

  it('never lets the line go past the stock, whatever was asked', () => {
    for (let stock = 0; stock <= 6; stock++) for (let inBasket = 0; inBasket <= 8; inBasket++) for (const asked of [1, 2, 3, 9]) {
      const plan = planAdd(stock, inBasket, asked);
      expect(plan.total, `${stock}/${inBasket}/${asked}`).toBeLessThanOrEqual(stock);
      expect(plan.added, `${stock}/${inBasket}/${asked}`).toBeLessThanOrEqual(asked);
    }
  });
});

describe('the basket line', () => {
  const cart = [
    { product: { id: 'a' }, quantity: 2 },
    { product: { id: 'a' }, quantity: 5, selectedOption: '500 g' },
    { product: { id: 'b' }, quantity: 1 },
  ];
  it('is found by product and option', () => {
    expect(quantityInBasket(cart, 'a')).toBe(2);
    expect(quantityInBasket(cart, 'a', '500 g')).toBe(5);
    expect(quantityInBasket(cart, 'b')).toBe(1);
  });
  it('is 0 when there is none', () => {
    expect(quantityInBasket(cart, 'c')).toBe(0);
    expect(quantityInBasket(cart, 'b', '1 kg')).toBe(0);
    expect(quantityInBasket([], 'a')).toBe(0);
  });
});

describe('what the shopper is told', () => {
  const zaatar = { name: 'Wild Zaatar (500 g)', arabicName: 'زعتر بري (٥٠٠ غ)' };

  it('says how many were added and why not more, once, in English', () => {
    expect(addedLimitedMessage(zaatar, 1, 1, 1, 'en')).toBe('Only 1 of "Wild Zaatar" in stock: 1 added, 1 in your basket.');
    expect(addedLimitedMessage(zaatar, 1, 10, 10, 'en')).toBe('Only 10 of "Wild Zaatar" in stock: 1 added, 10 in your basket.');
  });
  it('and in Arabic, with the Arabic name', () => {
    expect(addedLimitedMessage(zaatar, 1, 1, 1, 'ar')).toBe('المتوفر 1 فقط من "زعتر بري": تمت إضافة 1، ولديك 1 في السلة.');
  });
  it('puts each number where it belongs (distinct values, so a swap shows)', () => {
    expect(addedLimitedMessage(zaatar, 2, 9, 7, 'en')).toBe('Only 9 of "Wild Zaatar" in stock: 2 added, 7 in your basket.');
    expect(addedLimitedMessage(zaatar, 2, 9, 7, 'ar')).toBe('المتوفر 9 فقط من "زعتر بري": تمت إضافة 2، ولديك 7 في السلة.');
  });
  it('says plainly when everything is already in the basket', () => {
    expect(allInBasketMessage(zaatar, 1, 'en')).toBe('All 1 of "Wild Zaatar" in stock are already in your basket.');
    expect(allInBasketMessage(zaatar, 1, 'ar')).toBe('كل الكمية المتوفرة (1) من "زعتر بري" موجودة بالفعل في سلتك.');
    expect(allInBasketMessage({ name: 'Olive Oil' }, 3, 'ar')).toContain('"Olive Oil"');
  });
  it('neither claims more than was added', () => {
    expect(addedLimitedMessage(zaatar, 1, 1, 1, 'en')).not.toMatch(/Added 3/i);
    expect(addedLimitedMessage(zaatar, 1, 1, 1, 'en')).not.toMatch(/to cart!/);
  });

  describe('the note under Quick View\'s stepper', () => {
    it('says how many are available when few are left', () => {
      expect(stockNoteMessage(1, 0, 'en')).toBe('Only 1 available');
      expect(stockNoteMessage(10, 0, 'en')).toBe('Only 10 available');
      expect(stockNoteMessage(3, 0, 'ar')).toBe('المتوفر 3 قطعة فقط');
    });
    it('is quiet while plenty are left', () => {
      expect(stockNoteMessage(11, 0, 'en')).toBeNull();
      expect(stockNoteMessage(500, 0, 'ar')).toBeNull();
    });
    it('mentions what is already in the basket', () => {
      expect(stockNoteMessage(5, 2, 'en')).toBe('2 already in your basket · 3 more available');
      expect(stockNoteMessage(50, 2, 'en')).toBe('2 already in your basket · 48 more available');
      expect(stockNoteMessage(5, 2, 'ar')).toBe('2 في سلتك بالفعل · يمكنك إضافة 3 فقط');
    });
    it('says so when it is all in the basket', () => {
      expect(stockNoteMessage(1, 1, 'en')).toBe('All 1 in stock are already in your basket');
      expect(stockNoteMessage(4, 9, 'en')).toBe('All 4 in stock are already in your basket');
      expect(stockNoteMessage(1, 1, 'ar')).toBe('كل الكمية المتوفرة (1) موجودة بالفعل في سلتك');
    });
    it('says nothing for a product that is out of stock (its button already says so)', () => {
      expect(stockNoteMessage(0, 0, 'en')).toBeNull();
    });
  });
});
