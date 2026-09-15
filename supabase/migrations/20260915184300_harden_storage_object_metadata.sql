create or replace function public.validate_yalla_media_object()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.bucket_id <> 'yalla-media' then
    return new;
  end if;

  if storage.extension(new.name) not in ('jpg','jpeg','png','webp','avif') then
    raise exception 'Unsupported media file type' using errcode = '22023';
  end if;

  if length(new.name) > 512 or new.name ~ '[\x00-\x1F\x7F]' then
    raise exception 'Invalid media object name' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_yalla_media_object() from public, anon, authenticated;

drop trigger if exists trg_validate_yalla_media_object on storage.objects;
create trigger trg_validate_yalla_media_object
before insert or update on storage.objects
for each row
execute function public.validate_yalla_media_object();
