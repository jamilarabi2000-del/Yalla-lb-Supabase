/**
 * "3 items" / "3 منتجات". Arabic has six plural forms, so a fixed word after
 * the number is wrong for most counts: the cart said "1 منتجات" (the plural,
 * for one). 1 and 2 have words of their own; then the last two digits decide:
 * 3-10 take the plural, 11-99 the singular in the accusative (so 111 and 250
 * too), and 100, 101, 102, 200... the plain singular.
 */
export function itemsLabel(count: number, language: 'en' | 'ar'): string {
  if (language !== 'ar') return `${count} ${count === 1 ? 'item' : 'items'}`;
  switch (new Intl.PluralRules('ar').select(count)) {
    case 'zero': return 'لا منتجات';
    case 'one': return 'منتج واحد';
    case 'two': return 'منتجان';
    case 'few': return `${count} منتجات`;
    case 'many': return `${count} منتجًا`;
    default: return `${count} منتج`;
  }
}
