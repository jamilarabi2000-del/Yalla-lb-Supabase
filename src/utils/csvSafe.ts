export const csvSafe = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export const sanitizeRowForCsv = <T extends Record<string, any>>(row: T): T => {
  const sanitized = { ...row };
  for (const key of Object.keys(sanitized)) {
    const val = sanitized[key];
    if (typeof val === 'string') {
      sanitized[key as keyof T] = csvSafe(val) as any;
    }
  }
  return sanitized;
};
