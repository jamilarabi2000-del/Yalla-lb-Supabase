alter table public.sellers add column if not exists name text generated always as (name_en) stored;
alter table public.categories add column if not exists name text generated always as (name_en) stored;
