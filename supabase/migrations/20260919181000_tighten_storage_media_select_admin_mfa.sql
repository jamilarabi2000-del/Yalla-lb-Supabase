-- Require verified MFA (AAL2 + TOTP) for administrator reads of media.
-- Seller-scoped media access remains available through the existing seller checks.

drop policy if exists "yalla_media_select" on storage.objects;
create policy "yalla_media_select"
on storage.objects
for select to authenticated
using (
  bucket_id = 'yalla-media'
  and (
    (select private.is_admin_verified())
    or (
      (select private.is_seller())
      and (storage.foldername(name))[1] = 'sellers'
      and (storage.foldername(name))[2] = (select private.current_seller_folder())
    )
  )
);
