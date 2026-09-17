-- Structural fingerprint of the deployed schema.
--
-- Used by scripts/db/schema-fingerprint.mjs. Run it directly in the Supabase
-- SQL editor to see the current values without installing anything.
with fns as (
  select md5(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')='||pg_get_functiondef(p.oid), E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))) h, count(*) c
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
), pol as (
  select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by tablename, policyname)) h, count(*) c
  from pg_policies where schemaname='public'
), cols as (
  select md5(string_agg(table_name||'.'||column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''), E'\n' order by table_name, ordinal_position)) h, count(*) c
  from information_schema.columns where table_schema='public'
), idx as (
  select md5(string_agg(indexdef, E'\n' order by indexname)) h, count(*) c from pg_indexes where schemaname='public'
), grants as (
  select md5(string_agg(grantee||'|'||table_name||'|'||privilege_type, E'\n' order by table_name, grantee, privilege_type)) h, count(*) c
  from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')
), trg as (
  select md5(string_agg(c.relname||'.'||t.tgname||'='||pg_get_triggerdef(t.oid), E'\n' order by c.relname, t.tgname)) h, count(*) c
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='public'
), rls as (
  select md5(string_agg(c.relname||'='||c.relrowsecurity::text, E'\n' order by c.relname)) h, count(*) c
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
)
select json_build_object(
  'generatedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'functions', json_build_object('count',(select c from fns),'hash',(select h from fns)),
  'policies',  json_build_object('count',(select c from pol),'hash',(select h from pol)),
  'columns',   json_build_object('count',(select c from cols),'hash',(select h from cols)),
  'indexes',   json_build_object('count',(select c from idx),'hash',(select h from idx)),
  'grants',    json_build_object('count',(select c from grants),'hash',(select h from grants)),
  'triggers',  json_build_object('count',(select c from trg),'hash',(select h from trg)),
  'rls',       json_build_object('count',(select c from rls),'hash',(select h from rls))
) as fingerprint;
