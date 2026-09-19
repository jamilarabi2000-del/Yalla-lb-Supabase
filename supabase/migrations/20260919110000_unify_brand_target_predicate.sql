-- Make the three target-matching sites in private.checkout_create_order agree
-- on what a `brand` rule matches.
--
-- 20260919100000 corrected the two BOGO sites to use products.brand. Verifying
-- that migration against the stored definition turned up a third site it had
-- not touched: the v_base query, which sets the amount a percentage or fixed
-- rule is applied to. It matched brand against artisan, origin and name -- and
-- never against the brand column itself.
--
-- So the function held three different definitions of "brand":
--
--   v_base (percentage / fixed) : artisan OR origin OR name
--   v_groups (BOGO group count) : brand           (after 20260919100000)
--   BOGO discount               : brand           (after 20260919100000)
--
-- Before that migration it held two (name only, versus artisan/origin/name),
-- so this was a pre-existing split that the BOGO fix narrowed rather than
-- created. Either way a single rule could price one way as a percentage and
-- another as BOGO.
--
-- All three now share one predicate: brand OR artisan OR origin OR name. It is
-- a strict superset of what v_base matched before, so nothing that previously
-- matched stops matching, and the dedicated products.brand column -- the one
-- the administrator actually fills in -- finally counts.
--
-- Note that `name` is the product title, which is a loose thing to match a
-- brand on: "Cedar Honey" matches a brand rule targeting "cedar". That is
-- retained deliberately, because removing it would silently narrow the only
-- behaviour this function has ever had. It is a product decision, not a
-- correctness one, and is called out in SECURITY.md rather than changed here.
--
-- Counts are asserted before and after: 1 v_base site, 2 BOGO sites, 3
-- identical sites afterwards. The migration fails loudly if the source has
-- moved on rather than silently doing nothing.

do $migration$
declare
  v_def text;
  v_new text;
  n_base int;
  n_brandonly int;

  c_old_base constant text :=
    '(v_target=''brand'' and (lower(coalesce(p.artisan,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.origin,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%''))';

  c_old_brandonly constant text :=
    '(v_target=''brand'' and lower(coalesce(p.brand,'''')) like ''%''||v_target_value||''%'')';

  c_unified constant text :=
    '(v_target=''brand'' and (lower(coalesce(p.brand,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.artisan,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.origin,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%''))';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  n_base := (length(v_def) - length(replace(v_def, c_old_base, ''))) / length(c_old_base);
  n_brandonly := (length(v_def) - length(replace(v_def, c_old_brandonly, ''))) / length(c_old_brandonly);

  if n_base <> 1 then
    raise exception 'BRAND_UNIFY_BASE_COUNT_UNEXPECTED: %', n_base;
  end if;
  if n_brandonly <> 2 then
    raise exception 'BRAND_UNIFY_BOGO_COUNT_UNEXPECTED: %', n_brandonly;
  end if;

  v_new := replace(v_def, c_old_base, c_unified);
  v_new := replace(v_new, c_old_brandonly, c_unified);

  if (length(v_new) - length(replace(v_new, c_unified, ''))) / length(c_unified) <> 3 then
    raise exception 'BRAND_UNIFY_NOT_THREE_SITES';
  end if;

  execute v_new;
end $migration$;

do $verify$
declare
  v_def text;
  c_unified constant text :=
    '(v_target=''brand'' and (lower(coalesce(p.brand,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.artisan,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.origin,'''')) like ''%''||v_target_value||''%'' or lower(coalesce(p.name,'''')) like ''%''||v_target_value||''%''))';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if (length(v_def) - length(replace(v_def, c_unified, ''))) / length(c_unified) <> 3 then
    raise exception 'BRAND_UNIFY_VERIFY_FAILED: the three target-matching sites do not agree';
  end if;
  if position('v_groups*v_get' in v_def) > 0 then
    raise exception 'BRAND_UNIFY_VERIFY_FAILED: BOGO cross-line term reappeared';
  end if;
end $verify$;