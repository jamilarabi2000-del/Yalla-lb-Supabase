-- Undoes 20261018210100_revoke_seller_phone_from_browsers: gives the two browser roles SELECT on public.sellers.contact_phone again.
-- This restores the exposure on purpose: every visitor's browser can again read every active seller's phone number.

grant select (contact_phone) on public.sellers to anon, authenticated;
