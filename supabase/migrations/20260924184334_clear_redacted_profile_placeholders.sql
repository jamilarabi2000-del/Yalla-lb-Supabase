-- Profiles saved through the app's updateUser had email, phone, first_name
-- and last_name stored as the literal text '[REDACTED_PII]': the payload went
-- through the log redactor (sanitizeDocumentData was redactPII) on its way to
-- the upsert. The app no longer does that. This clears the placeholder where
-- it was stored: the email goes back to the address the account signs in
-- with, and the rest become empty so the forms ask for them again. The values
-- it overwrote were never kept anywhere and cannot be recovered. It touches
-- only rows holding the placeholder, so running it again changes nothing.
update public.profiles p
set email      = case when p.email = '[REDACTED_PII]' then u.email else p.email end,
    phone      = nullif(p.phone, '[REDACTED_PII]'),
    first_name = nullif(p.first_name, '[REDACTED_PII]'),
    last_name  = nullif(p.last_name, '[REDACTED_PII]')
from auth.users u
where u.id = p.id
  and '[REDACTED_PII]' in (p.email, p.phone, p.first_name, p.last_name);
