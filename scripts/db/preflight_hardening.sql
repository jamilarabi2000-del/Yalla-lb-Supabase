-- Read-only look at the live project before the four hardening migrations (20261004100000..100300).
-- It runs in a READ ONLY transaction that is rolled back: PostgreSQL itself refuses any write inside it.
-- Every query answers one assumption a migration makes; the migrations check the same things again and
-- stop if they do not hold, so this is for reading ahead, not a replacement for those checks.

begin transaction read only;

-- 0. The server, and whether the role running migrations can act as the browser roles (the migrations
--    prove their changes by briefly becoming anon or authenticated).
select current_setting('server_version_num') as server_version_num,
       current_user as migration_role,
       pg_has_role(current_user, 'authenticated', 'MEMBER') as can_act_as_authenticated,
       pg_has_role(current_user, 'anon', 'MEMBER') as can_act_as_anon;

-- A. The delete functions: which exist, whether they run as their owner, whether they call the
--    verified-administrator check, and who may run them today.
select p.oid::regprocedure as function,
       p.prosecdef as security_definer,
       position('is_admin_verified' in p.prosrc) > 0 as calls_is_admin_verified,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as signed_in_can_run,
       md5(p.prosrc) as body_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in ('admin_delete_category', 'admin_delete_seller')
order by 1;

-- B. phone_registry: its policies (the migration drops every one that lets a client write), its
--    browser-role grants, row-level security, and the trigger on profiles that maintains it.
select polname, polcmd, polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.phone_registry'::regclass
order by polname;

select relrowsecurity as phone_registry_rls_on from pg_class where oid = 'public.phone_registry'::regclass;

select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'phone_registry' and grantee in ('anon', 'authenticated')
group by grantee order by grantee;

select t.tgname, f.oid::regprocedure as function, f.prosecdef as security_definer, t.tgenabled
from pg_trigger t
join pg_proc f on f.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
order by t.tgname;

-- C. Browser-role grants on the tables the grants migration touches, the insert triggers on them
--    (one that runs as the caller and reads its table would stop that migration), and MAINTAIN.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('coupons', 'discount_rules', 'search_logs', 'seller_applications', 'admin_activities')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

select c.relname as table_name, t.tgname, f.oid::regprocedure as function, f.prosecdef as security_definer,
       (t.tgtype & 4) <> 0 as fires_on_insert,
       position(c.relname in f.prosrc) > 0 as mentions_its_table
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc f on f.oid = t.tgfoid
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('coupons', 'discount_rules', 'search_logs', 'seller_applications')
  and not t.tgisinternal
order by 1, 2;

select case when current_setting('server_version_num')::int >= 170000 then (
         select count(*) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and (has_table_privilege('anon', c.oid, 'MAINTAIN') or has_table_privilege('authenticated', c.oid, 'MAINTAIN')))
       end as tables_where_browser_roles_hold_maintain;

-- D. The rows the size caps would not accept (the caps are NOT VALID, so these stay; they only matter
--    before a later VALIDATE CONSTRAINT), the database size against the plan's limit, and the rate
--    limiter's own source, which the deferred limiter change has to start from.
select count(*) as search_logs_rows,
       max(char_length(query)) as longest_query,
       count(*) filter (where char_length(query) > 200) as queries_over_200
from public.search_logs;

select count(*) as seller_applications_rows,
       max(pg_column_size(payload)) as largest_payload_bytes,
       count(*) filter (where pg_column_size(payload) > 16384) as payloads_over_16kb
from public.seller_applications;

select pg_size_pretty(pg_database_size(current_database())) as database_size;

select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig, p.prosrc
from pg_proc p
where p.proname = 'rate_limit_anonymous_insert';

rollback;
