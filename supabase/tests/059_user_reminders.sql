begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_migration;
grant execute on all functions in schema extensions to masarifi_migration;
set local role masarifi_migration;

select has_index('public', 'profiles', 'profiles_active_last_seen_idx');
select has_index('public', 'transactions', 'transactions_owner_created_active_idx');
select is(
  (
    select count(*)::integer
    from public.notification_templates
    where key in (
      'reminder.app_inactive.3d',
      'reminder.app_inactive.7d',
      'reminder.financial_inactive.7d'
    )
      and locale in ('ar', 'en')
      and channel in ('in_app', 'push')
      and status = 'published'
  ),
  12,
  'all localized reminder templates are published'
);
select is(
  (
    select (schedule ->> 'everySeconds')::integer
    from private.scheduled_jobs
    where job_key = 'notification.reminders.evaluate'
  ),
  86400,
  'reminder evaluation runs daily'
);

select * from finish();
rollback;
