-- Undoes 20261004100300_anonymous_insert_size_caps_and_log_purge.sql: removes the two size caps and the purge
-- function. No row is touched, and nothing the purge function has already deleted can be brought back by this.

alter table public.search_logs drop constraint if exists search_logs_query_length;
alter table public.seller_applications drop constraint if exists seller_applications_payload_size;
drop function if exists private.purge_search_logs(interval);
