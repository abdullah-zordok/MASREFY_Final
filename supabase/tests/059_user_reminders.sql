begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant masarifi_migration to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_migration;
grant execute on all functions in schema extensions to masarifi_migration;
set local role masarifi_migration;

select has_index('public', 'profiles', 'profiles_active_last_seen_idx', 'profile inactivity lookup index exists');
select has_index('public', 'transactions', 'transactions_owner_created_active_idx', 'transaction inactivity lookup index exists');
select ok(has_function_privilege('masarifi_worker', 'private.list_reminder_candidates(integer)', 'EXECUTE'), 'reminder worker may evaluate candidates');
select ok(has_function_privilege('masarifi_worker', 'private.reminder_delivery_eligible(uuid,text)', 'EXECUTE'), 'reminder worker may revalidate delivery');
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
