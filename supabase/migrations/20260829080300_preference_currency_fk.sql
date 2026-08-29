grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

do $$ begin
  if exists(select 1 from public.user_preferences p left join public.currencies c on c.code=p.default_currency where c.code is null) then
    raise exception using errcode='23503',message='PREFERENCE_CURRENCY_BACKFILL_REQUIRED';
  end if;
end $$;

alter table public.user_preferences add constraint user_preferences_default_currency_fkey
foreign key(default_currency) references public.currencies(code) on update restrict on delete restrict not valid;
alter table public.user_preferences validate constraint user_preferences_default_currency_fkey;

reset role;
revoke masarifi_migration from current_user granted by current_user;
