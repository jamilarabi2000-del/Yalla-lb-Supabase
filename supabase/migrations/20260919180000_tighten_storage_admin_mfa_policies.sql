-- Require verified MFA (AAL2 + TOTP) for administrator storage access.
-- Seller-scoped media access remains available through the existing seller checks.

drop policy if exists "yalla private admin access" on storage.objects;
create policy "yalla private admin access"
on storage.objects
for all to authenticated
using (
  bucket_id = 'yalla-private'
  and (select private.is_admin_verified())
);

drop policy if exists "yalla_media_delete" on storage.objects;
create policy "yalla_media_delete"
on storage.objects
for delete to authenticated
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

drop policy if exists "yalla_media_modify" on storage.objects;
create policy "yalla_media_modify"
on storage.objects
for update to authenticated
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

drop policy if exists "yalla_media_write" on storage.objects;
create policy "yalla_media_write"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'yalla-media'
  and storage.extension(name) = any (array['jpg','jpeg','png','webp','avif'])
  and (
    (select private.is_admin_verified())
    or (
      (select private.is_seller())
      and (storage.foldername(name))[1] = 'sellers'
      and (storage.foldername(name))[2] = (select private.current_seller_folder())
    )
  )
);
