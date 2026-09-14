import { supabase } from './supabase';

type Constraint = { kind: string; field?: string; op?: string; value?: unknown; direction?: 'asc' | 'desc'; count?: number };
export type DocumentData = Record<string, any>;

const mapTable = (path: string) => {
  const first = path.split('/').filter(Boolean)[0] || path;
  const aliases: Record<string, string> = {
    users: 'profiles',
    search_logs: 'search_logs',
    reviews: 'reviews',
    products: 'products',
    orders: 'orders',
    carts: 'carts',
    wishlists: 'wishlists',
    sellers: 'sellers',
    categories: 'categories',
    regions: 'regions',
    discount_rules: 'discount_rules',
    product_bundles: 'product_bundles',
    cms_custom_blocks: 'cms_custom_blocks',
  };
  return aliases[first] || first;
};

export const db = { __supabase: supabase };
export const collection = (_db: unknown, ...segments: string[]) => ({ __type: 'collection', path: segments.join('/') });
export const doc = (_dbOrCollection: any, ...segments: string[]) => {
  const base = _dbOrCollection?.path || '';
  return { __type: 'doc', path: [...base.split('/').filter(Boolean), ...segments].join('/') };
};
export const where = (field: string, op: string, value: unknown): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'orderBy', field, direction });
export const limit = (count: number): Constraint => ({ kind: 'limit', count });
export const query = (source: any, ...constraints: Constraint[]) => ({ ...source, constraints });

const buildQuery = async (q: any) => {
  const table = mapTable(q.path);
  let request: any = supabase.from(table).select('*');
  for (const c of q.constraints || []) {
    if (c.kind === 'where') {
      if (c.op === '==') request = request.eq(c.field!, c.value);
      else if (c.op === '!=') request = request.neq(c.field!, c.value);
      else if (c.op === '>') request = request.gt(c.field!, c.value);
      else if (c.op === '>=') request = request.gte(c.field!, c.value);
      else if (c.op === '<') request = request.lt(c.field!, c.value);
      else if (c.op === '<=') request = request.lte(c.field!, c.value);
      else if (c.op === 'array-contains') request = request.contains(c.field!, [c.value]);
    } else if (c.kind === 'orderBy') request = request.order(c.field!, { ascending: c.direction !== 'desc' });
    else if (c.kind === 'limit') request = request.limit(c.count!);
  }
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
};

const wrapSnapshot = (rows: any[]) => ({
  docs: rows.map((row: any) => ({ id: row.id, data: () => row, exists: () => true })),
  empty: rows.length === 0,
  size: rows.length,
  forEach: (fn: (doc: any) => void) => rows.forEach(row => fn({ id: row.id, data: () => row, exists: () => true })),
});

export const getDocs = async (q: any) => wrapSnapshot(await buildQuery(q));
export const getDoc = async (ref: any) => {
  const parts = String(ref.path || '').split('/').filter(Boolean);
  const id = parts.pop();
  const table = mapTable(parts.join('/'));
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return { id, exists: () => Boolean(data), data: () => data || {} };
};

export const addDoc = async (ref: any, data: DocumentData) => {
  const table = mapTable(ref.path);
  const { data: row, error } = await supabase.from(table).insert(data).select('id').single();
  if (error) throw error;
  return { id: row.id };
};
export const setDoc = async (ref: any, data: DocumentData, options?: { merge?: boolean }) => {
  const parts = String(ref.path || '').split('/').filter(Boolean);
  const id = parts.pop();
  const table = mapTable(parts.join('/'));
  const payload = { ...data, id };
  const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw error;
};
export const updateDoc = async (ref: any, data: DocumentData) => {
  const parts = String(ref.path || '').split('/').filter(Boolean);
  const id = parts.pop();
  const table = mapTable(parts.join('/'));
  const { error } = await supabase.from(table).update(data).eq('id', id);
  if (error) throw error;
};
export const deleteDoc = async (ref: any) => {
  const parts = String(ref.path || '').split('/').filter(Boolean);
  const id = parts.pop();
  const table = mapTable(parts.join('/'));
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
};

export const onSnapshot = (q: any, onNext: (snapshot: any) => void, onError?: (error: any) => void) => {
  let active = true;
  buildQuery(q).then(rows => { if (active) onNext(wrapSnapshot(rows)); }).catch(err => onError?.(err));
  const table = mapTable(q.path);
  const channel = supabase.channel(`compat-${table}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, async () => {
      try { const rows = await buildQuery(q); if (active) onNext(wrapSnapshot(rows)); } catch (err) { onError?.(err); }
    })
    .subscribe();
  return () => { active = false; void supabase.removeChannel(channel); };
};

export const writeBatch = (_db: unknown) => {
  const operations: (() => Promise<void>)[] = [];
  return {
    set(ref: any, data: any, options?: any) { operations.push(() => setDoc(ref, data, options)); return this; },
    update(ref: any, data: any) { operations.push(() => updateDoc(ref, data)); return this; },
    delete(ref: any) { operations.push(() => deleteDoc(ref)); return this; },
    async commit() { for (const operation of operations) await operation(); },
  };
};

export const serverTimestamp = () => new Date().toISOString();
export const Timestamp = { now: () => ({ toDate: () => new Date() }) };
export const documentId = () => 'id';
export class FieldPath { constructor(..._parts: string[]) {} }
