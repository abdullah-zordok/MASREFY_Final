begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public','accounts','statement_day','accounts persist statement day');
select has_column('public','accounts','payment_due_day','accounts persist payment due day');
select has_column('public','accounts','monthly_interest_rate_basis_points','monthly rate has explicit period and scale');
select has_column('public','accounts','minimum_payment_minor','accounts persist minimum payment minor units');
select has_function('private','enqueue_credit_card_due_reminders',array['date','integer'],'existing worker has one bounded reminder producer');
select ok(not has_function_privilege('public','private.enqueue_credit_card_due_reminders(date,integer)','EXECUTE'),'reminder producer is not public');
select ok(has_function_privilege('masarifi_worker','private.enqueue_credit_card_due_reminders(date,integer)','EXECUTE'),'existing engagement worker may run the producer');

grant masarifi_migration,masarifi_worker to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values
  ('credit_card_terms_owner','active'),('credit_card_terms_other','active');
insert into public.accounts(id,user_id,name,type,currency_code) values
  ('53000000-0000-4000-8000-000000000001','credit_card_terms_owner','Legacy card','credit_card','SAR');
select ok((select statement_day is null and payment_due_day is null
  and monthly_interest_rate_basis_points is null and minimum_payment_minor is null
  from public.accounts where id='53000000-0000-4000-8000-000000000001'),'existing-style card rows keep nullable terms');

select lives_ok($$insert into public.accounts(
  id,user_id,name,type,currency_code,credit_limit_minor,statement_day,payment_due_day,
  monthly_interest_rate_basis_points,minimum_payment_minor
) values(
  '53000000-0000-4000-8000-000000000002','credit_card_terms_owner','Terms card','credit_card','SAR',
  100000,7,21,125,5000
)$$,'valid card terms persist');
select throws_ok($$insert into public.accounts(id,user_id,name,type,currency_code,statement_day)
  values('53000000-0000-4000-8000-000000000003','credit_card_terms_owner','Bad day','credit_card','SAR',29)$$,
  '23514',null,'statement day is bounded to 1 through 28');
select throws_ok($$insert into public.accounts(id,user_id,name,type,currency_code,payment_due_day)
  values('53000000-0000-4000-8000-000000000004','credit_card_terms_owner','Bad due','credit_card','SAR',0)$$,
  '23514',null,'payment due day is bounded to 1 through 28');
select throws_ok($$insert into public.accounts(id,user_id,name,type,currency_code,monthly_interest_rate_basis_points)
  values('53000000-0000-4000-8000-000000000005','credit_card_terms_owner','Bad rate','credit_card','SAR',10001)$$,
  '23514',null,'monthly basis points reject an invalid scale');
select throws_ok($$insert into public.accounts(id,user_id,name,type,currency_code,minimum_payment_minor)
  values('53000000-0000-4000-8000-000000000006','credit_card_terms_owner','Bad payment','credit_card','SAR',0)$$,
  '23514',null,'minimum payment must be positive minor units');
select throws_ok($$insert into public.accounts(id,user_id,name,type,currency_code,statement_day)
  values('53000000-0000-4000-8000-000000000007','credit_card_terms_owner','Cash terms','cash','SAR',7)$$,
  '23514',null,'non-card accounts reject card terms');

update public.accounts set type='bank'
where id='53000000-0000-4000-8000-000000000002';
select ok((select credit_limit_minor is null and statement_day is null and payment_due_day is null
  and monthly_interest_rate_basis_points is null and minimum_payment_minor is null
  from public.accounts where id='53000000-0000-4000-8000-000000000002'),'card-to-non-card transition clears every incompatible value');

update public.accounts set type='credit_card',statement_day=7,payment_due_day=21,
  monthly_interest_rate_basis_points=125,minimum_payment_minor=5000
where id='53000000-0000-4000-8000-000000000002';
select private.enqueue_outbox_event(
  'account.updated','account','53000000-0000-4000-8000-000000000002',
  jsonb_build_object('accountId','53000000-0000-4000-8000-000000000002','userId','credit_card_terms_owner','version',3,'occurredAt',clock_timestamp())
);
select is((select payload#>>'{sync,snapshot,statement_day}' from private.outbox_events
  where aggregate_id='53000000-0000-4000-8000-000000000002' and event_type='account.updated'
  order by created_at desc limit 1),'7','account deltas carry statement terms');
select is((select payload#>>'{sync,snapshot,monthly_interest_rate_basis_points}' from private.outbox_events
  where aggregate_id='53000000-0000-4000-8000-000000000002' and event_type='account.updated'
  order by created_at desc limit 1),'125','account deltas carry explicit monthly basis points');

select is((select count(*) from public.notification_templates
  where key='account.credit_card_payment_due'),6::bigint,'due reminders reuse localized Phase 11 channels');
select is((select count(*) from public.notification_preferences
  where user_id='credit_card_terms_owner' and event_type='account.credit_card_payment_due'),3::bigint,'new profiles receive due reminder preferences');

insert into public.accounts(id,user_id,name,type,currency_code,payment_due_day) values
  ('53000000-0000-4000-8000-000000000008','credit_card_terms_owner','Due card','credit_card','SAR',21),
  ('53000000-0000-4000-8000-000000000009','credit_card_terms_other','Other day','credit_card','SAR',22);
update public.accounts set payment_due_day=null
where user_id not in ('credit_card_terms_owner','credit_card_terms_other');
set local role masarifi_worker;
select private.enqueue_credit_card_due_reminders('2026-10-21'::date,1) as batch_one \gset
select private.enqueue_credit_card_due_reminders('2026-10-21'::date,1) as batch_two \gset
select private.enqueue_credit_card_due_reminders('2026-09-21'::date,100) as first_enqueued \gset
select private.enqueue_credit_card_due_reminders('2026-09-21'::date,100) as second_enqueued \gset
reset role;
set local role masarifi_migration;
select is(:'batch_one'::bigint,1::bigint,'bounded producer enqueues the first card');
select is(:'batch_two'::bigint,1::bigint,'next batch reaches the next card instead of replaying the first');
select is(:'first_enqueued'::bigint,2::bigint,'producer enqueues each eligible card due on the requested date');
select is(:'second_enqueued'::bigint,0::bigint,'producer is idempotent for account and due date');
select is((select count(*) from private.outbox_events
  where event_type='account.credit_card_payment_due' and payload->>'dueDate'='2026-09-21'),2::bigint,'one existing outbox event represents each due card');
select ok(not exists(select 1 from private.outbox_events
  where event_type='account.credit_card_payment_due'
    and payload::text ~* 'amount|balance|minimum|interest'),'reminder outbox payload discloses no financial value');

update public.profiles set timezone='America/Los_Angeles'
where id='credit_card_terms_owner';
update public.profiles set timezone='Asia/Riyadh'
where id='credit_card_terms_other';
update public.accounts set payment_due_day=6
where id in ('53000000-0000-4000-8000-000000000008','53000000-0000-4000-8000-000000000009');
set local role masarifi_worker;
select private.enqueue_credit_card_due_reminders('2026-09-06T00:01:00Z'::timestamptz,100) as east_due \gset
select private.enqueue_credit_card_due_reminders('2026-09-06T07:01:00Z'::timestamptz,100) as west_due \gset
reset role;
set local role masarifi_migration;
select is(:'east_due'::bigint,1::bigint,'UTC midnight selects only customers whose local due date has started');
select is(:'west_due'::bigint,1::bigint,'western customer receives reminder when their local due day starts');
select is((select (payload->>'expiresAt')::timestamptz from private.outbox_events
  where aggregate_id='53000000-0000-4000-8000-000000000008'
    and event_type='account.credit_card_payment_due' and payload->>'dueDate'='2026-09-06'),
  '2026-09-07T07:00:00Z'::timestamptz,'reminder expires at customer local midnight');
reset role;
select * from finish();
rollback;
