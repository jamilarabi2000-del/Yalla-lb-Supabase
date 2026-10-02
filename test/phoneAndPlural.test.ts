import { describe, it, expect } from 'vitest';
import { lebaneseLocalDigits } from '../src/lib/lebanesePhone';
import { itemsLabel } from '../src/lib/plural';

// The sign-up phone boxes had maxLength={8}, which cut a pasted
// "+961 70 123 456" to "+961 70 " before any code ran (digits "96170"); and
// the cart counted "1 منتجات" (the plural, for one).
describe('the digits after +961', () => {
  it('whatever way the number is written or pasted', () => {
    for (const written of [
      '70123456', '70 123 456', '+961 70 123 456', '+961 70123456', '961 70 123 456', '00961 70 123 456',
      '070 123 456', '(70) 123-456', ' +961-70-123-456 ', '٧٠١٢٣٤٥٦'.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)),
    ]) expect(lebaneseLocalDigits(written), written).toBe('70123456');
  });

  it('keeps only digits and at most eight', () => {
    expect(lebaneseLocalDigits('abc')).toBe('');
    expect(lebaneseLocalDigits('')).toBe('');
    expect(lebaneseLocalDigits('7 0 1 2 3 4 5 6 7 8 9')).toBe('70123456');
    expect(lebaneseLocalDigits('12345678901234')).toBe('12345678');
  });

  it('follows typing one character at a time without losing digits', () => {
    // a number typed with its country code first, as people do
    let box = '';
    for (const key of '+961 70 123 456') box = lebaneseLocalDigits(box + key);
    expect(box).toBe('70123456');
    // typed without it
    box = '';
    for (const key of '70123456') box = lebaneseLocalDigits(box + key);
    expect(box).toBe('70123456');
    // a ninth digit is not added to a full number
    expect(lebaneseLocalDigits('70123456' + '9')).toBe('70123456');
  });

  it('a leading 0 is dropped only when it makes the ninth digit', () => {
    expect(lebaneseLocalDigits('07012345')).toBe('07012345');   // still typing
    expect(lebaneseLocalDigits('070123456')).toBe('70123456');  // complete
  });
});

describe('counting items in English and Arabic', () => {
  it('English', () => {
    expect(itemsLabel(0, 'en')).toBe('0 items');
    expect(itemsLabel(1, 'en')).toBe('1 item');
    expect(itemsLabel(2, 'en')).toBe('2 items');
    expect(itemsLabel(12, 'en')).toBe('12 items');
  });

  it('Arabic uses the form the count needs', () => {
    expect(itemsLabel(0, 'ar')).toBe('لا منتجات');
    expect(itemsLabel(1, 'ar')).toBe('منتج واحد');
    expect(itemsLabel(2, 'ar')).toBe('منتجان');
    for (const n of [3, 4, 7, 10]) expect(itemsLabel(n, 'ar'), String(n)).toBe(`${n} منتجات`);
    // the rule looks at the last two digits: 11-99 take the accusative singular, in 111 and 250 too
    for (const n of [11, 25, 99, 111, 250]) expect(itemsLabel(n, 'ar'), String(n)).toBe(`${n} منتجًا`);
    for (const n of [100, 101, 102, 200]) expect(itemsLabel(n, 'ar'), String(n)).toBe(`${n} منتج`);
  });

  it('never prints the plural word for one, the mistake the cart made', () => {
    expect(itemsLabel(1, 'ar')).not.toContain('منتجات');
  });
});
