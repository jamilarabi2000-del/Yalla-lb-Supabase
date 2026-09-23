-- Repair the review pipeline. Customers could never post a review, authors
-- could never edit one, and nothing stopped a customer writing the store's
-- reply to their own review.
--
-- 1. Posting failed for every customer. The reviews_refresh_product_rating
--    trigger recomputes the product's rating with an UPDATE of
--    public.products, and two product guards refuse that update to anyone
--    but an administrator: private.protect_product_mutation
--    (PRODUCT_MUTATION_FORBIDDEN) and public.protect_product_operational_fields
--    ("System-controlled product fields cannot be changed by this role").
--    refresh_product_rating is SECURITY DEFINER, but both guards read the
--    caller's JWT, which a definer function does not change.
--
--    The refresh now marks its own write with a transaction-local setting,
--    yalla.rating_refresh -- the pattern checkout already uses with
--    yalla.checkout_order_id. Clients cannot set it: PostgREST exposes no way
--    to call set_config. The guards let the marked write through only for the
--    aggregate columns, so a seller still cannot set their own product's
--    rating. The refresh also skips the write when the aggregate is unchanged;
--    a new review is always pending, so posting one no longer touches the
--    product at all.
--
-- 2. Editing failed for every author: protect_review_mutation compared
--    new.order_id, and reviews has no order_id column, so every non-admin
--    UPDATE raised. It also refused the true -> false change that
--    protect_review_moderation makes when a published review's text changes.
--    An author may now withdraw a review by editing it, and still never
--    publish one.
--
-- 3. Neither trigger protected admin_reply, and the client column grants cover
--    it. With 1 and 2 fixed, a customer could have posted or edited their own
--    review with a forged store response that went public on approval. For
--    anyone but an administrator it is now cleared on insert and kept on
--    update, and protect_review_mutation refuses any change to it.
--
-- 4. Title and body get length limits, since reviews are shown to shoppers.
--    The table is empty, so no row is affected.
--
-- Rollback: the previous bodies of the five functions are in the commit that
-- added this file; restore them and
--   alter table public.reviews drop constraint if exists reviews_title_length_check,
--                              drop constraint if exists reviews_body_length_check;

create or replace function public.refresh_product_rating(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_count integer; v_avg numeric;
begin
  select count(*)::integer, coalesce(round(avg(r.rating)::numeric,2),0)
    into v_count,v_avg
  from public.reviews r
  where r.product_id=p_product_id and r.is_published=true;
  -- Marks this write as the rating refresh for the product guards.
  perform set_config('yalla.rating_refresh', 'on', true);
  update public.products
  set reviews_count=v_count, rating=v_avg, updated_at=now()
  where id=p_product_id
    and (reviews_count is distinct from v_count or rating is distinct from v_avg);
  perform set_config('yalla.rating_refresh', '', true);
end;
$function$;

create or replace function private.protect_product_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  -- The rating refresh, whoever triggered it, may change the aggregate
  -- columns and nothing else.
  if current_setting('yalla.rating_refresh', true) = 'on'
     and (to_jsonb(new) - array['rating', 'reviews_count', 'updated_at'])
       = (to_jsonb(old) - array['rating', 'reviews_count', 'updated_at']) then
    return new;
  end if;
  if (select private.is_admin()) then return new; end if;
  if (select private.is_seller()) then
    if new.id is distinct from old.id
       or new.seller_id is distinct from old.seller_id
       or new.rating is distinct from old.rating
       or new.reviews_count is distinct from old.reviews_count
       or new.cost_price_usd is distinct from old.cost_price_usd
       or new.is_published is distinct from old.is_published
       or new.publish_status is distinct from old.publish_status
       or new.scheduled_publish_at is distinct from old.scheduled_publish_at
       or new.archived_at is distinct from old.archived_at
       or new.display_order is distinct from old.display_order
       or new.created_at is distinct from old.created_at then
      raise exception 'PRODUCT_SECURITY_FIELDS_FORBIDDEN';
    end if;
  else
    raise exception 'PRODUCT_MUTATION_FORBIDDEN';
  end if;
  return new;
end;
$function$;

create or replace function public.protect_product_operational_fields()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'::public.app_role
  ) then
    if new.cost_price_usd is distinct from old.cost_price_usd
       or new.seller_item_code is distinct from old.seller_item_code
       or new.low_stock_threshold is distinct from old.low_stock_threshold
       or new.low_stock_notice is distinct from old.low_stock_notice
       or new.custom_stock_label is distinct from old.custom_stock_label then
      raise exception 'Operational product fields can only be changed by an administrator'
        using errcode = '42501';
    end if;

    if new.seller_id is distinct from old.seller_id
       or ((new.reviews_count is distinct from old.reviews_count
            or new.rating is distinct from old.rating)
           -- The rating refresh maintains these two.
           and coalesce(current_setting('yalla.rating_refresh', true), '') <> 'on') then
      raise exception 'System-controlled product fields cannot be changed by this role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.protect_review_moderation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.is_published := false;
    -- The store's reply is written by the store.
    new.admin_reply := null;
    new.admin_reply_at := null;
    return new;
  end if;

  new.user_id    := old.user_id;
  new.product_id := old.product_id;
  new.created_at := old.created_at;
  new.admin_reply    := old.admin_reply;
  new.admin_reply_at := old.admin_reply_at;

  if new.rating is distinct from old.rating
     or new.title is distinct from old.title
     or new.body  is distinct from old.body
  then
    new.is_published := false;
  else
    new.is_published := old.is_published;
  end if;

  return new;
end;
$function$;

create or replace function private.protect_review_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then return new; end if;
  if (select private.is_admin()) then return new; end if;
  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     -- An author can never publish; editing a published review withdraws it.
     or (new.is_published and not old.is_published)
     or new.admin_reply is distinct from old.admin_reply
     or new.admin_reply_at is distinct from old.admin_reply_at then
    raise exception 'REVIEW_SECURITY_FIELDS_FORBIDDEN';
  end if;
  if new.rating < 1 or new.rating > 5 then
    raise exception 'INVALID_REVIEW_RATING';
  end if;
  return new;
end;
$function$;

alter table public.reviews
  add constraint reviews_title_length_check check (title is null or char_length(title) <= 120),
  add constraint reviews_body_length_check check (body is null or char_length(body) <= 3000);

do $$
begin
  if pg_get_functiondef('private.protect_review_mutation()'::regprocedure) like '%order_id%' then
    raise exception 'REVIEW_GUARD_REFERENCES_MISSING_COLUMN';
  end if;
  if pg_get_functiondef('public.protect_review_moderation()'::regprocedure) not like '%new.admin_reply := null;%' then
    raise exception 'REVIEW_REPLY_NOT_CLEARED_ON_INSERT';
  end if;
  if has_function_privilege('anon', 'public.refresh_product_rating(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.refresh_product_rating(uuid)', 'EXECUTE') then
    raise exception 'RATING_REFRESH_CALLABLE_BY_CLIENTS';
  end if;
end $$;
