begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function(
  'private','get_category_usage',array['text','uuid'],
  'owner-scoped category usage function exists'
);

select has_function(
  'private','reassign_category_transactions',
  array['text','uuid','uuid','text'],
  'category merge transaction reassignment function exists'
);
select ok(
  not has_function_privilege(
    'public','private.reassign_category_transactions(text,uuid,uuid,text)','EXECUTE'
  ),
  'PUBLIC cannot reassign category transactions'
);
select ok(
  not has_function_privilege(
    'public','private.get_category_usage(text,uuid)','EXECUTE'
  ),
  'PUBLIC cannot read owner category usage'
);
select ok(
  has_function_privilege(
    'masarifi_api','private.get_category_usage(text,uuid)','EXECUTE'
  ),
  'API may read guarded category usage'
);
select ok(
  has_function_privilege(
    'masarifi_api','private.reassign_category_transactions(text,uuid,uuid,text)','EXECUTE'
  ),
  'API may execute the guarded reassignment'
);

grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
grant usage on schema extensions to masarifi_migration,masarifi_api;
set local role masarifi_migration;
insert into public.profiles(id,status) values
  ('category_owner_a','active'),('category_owner_b','active');
insert into public.categories(id,user_id,kind,label_ar,label_en,active,system_key) values
  ('51000000-0000-4000-8000-000000000001','category_owner_a','expense','مصدر','Source',true,null),
  ('51000000-0000-4000-8000-000000000002','category_owner_a','expense','هدف','Target',true,null),
  ('51000000-0000-4000-8000-000000000003','category_owner_a','income','دخل','Income',true,null),
  ('51000000-0000-4000-8000-000000000004','category_owner_a','expense','فارغ','Empty',true,null),
  ('51000000-0000-4000-8000-000000000005','category_owner_b','expense','أجنبي','Foreign',true,null),
  ('51000000-0000-4000-8000-000000000006',null,'expense','نظام','System',true,'client-system');
insert into public.accounts(id,user_id,name,type,currency_code) values
  ('51100000-0000-4000-8000-000000000001','category_owner_a','Cash','cash','SAR');
insert into public.transactions(id,user_id,kind,amount_minor,currency_code,category_id,title,occurred_at)
select
  ('51200000-0000-4000-8000-00000000000'||n)::uuid,
  'category_owner_a','expense',100,'SAR',
  '51000000-0000-4000-8000-000000000001','Linked '||n,
  '2026-09-05T00:00:00Z'::timestamptz
from generate_series(1,3) n;
insert into public.transaction_postings(
  transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at
)
select t.id,'51100000-0000-4000-8000-000000000001',-100,'confirmed','source',t.occurred_at
from public.transactions t where t.user_id='category_owner_a';
update public.categories set active=false,deleted_at=clock_timestamp()
where id='51000000-0000-4000-8000-000000000004';
reset role;

select set_config(
  'request.jwt.claims','{"sub":"category_owner_a","role":"authenticated"}',true
);
set local role masarifi_api;
select is(
  private.reassign_category_transactions(
    'category_owner_a',
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000002',
    'category-merge-test'
  ),
  3,
  'many linked transactions move in one guarded command'
);
select is(
  private.reassign_category_transactions(
    'category_owner_a',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000002',
    'empty-category-merge-test'
  ),
  0,
  'an archived source with zero linked transactions is supported'
);
select throws_ok(
  $$select private.reassign_category_transactions(
    'category_owner_a','51000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000003','bad-kind')$$,
  'P0001','CATEGORY_INVALID','incompatible kind is rejected'
);
select throws_ok(
  $$select private.reassign_category_transactions(
    'category_owner_a','51000000-0000-4000-8000-000000000005',
    '51000000-0000-4000-8000-000000000002','foreign-source')$$,
  'P0001','CATEGORY_INVALID','foreign source is hidden'
);
select throws_ok(
  $$select private.reassign_category_transactions(
    'category_owner_a','51000000-0000-4000-8000-000000000006',
    '51000000-0000-4000-8000-000000000002','system-source')$$,
  'P0001','CATEGORY_INVALID','system source is rejected'
);
reset role;

set local role masarifi_migration;
select is(
  (select count(*)::integer from public.transactions
    where user_id='category_owner_a'
      and category_id='51000000-0000-4000-8000-000000000001'),
  0,
  'source no longer owns transaction headers'
);
select is(
  (select count(*)::integer from public.transactions
    where user_id='category_owner_a'
      and category_id='51000000-0000-4000-8000-000000000002'),
  3,
  'target owns every moved transaction header'
);
select is(
  (select count(*)::integer from audit.transaction_revisions
    where reason='category merged'),
  3,
  'every moved transaction has an immutable revision'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type='transaction.revised'
      and payload->>'requestId'='category-merge-test'),
  3,
  'every moved transaction has a sync/outbox event'
);
select is(
  (select confirmed_minor from public.account_balances
    where account_id='51100000-0000-4000-8000-000000000001'),
  0::bigint,
  'category reassignment does not change money'
);
select is(
  (select count(*)::integer from public.transaction_postings
    where account_id='51100000-0000-4000-8000-000000000001'),
  3,
  'immutable postings are preserved'
);
select is(
  (select count(*)::integer from audit.audit_events
    where action='transaction.revised'
      and request_id='category-merge-test'),
  3,
  'every moved transaction is audited'
);

reset role;
select * from finish();
rollback;
