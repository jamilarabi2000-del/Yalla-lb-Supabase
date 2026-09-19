import { supabase } from '../lib/supabase';

/**
 * Storage shape for a discount rule.
 *
 * `public.discount_rules` has four meaningful columns -- id, name,
 * description, is_active -- plus a `rule` jsonb that carries the rest of the
 * DiscountRule. That is not a style choice: private.checkout_create_order
 * reads the promotion out of the jsonb and nowhere else, keying on exactly
 * these names. A rule written as flat columns is silently ignored by the
 * server, and an earlier version of the read mapper here selected
 * row.type / row.value / row.target_value, none of which exist on the table,
 * so every rule came back as { type: undefined, value: 0 }.
 *
 * Keep this list in step with the `v_rule->>'...'` lookups in
 * private.checkout_create_order. `nameAr` is not read by the server; it rides
 * along for the admin UI, and unknown keys are ignored server-side.
 */
const DISCOUNT_RULE_JSON_KEYS = [
  'type',
  'value',
  'target',
  'targetValue',
  'minPurchaseUSD',
  'startDate',
  'endDate',
  'isNewUserOnly',
  'buyQty',
  'getQty',
  'getDiscountPercent',
  'couponCode',
  'nameAr',
] as const;

const toRuleJson = (
  rule: Record<string, any>,
  couponCode?: string,
): Record<string, unknown> => {
  const json: Record<string, unknown> = {};
  for (const key of DISCOUNT_RULE_JSON_KEYS) {
    const value = rule?.[key];
    // `false` and `0` are meaningful; only absent/blank values are dropped.
    if (value !== undefined && value !== null && value !== '') json[key] = value;
  }
  // checkout_create_order gates a rule on rule->>'couponCode' before it ever
  // looks at public.coupons, so the code has to be in the jsonb too. The
  // coupons row is what validates and meters it; this is what selects it.
  if (couponCode) json.couponCode = couponCode;
  else delete json.couponCode;
  return json;
};

const num = (v: unknown): number | undefined =>
  v === undefined || v === null || v === '' ? undefined : Number(v);

const mapDiscountRuleRow = (row: any) => {
  const rule: Record<string, any> =
    row?.rule && typeof row.rule === 'object' ? row.rule : {};
  const coupon = Array.isArray(row?.coupons) ? row.coupons[0] : row?.coupons;
  return {
    id: row.id,
    name: row.name,
    nameAr: rule.nameAr,
    type: rule.type,
    value: Number(rule.value ?? 0),
    target: rule.target,
    targetValue: rule.targetValue,
    isActive: Boolean(row.is_active),
    minPurchaseUSD: num(rule.minPurchaseUSD),
    startDate: rule.startDate,
    endDate: rule.endDate,
    isNewUserOnly: Boolean(rule.isNewUserOnly),
    buyQty: num(rule.buyQty),
    getQty: num(rule.getQty),
    getDiscountPercent: num(rule.getDiscountPercent),
    // The coupons row is authoritative for the code and its limits; the jsonb
    // copy is only the server's selector.
    couponCode: coupon?.coupon_code ?? rule.couponCode,
    maxTotalUses: coupon?.max_total_uses ?? undefined,
    maxUsesPerUser: coupon?.max_uses_per_user ?? undefined,
  };
};

/**
 * Storage shape for a product bundle.
 *
 * checkout_create_order reads
 *   select * from public.product_bundles where is_published = true
 *   order by display_order, id
 * and uses product_ids (uuid[]) and price_usd. The previous mapper here read
 * row.bundle_price_usd and row.is_active, neither of which exists on the
 * table, so every bundle came back priced 0 and inactive. `isActive` on the
 * client maps to the `is_published` column the server filters on.
 */
const mapProductBundleRow = (row: any) => ({
  id: row.id,
  name: row.name,
  nameAr: row.name_ar ?? undefined,
  description: row.description ?? undefined,
  descriptionAr: row.description_ar ?? undefined,
  badgeText: row.badge_text ?? undefined,
  badgeTextAr: row.badge_text_ar ?? undefined,
  imageUrl: row.image_url ?? undefined,
  productIds: row.product_ids || [],
  bundlePriceUSD: Number(row.price_usd ?? 0),
  isActive: Boolean(row.is_published),
  showInSlider: Boolean(row.show_in_slider),
  showButtonInSlider: Boolean(row.show_button_in_slider),
  sliderButtonText: row.slider_button_text ?? undefined,
  sliderButtonTextAr: row.slider_button_text_ar ?? undefined,
  startDate: row.start_at ?? undefined,
  endDate: row.end_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Inverse of mapProductBundleRow.
 *
 * `partial` omits keys the caller did not supply, so an update that touches
 * one field does not blank the rest.
 */
const toBundleRow = (
  bundle: Record<string, any>,
  partial = false,
): Record<string, unknown> => {
  const pairs: Array<[string, unknown]> = [
    ['name', bundle.name],
    ['name_ar', bundle.nameAr ?? null],
    ['description', bundle.description ?? null],
    ['description_ar', bundle.descriptionAr ?? null],
    ['badge_text', bundle.badgeText ?? null],
    ['badge_text_ar', bundle.badgeTextAr ?? null],
    ['image_url', bundle.imageUrl ?? null],
    ['product_ids', bundle.productIds],
    ['price_usd', bundle.bundlePriceUSD],
    ['is_published', bundle.isActive],
    ['show_in_slider', bundle.showInSlider],
    ['show_button_in_slider', bundle.showButtonInSlider],
    ['slider_button_text', bundle.sliderButtonText ?? null],
    ['slider_button_text_ar', bundle.sliderButtonTextAr ?? null],
    ['start_at', bundle.startDate || null],
    ['end_at', bundle.endDate || null],
  ];

  const row: Record<string, unknown> = {};
  for (const [column, value] of pairs) {
    if (partial && value === undefined) continue;
    row[column] = value;
  }

  // These columns are NOT NULL. On a create, fall back to the table's own
  // defaults rather than sending null.
  if (!partial) {
    row.product_ids = bundle.productIds ?? [];
    row.price_usd = bundle.bundlePriceUSD ?? 0;
    row.is_published = bundle.isActive ?? false;
    row.show_in_slider = bundle.showInSlider ?? false;
    row.show_button_in_slider = bundle.showButtonInSlider ?? false;
  }
  return row;
};

export interface DiscountCouponInput {
  code?: string;
  maxTotalUses?: number;
  maxUsesPerUser?: number;
}

/**
 * Writes the coupons row that backs a rule's code.
 *
 * checkout_create_order raises INVALID_COUPON when a submitted code has no
 * row in public.coupons, so a rule carrying a couponCode without this row
 * does not merely fail to discount -- it blocks the shopper's checkout
 * outright.
 */
const syncRuleCoupon = async (
  ruleId: string,
  rule: Record<string, any>,
  coupon: DiscountCouponInput | undefined,
): Promise<void> => {
  const code = coupon?.code?.trim().toUpperCase();

  if (!code) {
    // The code was cleared: drop any coupon this rule owns, or it keeps
    // validating against a promotion that no longer names it.
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('discount_rule_id', ruleId)
      .select('id');
    if (error) throw error;
    return;
  }

  const { data: existing, error: lookupError } = await supabase
    .from('coupons')
    .select('id, discount_rule_id')
    .eq('coupon_code', code)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing && existing.discount_rule_id && existing.discount_rule_id !== ruleId) {
    // coupon_code is UNIQUE. Silently re-pointing it would disable whichever
    // promotion owned it, with no sign in this UI.
    throw new Error(
      `Coupon code "${code}" is already in use by another discount rule.`,
    );
  }

  const payload = {
    coupon_code: code,
    discount_rule_id: ruleId,
    max_total_uses: coupon?.maxTotalUses ?? null,
    max_uses_per_user: coupon?.maxUsesPerUser ?? null,
    is_active: rule?.isActive !== false,
    // Mirror the rule's window: the server checks the rule's dates and the
    // coupon's dates independently, so a mismatch makes a live code apply
    // nothing.
    start_at: rule?.startDate || null,
    end_at: rule?.endDate || null,
  };

  const query = existing
    ? supabase.from('coupons').update(payload).eq('id', existing.id)
    : supabase.from('coupons').insert(payload);

  const { data, error } = await query.select('id');
  if (error) throw error;
  // A write blocked by RLS returns success with zero rows, never an error.
  if (!data || data.length === 0) {
    throw new Error(
      'Coupon was not saved. Complete administrator verification and try again.',
    );
  }

  // Drop any other coupon this rule still owns under a previous code.
  const { error: cleanupError } = await supabase
    .from('coupons')
    .delete()
    .eq('discount_rule_id', ruleId)
    .neq('coupon_code', code)
    .select('id');
  if (cleanupError) throw cleanupError;
};

/** Commerce-side reads used by the storefront/admin UI.
 * Server-side RLS remains authoritative for all protected mutations.
 */
export const supabaseCommerceService = {
  async fetchDiscountRules() {
    const { data, error } = await supabase
      .from('discount_rules')
      .select('*, coupons(coupon_code, max_total_uses, max_uses_per_user)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map(mapDiscountRuleRow);
  },

  async createDiscountRule(
    rule: Record<string, any>,
    coupon?: DiscountCouponInput,
  ): Promise<string> {
    const code = coupon?.code?.trim().toUpperCase() || undefined;

    const { data, error } = await supabase
      .from('discount_rules')
      .insert({
        // `id` is a uuid with a default; never send one. The admin UI used to
        // mint 'rule-<random>', which is not a uuid and could not be stored.
        name: rule.name,
        is_active: rule.isActive !== false,
        rule: toRuleJson(rule, code),
      })
      .select('id')
      .single();
    if (error) throw error;
    // A write blocked by RLS returns success with zero rows, never an error.
    if (!data?.id) {
      throw new Error(
        'Discount rule was not saved. Complete administrator verification and try again.',
      );
    }

    await syncRuleCoupon(data.id, rule, coupon);
    return data.id as string;
  },

  async updateDiscountRule(
    id: string,
    rule: Record<string, any>,
    coupon?: DiscountCouponInput,
  ): Promise<void> {
    const code = coupon?.code?.trim().toUpperCase() || undefined;

    const { data, error } = await supabase
      .from('discount_rules')
      .update({
        name: rule.name,
        is_active: rule.isActive !== false,
        rule: toRuleJson(rule, code),
      })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'Discount rule was not updated. Complete administrator verification and try again.',
      );
    }

    await syncRuleCoupon(id, rule, coupon);
  },

  async deleteDiscountRule(id: string): Promise<void> {
    // Coupons first. The FK is ON DELETE SET NULL, so dropping the rule alone
    // leaves a code that still passes the INVALID_COUPON check but resolves
    // to a null rule: the shopper's code appears to work, discounts nothing,
    // and still burns one of its uses.
    const { error: couponError } = await supabase
      .from('coupons')
      .delete()
      .eq('discount_rule_id', id)
      .select('id');
    if (couponError) throw couponError;

    const { data, error } = await supabase
      .from('discount_rules')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'Discount rule was not deleted. Complete administrator verification and try again.',
      );
    }
  },

  async fetchProductBundles() {
    const { data, error } = await supabase
      .from('product_bundles')
      // display_order then id is the order checkout_create_order applies
      // bundles in, so the storefront lists them the same way.
      .select('*')
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;

    return (data || []).map(mapProductBundleRow);
  },

  async createProductBundle(bundle: Record<string, any>): Promise<string> {
    const { data, error } = await supabase
      .from('product_bundles')
      // `id` is a uuid with a default; never send one. The admin UI used to
      // mint 'bundle-<random>', which is not a uuid and could not be stored.
      .insert(toBundleRow(bundle))
      .select('id')
      .single();
    if (error) throw error;
    // A write blocked by RLS returns success with zero rows, never an error.
    if (!data?.id) {
      throw new Error(
        'Combo deal was not saved. Complete administrator verification and try again.',
      );
    }
    return data.id as string;
  },

  async updateProductBundle(id: string, updates: Record<string, any>): Promise<void> {
    const { data, error } = await supabase
      .from('product_bundles')
      .update(toBundleRow(updates, true))
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'Combo deal was not updated. Complete administrator verification and try again.',
      );
    }
  },

  async deleteProductBundle(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('product_bundles')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'Combo deal was not deleted. Complete administrator verification and try again.',
      );
    }
  },
};
