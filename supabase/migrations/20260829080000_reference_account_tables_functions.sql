grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table public.currencies (
  code char(3) primary key,
  name text not null,
  minor_unit smallint not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint currencies_code_check check (code::text ~ '^[A-Z]{3}$'),
  constraint currencies_name_check check (name=btrim(name) and char_length(name) between 1 and 100 and name !~ '[[:cntrl:]]'),
  constraint currencies_minor_unit_check check (minor_unit between 0 and 4),
  constraint currencies_version_check check (version > 0)
);
alter table public.currencies owner to masarifi_migration;
create index currencies_enabled_code_idx on public.currencies(enabled,code);
create trigger currencies_set_updated_at_and_version before update on public.currencies for each row execute function private.set_updated_at_and_version();

create table public.supported_countries (
  code char(2) primary key,
  name text not null,
  default_currency char(3) not null references public.currencies(code) on update restrict on delete restrict,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint supported_countries_code_check check (code::text ~ '^[A-Z]{2}$'),
  constraint supported_countries_name_check check (name=btrim(name) and char_length(name) between 1 and 100 and name !~ '[[:cntrl:]]'),
  constraint supported_countries_version_check check (version > 0)
);
alter table public.supported_countries owner to masarifi_migration;
create index supported_countries_enabled_code_idx on public.supported_countries(enabled,code);
create trigger supported_countries_set_updated_at_and_version before update on public.supported_countries for each row execute function private.set_updated_at_and_version();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.profiles(id) on update restrict on delete restrict,
  parent_id uuid references public.categories(id) on update restrict on delete restrict,
  merged_into_id uuid references public.categories(id) on update restrict on delete restrict,
  kind text not null,
  label_ar text not null,
  label_en text not null,
  icon text,
  color text,
  system_key text,
  sort_order integer not null default 0,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint categories_scope_check check ((user_id is null)=(system_key is not null)),
  constraint categories_kind_check check (kind in ('income','expense','transfer')),
  constraint categories_label_ar_check check (label_ar=btrim(label_ar) and char_length(label_ar) between 1 and 100 and label_ar !~ '[[:cntrl:]]'),
  constraint categories_label_en_check check (label_en=btrim(label_en) and char_length(label_en) between 1 and 100 and label_en !~ '[[:cntrl:]]'),
  constraint categories_icon_check check (icon is null or (icon=btrim(icon) and char_length(icon) between 1 and 64 and icon ~ '^[A-Za-z0-9._:-]+$')),
  constraint categories_color_check check (color is null or (color=btrim(color) and char_length(color) between 1 and 32 and color ~ '^[A-Za-z0-9#(),.% -]+$')),
  constraint categories_system_key_check check (system_key is null or system_key ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint categories_sort_order_check check (sort_order between -100000 and 100000),
  constraint categories_state_check check ((active and deleted_at is null and merged_into_id is null) or (not active and deleted_at is not null)),
  constraint categories_version_check check (version > 0),
  constraint categories_links_check check (parent_id is distinct from id and merged_into_id is distinct from id)
);
alter table public.categories owner to masarifi_migration;
create unique index categories_system_key_uq on public.categories(system_key) where user_id is null;
create unique index categories_user_label_ar_uq on public.categories(user_id,lower(label_ar),kind) where user_id is not null and active and deleted_at is null;
create unique index categories_user_label_en_uq on public.categories(user_id,lower(label_en),kind) where user_id is not null and active and deleted_at is null;
create index categories_user_kind_active_sort_idx on public.categories(user_id,kind,active,sort_order,id);
create index categories_parent_idx on public.categories(parent_id) where parent_id is not null;
create index categories_merged_into_idx on public.categories(merged_into_id) where merged_into_id is not null;
create trigger categories_set_updated_at_and_version before update on public.categories for each row execute function private.set_updated_at_and_version();

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on update restrict on delete restrict,
  name text not null,
  type text not null,
  currency_code char(3) not null references public.currencies(code) on update restrict on delete restrict,
  institution_name text,
  last_four char(4),
  credit_limit_minor bigint,
  is_default boolean not null default false,
  icon_key text,
  color_key text,
  notes text,
  status text not null default 'active',
  sort_order integer not null default 0,
  include_in_totals boolean not null default true,
  opened_at date,
  closed_at date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint accounts_name_check check (name=btrim(name) and char_length(name) between 1 and 100 and name !~ '[[:cntrl:]]'),
  constraint accounts_type_check check (type in ('bank','debit_card','credit_card','wallet','cash','savings','other')),
  constraint accounts_last_four_check check (last_four is null or last_four::text ~ '^[0-9]{4}$'),
  constraint accounts_credit_limit_check check ((type='credit_card' and (credit_limit_minor is null or credit_limit_minor>=0)) or (type<>'credit_card' and credit_limit_minor is null)),
  constraint accounts_icon_key_check check (icon_key is null or (icon_key=btrim(icon_key) and char_length(icon_key) between 1 and 64 and icon_key ~ '^[A-Za-z0-9._:-]+$')),
  constraint accounts_color_key_check check (color_key is null or (color_key=btrim(color_key) and char_length(color_key) between 1 and 32 and color_key ~ '^[A-Za-z0-9#(),.% -]+$')),
  constraint accounts_notes_check check (notes is null or (notes=btrim(notes) and char_length(notes) between 1 and 500 and notes !~ '[[:cntrl:]]')),
  constraint accounts_status_check check (status in ('active','archived','closed')),
  constraint accounts_sort_order_check check (sort_order between -100000 and 100000),
  constraint accounts_dates_check check (closed_at is null or opened_at is null or closed_at>=opened_at),
  constraint accounts_state_check check ((status='active' and deleted_at is null and closed_at is null) or (status='archived' and deleted_at is not null and closed_at is null) or (status='closed' and closed_at is not null and deleted_at is null)),
  constraint accounts_default_check check (not is_default or status='active'),
  constraint accounts_version_check check (version > 0)
);
alter table public.accounts owner to masarifi_migration;
create unique index accounts_active_default_uq on public.accounts(user_id) where is_default and status='active' and deleted_at is null;
create index accounts_user_status_sort_idx on public.accounts(user_id,status,sort_order,id);
create index accounts_user_currency_idx on public.accounts(user_id,currency_code);
create index accounts_user_active_idx on public.accounts(user_id,id) where status='active';
create trigger accounts_set_updated_at_and_version before update on public.accounts for each row execute function private.set_updated_at_and_version();

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency char(3) not null references public.currencies(code) on update restrict on delete restrict,
  quote_currency char(3) not null references public.currencies(code) on update restrict on delete restrict,
  rate numeric(24,12) not null,
  effective_at timestamptz not null,
  provider text not null,
  provider_ref text,
  created_at timestamptz not null default now(),
  constraint exchange_rates_pair_check check (base_currency<>quote_currency),
  constraint exchange_rates_rate_check check (rate>0 and rate<>'NaN'::numeric),
  constraint exchange_rates_provider_check check (provider=btrim(provider) and char_length(provider) between 1 and 64 and provider ~ '^[A-Za-z0-9._:-]+$'),
  constraint exchange_rates_provider_ref_check check (provider_ref is null or (provider_ref=btrim(provider_ref) and char_length(provider_ref) between 1 and 200 and provider_ref !~ '[[:cntrl:]]')),
  constraint exchange_rates_effective_check check (effective_at<=created_at+interval '5 minutes'),
  constraint exchange_rates_unique unique(base_currency,quote_currency,effective_at,provider)
);
alter table public.exchange_rates owner to masarifi_migration;
create index exchange_rates_pair_effective_idx on public.exchange_rates(base_currency,quote_currency,effective_at desc,provider,id);

create function private.guard_category_graph() returns trigger language plpgsql security definer set search_path='' as $$
declare linked public.categories;
begin
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.system_key is distinct from old.system_key) then
    raise exception using errcode='42501',message='CATEGORY_SCOPE_IMMUTABLE';
  end if;
  if new.parent_id is not null then
    select * into linked from public.categories where id=new.parent_id;
    if linked.id is null or linked.kind<>new.kind or not ((linked.user_id is null and new.user_id is null) or linked.user_id=new.user_id) then
      raise exception using errcode='P0001',message='CATEGORY_INVALID';
    end if;
  end if;
  if new.merged_into_id is not null then
    select * into linked from public.categories where id=new.merged_into_id;
    if new.user_id is null or linked.id is null or linked.user_id is distinct from new.user_id or linked.kind<>new.kind or not linked.active then
      raise exception using errcode='P0001',message='CATEGORY_INVALID';
    end if;
  end if;
  if new.parent_id=new.id or new.merged_into_id=new.id or exists(
    with recursive links as (
      select c.id,c.parent_id,c.merged_into_id from public.categories c where c.id in (new.parent_id,new.merged_into_id)
      union
      select c.id,c.parent_id,c.merged_into_id from public.categories c join links l on c.id=l.parent_id or c.id=l.merged_into_id
    ) select 1 from links where id=new.id
  ) then raise exception using errcode='P0001',message='CATEGORY_CYCLE'; end if;
  return new;
end $$;
alter function private.guard_category_graph() owner to masarifi_migration;
revoke all on function private.guard_category_graph() from public;
create trigger categories_guard_graph before insert or update on public.categories for each row execute function private.guard_category_graph();

create function private.guard_account_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.user_id is distinct from old.user_id then raise exception using errcode='42501',message='ACCOUNT_OWNER_IMMUTABLE'; end if;
  if new.currency_code is distinct from old.currency_code then raise exception using errcode='P0001',message='ACCOUNT_CURRENCY_LOCKED'; end if;
  if old.status='closed' and new is distinct from old then raise exception using errcode='P0001',message='ACCOUNT_CLOSED'; end if;
  return new;
end $$;
alter function private.guard_account_update() owner to masarifi_migration;
revoke all on function private.guard_account_update() from public;
create trigger accounts_guard_update before update on public.accounts for each row execute function private.guard_account_update();

create function private.reject_exchange_rate_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='42501',message='EXCHANGE_RATE_IMMUTABLE'; end $$;
alter function private.reject_exchange_rate_change() owner to masarifi_migration;
revoke all on function private.reject_exchange_rate_change() from public;
create trigger exchange_rates_immutable before update or delete on public.exchange_rates for each row execute function private.reject_exchange_rate_change();

create function private.resolve_category(p_user_id text,p_category_id uuid,p_kind text) returns public.categories
language plpgsql stable security definer set search_path='' as $$
declare result public.categories;
begin
  if p_user_id is null or p_category_id is null or p_kind not in ('income','expense','transfer') then raise exception using errcode='P0001',message='CATEGORY_INVALID'; end if;
  select * into result from public.categories c where c.id=p_category_id and c.kind=p_kind and c.active and c.deleted_at is null and (c.user_id is null or c.user_id=p_user_id);
  if result.id is null then raise exception using errcode='P0001',message='CATEGORY_INVALID'; end if;
  return result;
end $$;
alter function private.resolve_category(text,uuid,text) owner to masarifi_migration;
revoke all on function private.resolve_category(text,uuid,text) from public;

create function private.resolve_exchange_rate(p_base char(3),p_quote char(3),p_at timestamptz,p_max_age interval)
returns table(base_currency char(3),quote_currency char(3),rate numeric(24,12),effective_at timestamptz,provider text)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_base::text!~'^[A-Z]{3}$' or p_quote::text!~'^[A-Z]{3}$' or p_at is null or p_at>clock_timestamp() or p_max_age<interval '1 minute' or p_max_age>interval '365 days' then
    raise exception using errcode='22023',message='FX_REQUEST_INVALID';
  end if;
  if not exists(select 1 from public.currencies c where c.code=p_base and c.enabled) or not exists(select 1 from public.currencies c where c.code=p_quote and c.enabled) then
    raise exception using errcode='P0001',message='FX_UNAVAILABLE';
  end if;
  if p_base=p_quote then return query select p_base,p_quote,1::numeric(24,12),p_at,'identity'::text; return; end if;
  return query select x.base_currency,x.quote_currency,x.rate,x.effective_at,x.provider from public.exchange_rates x
    where x.base_currency=p_base and x.quote_currency=p_quote and x.effective_at<=p_at and x.effective_at>=p_at-p_max_age
    order by x.effective_at desc,x.provider,x.id limit 1;
  if not found then raise exception using errcode='P0001',message='FX_UNAVAILABLE'; end if;
end $$;
alter function private.resolve_exchange_rate(char(3),char(3),timestamptz,interval) owner to masarifi_migration;
revoke all on function private.resolve_exchange_rate(char(3),char(3),timestamptz,interval) from public;

reset role;
revoke masarifi_migration from current_user granted by current_user;
