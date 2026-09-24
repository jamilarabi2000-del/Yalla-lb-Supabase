/**
 * Sanitizes numeric price values from dirty string inputs (e.g., "$15.50", "15,50 USD").
 */
export function parsePrice(val: any): number {
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.max(0, Math.round(val * 100) / 100);
  }
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

/**
 * Sanitizes numeric stock quantity strictly.
 * Accepts only plain integers (with optional commas as thousands separators).
 * Returns NaN for unit suffixes (e.g. "500ml", "750g", "245 Pcs") or missing values,
 * so the importer/form can reject invalid rows and not invent defaults.
 */
export function parseStock(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? NaN : Math.max(0, Math.floor(val));
  if (val === undefined || val === null || String(val).trim() === '') return NaN;
  const raw = String(val).trim();
  // Reject if it contains unit letters or characters other than digits and commas/spaces
  if (/[a-zA-Z]/.test(raw)) {
    return NaN;
  }
  const clean = raw.replace(/,/g, '').trim();
  if (!/^\d+$/.test(clean)) {
    return NaN;
  }
  const num = parseInt(clean, 10);
  return isNaN(num) ? NaN : Math.max(0, num);
}
