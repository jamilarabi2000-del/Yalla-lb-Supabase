-- Harden phone-availability RPC
-- The public wrapper only delegates to the private implementation; it does not
-- need SECURITY DEFINER itself. Keeping it INVOKER removes the exposed
-- SECURITY DEFINER RPC finding while preserving the existing API contract.

create or replace function public.is_phone_available(p_phone_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.is_phone_available(p_phone_key);
$function$;
