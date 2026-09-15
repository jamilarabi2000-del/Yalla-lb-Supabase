create index if not exists analytics_events_user_id_idx on public.analytics_events(user_id);
create index if not exists inventory_ledger_actor_id_idx on public.inventory_ledger(actor_id);
create index if not exists inventory_ledger_variant_id_idx on public.inventory_ledger(variant_id);
create index if not exists order_events_actor_id_idx on public.order_events(actor_id);
create index if not exists role_permissions_permission_key_idx on public.role_permissions(permission_key);
create index if not exists user_permissions_permission_key_idx on public.user_permissions(permission_key);
