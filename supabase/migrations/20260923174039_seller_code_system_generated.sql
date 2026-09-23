-- Seller codes are assigned by the database.
--
-- Until now the app minted them: addSeller picked a random SLR-100..999 when
-- none was given, and the Sellers screen suggested the next number but let
-- the admin type any code -- two admins creating sellers at the same time
-- could be offered the same one. The code now comes from a sequence when the
-- seller is inserted, so it is unique by construction, and it cannot be
-- changed afterwards: CSV imports and reports identify sellers by it.
--
-- Trusted server writes (no end-user JWT: migrations, the service role) may
-- still bring their own code, for sellers imported with one; a generated code
-- skips any value already taken.
--
-- Rollback:
--   drop trigger if exists trg_assign_seller_code on public.sellers;
--   drop function if exists private.assign_seller_code();
--   drop sequence if exists private.seller_code_seq;
--   alter table public.sellers alter column seller_code drop not null;

create sequence if not exists private.seller_code_seq as integer minvalue 1;
revoke all on sequence private.seller_code_seq from public, anon, authenticated;

-- Continue after the highest code in use; SLR-101 was the first ever issued.
select setval(
  'private.seller_code_seq',
  greatest(100, coalesce((
    select max(substring(seller_code from '^SLR-([0-9]+)$')::integer) from public.sellers
  ), 100))
);

create or replace function private.assign_seller_code()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null and nullif(btrim(coalesce(new.seller_code, '')), '') is not null then
      return new;
    end if;
    -- The sequence starts above 100, so codes are never shorter than SLR-101
    -- and need no padding (lpad would truncate SLR-1000 to SLR-100).
    loop
      v_code := 'SLR-' || nextval('private.seller_code_seq')::text;
      exit when not exists (select 1 from public.sellers s where s.seller_code = v_code);
    end loop;
    new.seller_code := v_code;
    return new;
  end if;

  if new.seller_code is distinct from old.seller_code and (select auth.uid()) is not null then
    raise exception using
      errcode = '42501',
      message = 'SELLER_CODE_IMMUTABLE',
      hint = 'Seller codes are assigned by the system and cannot be changed.';
  end if;
  return new;
end;
$function$;

revoke all on function private.assign_seller_code() from public, anon, authenticated;

drop trigger if exists trg_assign_seller_code on public.sellers;
create trigger trg_assign_seller_code
  before insert or update of seller_code on public.sellers
  for each row execute function private.assign_seller_code();

-- Every seller has a code from here on.
alter table public.sellers alter column seller_code set not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_assign_seller_code' and tgrelid = 'public.sellers'::regclass) then
    raise exception 'SELLER_CODE_TRIGGER_MISSING';
  end if;
  if (select last_value from private.seller_code_seq) < coalesce((
       select max(substring(seller_code from '^SLR-([0-9]+)$')::integer) from public.sellers), 0) then
    raise exception 'SELLER_CODE_SEQUENCE_BEHIND_EXISTING_CODES';
  end if;
  if has_sequence_privilege('authenticated', 'private.seller_code_seq', 'USAGE')
     or has_function_privilege('authenticated', 'private.assign_seller_code()', 'EXECUTE') then
    raise exception 'SELLER_CODE_INTERNALS_EXPOSED';
  end if;
end $$;
