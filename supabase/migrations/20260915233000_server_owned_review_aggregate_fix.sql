-- Server-owned product review aggregates.
-- The trigger already exists in the production schema; this migration hardens
-- the functions it invokes and backfills existing products.
create or replace function public.refresh_product_rating(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_avg numeric;
begin
  select count(*)::integer,
         coalesce(round(avg(r.rating)::numeric, 2), 0)
    into v_count, v_avg
  from public.reviews r
  where r.product_id = p_product_id
    and r.is_published = true;

  update public.products
     set reviews_count = v_count,
         rating = v_avg,
         updated_at = now()
   where id = p_product_id;
end;
$$;

create or replace function public.refresh_product_rating_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_product_rating(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

revoke execute on function public.refresh_product_rating(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_product_rating_trigger() from public, anon, authenticated;

update public.products p
   set reviews_count = x.review_count,
       rating = x.avg_rating,
       updated_at = now()
  from (
    select p2.id,
           count(r.id)::integer as review_count,
           coalesce(round(avg(r.rating)::numeric, 2), 0) as avg_rating
      from public.products p2
      left join public.reviews r
        on r.product_id = p2.id
       and r.is_published = true
     group by p2.id
  ) x
 where p.id = x.id;
