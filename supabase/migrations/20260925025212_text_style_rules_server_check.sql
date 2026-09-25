-- Server-side check of the per-text styles an administrator saves.
--
-- The styles live in cms_site_content row 'text_styles' as
-- {"rules": {"tr_…": {id, text, tag, scope, page, style, updatedAt}}}. Only a
-- verified administrator can write that row (RLS), and every browser already
-- drops anything malformed before turning it into CSS (textStyleRules.ts).
-- This makes the database refuse a malformed row too, so a value that could
-- break out of a CSS declaration is never stored, whoever sends it.
--
-- The rules mirror src/lib/textStyleRules.ts: the same properties, the same
-- value patterns, the same ±300px limit on a move and the same six fonts.
-- test/textStyleRules.test.ts keeps the two lists in step. The editor only
-- ever saves values it has already checked this way, so a normal save is
-- never refused. Other rows ('main', the CMS document) are not touched.
--
-- Rollback:
--   drop trigger if exists check_text_style_rules on public.cms_site_content;
--   drop function if exists private.check_text_style_rules();

create or replace function private.check_text_style_rules()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_rules jsonb := new.content -> 'rules';
  v_rule record;
  v_device record;
  v_prop record;
  v_value text;
  v_ok boolean;
begin
  if jsonb_typeof(new.content) is distinct from 'object' or jsonb_typeof(v_rules) is distinct from 'object' then
    raise exception 'Text styles must be saved as {"rules": {…}}.' using errcode = '22023';
  end if;
  if pg_column_size(new.content) > 524288 then
    raise exception 'Text styles are larger than 512 KB.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(v_rules)) > 500 then
    raise exception 'At most 500 texts can have their own style.' using errcode = '22023';
  end if;

  for v_rule in select key, value from jsonb_each(v_rules) loop
    if v_rule.key !~ '^tr_[a-z0-9]{8,32}$'
       or jsonb_typeof(v_rule.value) is distinct from 'object'
       or v_rule.value ->> 'id' is distinct from v_rule.key then
      raise exception 'A text style has a malformed id.' using errcode = '22023';
    end if;
    if coalesce(v_rule.value ->> 'tag', '') !~ '^[a-z][a-z0-9]{0,9}$'
       or coalesce(v_rule.value ->> 'page', '') !~ '^(\*|[a-z_]{1,40})$'
       or char_length(coalesce(v_rule.value ->> 'scope', '')) > 200
       or coalesce(v_rule.value ->> 'scope', '') ~ '[{}]'
       or char_length(btrim(coalesce(v_rule.value ->> 'text', ''))) = 0
       or char_length(v_rule.value ->> 'text') > 1000
       or jsonb_typeof(v_rule.value -> 'style') is distinct from 'object' then
      raise exception 'Text style % is malformed.', v_rule.key using errcode = '22023';
    end if;

    for v_device in select key, value from jsonb_each(v_rule.value -> 'style') loop
      if v_device.key not in ('desktop', 'tablet', 'mobile') or jsonb_typeof(v_device.value) is distinct from 'object' then
        raise exception 'Text style % has an unknown device.', v_rule.key using errcode = '22023';
      end if;

      for v_prop in select key, value from jsonb_each(v_device.value) loop
        if jsonb_typeof(v_prop.value) is distinct from 'string' then
          raise exception 'Text style % has a non-text value for %.', v_rule.key, v_prop.key using errcode = '22023';
        end if;
        v_value := v_prop.value #>> '{}';
        -- Anything that could end a declaration, open a block or fetch from
        -- elsewhere, refused before the per-property patterns.
        if v_value = '' or char_length(v_value) > 80
           or v_value ~* '[;{}<>\\]|/\*|url[[:space:]]*\(|expression[[:space:]]*\(|@|!important' then
          raise exception 'Text style % has an unsafe value for %.', v_rule.key, v_prop.key using errcode = '22023';
        end if;
        v_ok := case v_prop.key
          when 'color' then v_value ~* '^(#[0-9a-f]{3,8}|rgba?\([0-9[:space:].,%]+\)|hsla?\([0-9[:space:].,%deg]+\)|[a-z]+)$'
          when 'background-color' then v_value ~* '^(#[0-9a-f]{3,8}|rgba?\([0-9[:space:].,%]+\)|hsla?\([0-9[:space:].,%deg]+\)|[a-z]+)$'
          when 'font-size' then v_value ~ '^([0-9]+(\.[0-9]+)?(px|rem|em|%)|small|medium|large)$'
          when 'letter-spacing' then v_value ~ '^(-?[0-9]+(\.[0-9]+)?(px|em|rem)|normal)$'
          when 'line-height' then v_value ~ '^([0-9]+(\.[0-9]+)?(px|em|rem|%)?|normal)$'
          when 'font-weight' then v_value ~ '^(normal|bold|[1-9]00)$'
          when 'font-style' then v_value ~ '^(normal|italic)$'
          when 'text-align' then v_value ~ '^(left|center|right|justify|start|end)$'
          when 'text-transform' then v_value ~ '^(none|uppercase|lowercase|capitalize)$'
          when 'text-decoration-line' then v_value ~ '^(none|underline|line-through)$'
          when 'font-family' then v_value in (
            '"Plus Jakarta Sans", sans-serif', '"Playfair Display", serif', '"Inter", sans-serif',
            '"Tajawal", sans-serif', '"Cairo", sans-serif', '"Amiri", serif')
          -- A move: whole pixels, at most 300 either way.
          when 'left' then case when v_value ~ '^-?[0-9]{1,3}px$' then abs(replace(v_value, 'px', '')::int) <= 300 else false end
          when 'top' then case when v_value ~ '^-?[0-9]{1,3}px$' then abs(replace(v_value, 'px', '')::int) <= 300 else false end
          else false
        end;
        if not coalesce(v_ok, false) then
          raise exception 'Text style % has a value the server does not accept for %.', v_rule.key, v_prop.key using errcode = '22023';
        end if;
      end loop;
    end loop;
  end loop;

  return new;
end;
$fn$;

revoke all on function private.check_text_style_rules() from public, anon, authenticated;

drop trigger if exists check_text_style_rules on public.cms_site_content;
create trigger check_text_style_rules
  before insert or update on public.cms_site_content
  for each row when (new.id = 'text_styles')
  execute function private.check_text_style_rules();
