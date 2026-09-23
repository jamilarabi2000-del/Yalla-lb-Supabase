-- app_settings was world-readable by construction, not by content.
--
--   app_settings_public_read  FOR SELECT TO anon, authenticated  USING (true)
--
-- Today the table holds a single key, lbp_usd_rate, which is public. But
-- USING (true) made that a coincidence: the first operational setting stored
-- here -- a webhook secret, a feature flag, a supplier contact -- would be
-- readable at /rest/v1/app_settings by anyone with the publishable key.
--
-- The public read is narrowed to an explicit allowlist, so a new key is
-- private until someone deliberately adds it here. Verified before changing:
--   - the only client read is fetchLbpUsdRate, `.eq('key', 'lbp_usd_rate')`;
--   - no function in the public or private schema references app_settings
--     (checkout stopped reading the rate when it went USD-only).
-- Admins keep full read through app_settings_admin_write, which is FOR ALL.
--
-- Rollback:
--   drop policy app_settings_public_read on public.app_settings;
--   create policy app_settings_public_read on public.app_settings
--     for select to anon, authenticated using (true);

drop policy if exists app_settings_public_read on public.app_settings;

create policy app_settings_public_read on public.app_settings
  for select to anon, authenticated
  using (key = any (array['lbp_usd_rate']::text[]));

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and cmd = 'SELECT' and qual = 'true'
  ) then
    raise exception 'APP_SETTINGS_STILL_UNCONDITIONALLY_READABLE';
  end if;
end $$;
