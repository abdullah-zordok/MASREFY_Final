grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

alter table public.currencies enable row level security; alter table public.currencies force row level security;
alter table public.supported_countries enable row level security; alter table public.supported_countries force row level security;
alter table public.categories enable row level security; alter table public.categories force row level security;
alter table public.accounts enable row level security; alter table public.accounts force row level security;
alter table public.exchange_rates enable row level security; alter table public.exchange_rates force row level security;

revoke all on public.currencies,public.supported_countries,public.categories,public.accounts,public.exchange_rates from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;
revoke all on function private.resolve_category(text,uuid,text),private.resolve_exchange_rate(char(3),char(3),timestamptz,interval) from public,anon,authenticated,service_role,masarifi_worker;

grant select(code,name,minor_unit,enabled,created_at,updated_at,version) on public.currencies to authenticated,masarifi_api;
grant select(code,name,default_currency,enabled,created_at,updated_at,version) on public.supported_countries to authenticated,masarifi_api;
grant select(id,kind,label_ar,label_en,icon,color,system_key,parent_id,merged_into_id,sort_order,active,deleted_at,created_at,updated_at,version) on public.categories to authenticated;
grant select on public.categories,public.accounts,public.exchange_rates to masarifi_api;
grant update(name,minor_unit,enabled) on public.currencies to masarifi_api;
grant update(name,default_currency,enabled) on public.supported_countries to masarifi_api;
grant insert(id,user_id,parent_id,merged_into_id,kind,label_ar,label_en,icon,color,sort_order,active,deleted_at) on public.categories to masarifi_api;
grant update(parent_id,merged_into_id,kind,label_ar,label_en,icon,color,sort_order,active,deleted_at) on public.categories to masarifi_api;
grant insert(id,user_id,name,type,currency_code,institution_name,last_four,credit_limit_minor,is_default,icon_key,color_key,notes,sort_order,include_in_totals,opened_at) on public.accounts to masarifi_api;
grant update(name,type,currency_code,institution_name,last_four,credit_limit_minor,is_default,icon_key,color_key,notes,status,sort_order,include_in_totals,opened_at,closed_at,deleted_at) on public.accounts to masarifi_api;
grant insert(base_currency,quote_currency,rate,effective_at,provider,provider_ref) on public.exchange_rates to masarifi_api,masarifi_worker;
grant select on public.currencies to masarifi_worker;
grant execute on function private.resolve_category(text,uuid,text),private.resolve_exchange_rate(char(3),char(3),timestamptz,interval) to masarifi_api;

create policy currencies_authenticated_select on public.currencies for select to authenticated
using(enabled and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy currencies_api_select on public.currencies for select to masarifi_api
using((enabled and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active')) or private.admin_has_permission(public.current_clerk_user_id(),'reference.read',clock_timestamp()));
create policy currencies_api_update on public.currencies for update to masarifi_api
using(private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp()))
with check(private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp()));
create policy currencies_worker_select on public.currencies for select to masarifi_worker using(true);

create policy countries_authenticated_select on public.supported_countries for select to authenticated
using(enabled and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy countries_api_select on public.supported_countries for select to masarifi_api
using((enabled and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active')) or private.admin_has_permission(public.current_clerk_user_id(),'reference.read',clock_timestamp()));
create policy countries_api_update on public.supported_countries for update to masarifi_api
using(private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp()))
with check(private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp()));

create policy categories_authenticated_select on public.categories for select to authenticated
using(user_id is null and active and deleted_at is null and exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active'));
create policy categories_api_select on public.categories for select to masarifi_api
using((exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active') and ((user_id is null and active and deleted_at is null) or user_id=public.current_clerk_user_id())) or (user_id is null and private.admin_has_permission(public.current_clerk_user_id(),'reference.read',clock_timestamp())));
create policy categories_api_insert on public.categories for insert to masarifi_api
with check(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy categories_api_update on public.categories for update to masarifi_api
using((user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')) or (user_id is null and private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp())))
with check((user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')) or (user_id is null and private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp())));

create policy accounts_api_select on public.accounts for select to masarifi_api
using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy accounts_api_insert on public.accounts for insert to masarifi_api
with check(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy accounts_api_update on public.accounts for update to masarifi_api
using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'))
with check(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));

create policy exchange_rates_api_select on public.exchange_rates for select to masarifi_api
using(exists(select 1 from public.profiles p where p.id=public.current_clerk_user_id() and p.status='active') or private.admin_has_permission(public.current_clerk_user_id(),'reference.read',clock_timestamp()));
create policy exchange_rates_api_insert on public.exchange_rates for insert to masarifi_api
with check(private.admin_has_permission(public.current_clerk_user_id(),'reference.write',clock_timestamp()));
create policy exchange_rates_worker_insert on public.exchange_rates for insert to masarifi_worker with check(true);

create policy currencies_migration_all on public.currencies for all to masarifi_migration using(true) with check(true);
create policy supported_countries_migration_all on public.supported_countries for all to masarifi_migration using(true) with check(true);
create policy categories_migration_all on public.categories for all to masarifi_migration using(true) with check(true);
create policy accounts_migration_all on public.accounts for all to masarifi_migration using(true) with check(true);
create policy exchange_rates_migration_all on public.exchange_rates for all to masarifi_migration using(true) with check(true);

reset role;
revoke masarifi_migration from current_user granted by current_user;
