-- Free delivery across Lebanon, set by the administrator.
--
-- An order in Lebanon shipped free only once its subtotal reached $50, a
-- number fixed inside private.checkout_create_order and repeated in the
-- storefront. Two settings replace it, both edited in Categories & Details:
--
--   * app_settings 'lebanon_free_delivery_from_usd' (Delivery Regions tab):
--     orders in Lebanon whose subtotal reaches this amount ship free. '0' makes
--     every order ship free and 'off' turns the rule off. Seeded with '50', so
--     nothing changes until an administrator changes it. Everyone may read it,
--     like lbp_usd_rate, so the cart can show the rule checkout applies.
--   * categories.free_delivery_lebanon (each category): an order in Lebanon
--     ships free when every item in it belongs to such a category.
--
-- Diaspora shipping is unchanged. The fee is still decided only by checkout,
-- which now asks private.lebanon_free_delivery_applies(); the storefront's
-- estimate mirrors it. Writes stay with verified administrators: both tables
-- already carry the *_require_verified_admin_* policies.
--
-- Rollback: put `elsif v_subtotal>=50 then v_delivery:=0;` back into
-- private.checkout_create_order (the reverse of the replace below), then drop
-- private.lebanon_free_delivery_applies, the app_settings row and constraint,
-- the extra key in app_settings_public_read, and
-- categories.free_delivery_lebanon.

alter table public.categories
  add column free_delivery_lebanon boolean not null default false;

insert into public.app_settings (key, value, description)
values ('lebanon_free_delivery_from_usd', '50',
        'Orders in Lebanon whose subtotal (USD) reaches this amount ship free. 0 = every order ships free; off = no free delivery by order amount.')
on conflict (key) do nothing;

alter table public.app_settings
  add constraint app_settings_lebanon_free_delivery_value
  check (key <> 'lebanon_free_delivery_from_usd'
         or value ~ '^(off|(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?)$');

alter policy app_settings_public_read on public.app_settings
  using (key = any (array['lbp_usd_rate', 'lebanon_free_delivery_from_usd']));

-- p_item_rows is checkout's v_item_rows: one object per line, each with a
-- product_snapshot carrying the product's category_id.
create function private.lebanon_free_delivery_applies(p_subtotal numeric, p_item_rows jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    -- By order amount. A missing row keeps the old $50 rule.
    coalesce(
      (select case when s.value = 'off' then false else p_subtotal >= s.value::numeric end
         from public.app_settings s
        where s.key = 'lebanon_free_delivery_from_usd'),
      p_subtotal >= 50)
    -- By category: every line is in a free-delivery category. A line with no
    -- category does not qualify.
    or coalesce(
      (select bool_and(coalesce(c.free_delivery_lebanon, false))
         from jsonb_array_elements(p_item_rows) as x
         left join public.categories c
           on c.id = nullif(x->'product_snapshot'->>'category_id', '')::uuid),
      false);
$$;

revoke all on function private.lebanon_free_delivery_applies(numeric, jsonb) from public, anon, authenticated;

do $migration$
declare
  v_def text;
  v_new text;
  v_acl_before text;
  v_acl_after text;
  n_old int;
  c_old constant text := 'elsif v_subtotal>=50 then v_delivery:=0;';
  c_new constant text := 'elsif private.lebanon_free_delivery_applies(v_subtotal, v_item_rows) then v_delivery:=0;';
begin
  select pg_get_functiondef(p.oid), p.proacl::text into v_def, v_acl_before
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  n_old := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if n_old <> 1 then
    raise exception 'FREE_DELIVERY_OLD_RULE_COUNT_UNEXPECTED: %', n_old;
  end if;

  v_new := replace(v_def, c_old, c_new);
  execute v_new;

  select p.proacl::text into v_acl_after
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';
  if v_acl_after is distinct from v_acl_before then
    raise exception 'FREE_DELIVERY_CHECKOUT_GRANTS_CHANGED: % -> %', v_acl_before, v_acl_after;
  end if;
end $migration$;

do $verify$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'checkout_create_order';

  if position('elsif private.lebanon_free_delivery_applies(v_subtotal, v_item_rows) then v_delivery:=0;' in v_def) = 0
     or position('v_subtotal>=50' in v_def) > 0 then
    raise exception 'FREE_DELIVERY_VERIFY_FAILED: checkout still carries the fixed $50 rule';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'private' and p.proname = 'lebanon_free_delivery_applies'
                and (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'FREE_DELIVERY_VERIFY_FAILED: helper is callable by clients';
  end if;
end $verify$;
