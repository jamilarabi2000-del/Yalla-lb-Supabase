import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Order, Review } from '../src/types';
import { filterReviews, hasDeliveredOrderOf, reviewStats, reviewSubmitErrorMessage } from '../src/lib/reviews';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripSql = (s: string) => s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r-1', productId: 'p-1', userId: 'u-1', rating: 5, title: 'Lovely', body: 'Fresh and peppery.',
  isPublished: true, createdAt: '2026-09-20T10:00:00Z', ...over,
});

describe('admin review figures and filters', () => {
  it('averages to one decimal and counts what awaits approval', () => {
    expect(reviewStats([review({ rating: 5 }), review({ rating: 4 }), review({ rating: 4, isPublished: false })]))
      .toEqual({ count: 3, average: 4.3, published: 2, pending: 1 });
    expect(reviewStats([])).toEqual({ count: 0, average: 0, published: 0, pending: 0 });
  });

  const reviews = [
    review({ id: 'a', rating: 5, body: 'Koura oil is superb' }),
    review({ id: 'b', rating: 2, isPublished: false, body: 'Arrived late', productId: 'p-2', userId: 'u-2' }),
    review({ id: 'c', rating: 5, body: 'Again', adminReply: 'Thank you Karim!' }),
  ];
  const ids = (opts: Partial<Parameters<typeof filterReviews>[1]>) => filterReviews(reviews, {
    query: '', rating: 'all', status: 'all',
    productName: id => (id === 'p-2' ? 'Tripoli Brass Tray' : 'Koura Olive Oil'),
    reviewerName: uid => (uid === 'u-2' ? 'Layla K.' : 'Karim N.'),
    ...opts,
  }).map(r => r.id);

  it('filters by star rating and by approval state', () => {
    expect(ids({ rating: 5 })).toEqual(['a', 'c']);
    expect(ids({ status: 'pending' })).toEqual(['b']);
    expect(ids({ status: 'published', rating: 2 })).toEqual([]);
  });

  it('searches text, the store reply, the product and the reviewer', () => {
    expect(ids({ query: 'superb' })).toEqual(['a']);
    expect(ids({ query: 'thank you karim' })).toEqual(['c']);
    expect(ids({ query: 'brass' })).toEqual(['b']);
    expect(ids({ query: 'layla' })).toEqual(['b']);
  });
});

describe('who may review', () => {
  const order = (status: string, productIds: string[]): Order => ({
    status, items: productIds.map(id => ({ product: { id }, quantity: 1 })),
  } as unknown as Order);

  it('mirrors private.can_review_product: a delivered order containing the product', () => {
    expect(hasDeliveredOrderOf([order('delivered', ['p-1'])], 'p-1')).toBe(true);
    expect(hasDeliveredOrderOf([order('in_transit', ['p-1']), order('delivered', ['p-2'])], 'p-1')).toBe(false);
    expect(hasDeliveredOrderOf([], 'p-1')).toBe(false);
  });

  it('turns the database\'s refusals into words a shopper can act on', () => {
    expect(reviewSubmitErrorMessage({ code: '23505' }, false)).toMatch(/already reviewed/);
    expect(reviewSubmitErrorMessage({ code: 'P0001', message: 'REVIEW_RATE_LIMIT' }, false)).toMatch(/try again later/);
    expect(reviewSubmitErrorMessage({ code: '42501' }, false)).toMatch(/delivered/);
    expect(reviewSubmitErrorMessage({ code: '23514' }, false)).toMatch(/too long/);
    expect(reviewSubmitErrorMessage({ code: 'XX000' }, false)).toMatch(/could not be posted/);
    expect(reviewSubmitErrorMessage({ code: '23505' }, true)).toBe('لقد قيّمت هذا المنتج من قبل.');
  });
});

describe('storefront wiring', () => {
  const svc = stripTs(read('src/services/supabaseUserDataService.ts'));
  const published = svc.slice(svc.indexOf('async fetchPublishedReviews'), svc.indexOf('async fetchMyReview'));

  it('shows only published reviews, whoever is looking', () => {
    // RLS also returns an author's own pending review and every review to an
    // administrator; neither belongs on the product page.
    expect(published).toContain(".eq('is_published', true)");
  });

  it('does not send reviewer ids to the storefront', () => {
    const select = published.match(/\.select\('([^']+)'\)/)?.[1] ?? '';
    expect(select.split(',')).not.toContain('user_id');
  });

  it('decides eligibility from the shopper\'s own orders, not an admin\'s view of all of them', () => {
    expect(stripTs(read('src/components/ProductReviews.tsx'))).toMatch(/\.filter\(o => o\.userId === userId\)/);
  });

  it('renders behind the CMS toggle that already existed for it', () => {
    expect(stripTs(read('src/components/ProductDetailView.tsx'))).toMatch(/show\('detailCustomerReviews'\) && \(\s*<ProductReviews/);
  });
});

describe('review pipeline repairs (migration 20260923163531)', () => {
  const raw = read('supabase/migrations/20260923163531_review_pipeline_repairs.sql');
  const sql = stripSql(raw);
  const fn = (name: string) => sql.slice(sql.indexOf(`create or replace function ${name}`), sql.indexOf('$function$;', sql.indexOf(`create or replace function ${name}`)));

  it('the author guard no longer names a column reviews does not have', () => {
    expect(fn('private.protect_review_mutation')).not.toContain('order_id');
  });

  it('authors can withdraw a review by editing it but never publish one', () => {
    expect(fn('private.protect_review_mutation')).toContain('or (new.is_published and not old.is_published)');
  });

  it('only the store writes the store reply', () => {
    const moderation = fn('public.protect_review_moderation');
    expect(moderation).toMatch(/if tg_op = 'INSERT' then[\s\S]*new\.admin_reply := null;[\s\S]*new\.admin_reply_at := null;[\s\S]*return new;/);
    expect(moderation).toMatch(/new\.admin_reply\s+:= old\.admin_reply;/);
    expect(fn('private.protect_review_mutation')).toMatch(/new\.admin_reply is distinct from old\.admin_reply/);
  });

  it('the rating refresh marks its write and skips it when nothing changed', () => {
    const refresh = fn('public.refresh_product_rating');
    expect(refresh).toMatch(/set_config\('yalla\.rating_refresh', 'on', true\)[\s\S]*update public\.products[\s\S]*set_config\('yalla\.rating_refresh', '', true\)/);
    expect(refresh).toMatch(/reviews_count is distinct from v_count or rating is distinct from v_avg/);
  });

  it('the product guards honour the mark for the aggregate columns only', () => {
    expect(fn('private.protect_product_mutation'))
      .toMatch(/\(to_jsonb\(new\) - array\['rating', 'reviews_count', 'updated_at'\]\)\s*= \(to_jsonb\(old\) - array\['rating', 'reviews_count', 'updated_at'\]\)/);
    const operational = fn('public.protect_product_operational_fields');
    // seller_id stays outside the exemption.
    expect(operational).toMatch(/if new\.seller_id is distinct from old\.seller_id\s+or \(\(new\.reviews_count is distinct from old\.reviews_count\s+or new\.rating is distinct from old\.rating\)\s+and coalesce\(current_setting\('yalla\.rating_refresh', true\), ''\) <> 'on'\)/);
  });

  it('caps what shoppers can post', () => {
    expect(sql).toMatch(/reviews_title_length_check check \(title is null or char_length\(title\) <= 120\)/);
    expect(sql).toMatch(/reviews_body_length_check check \(body is null or char_length\(body\) <= 3000\)/);
  });

  it('asserts its own invariants at apply time', () => {
    for (const marker of ['REVIEW_GUARD_REFERENCES_MISSING_COLUMN', 'REVIEW_REPLY_NOT_CLEARED_ON_INSERT', 'RATING_REFRESH_CALLABLE_BY_CLIENTS']) {
      expect(raw).toContain(marker);
    }
  });
});
