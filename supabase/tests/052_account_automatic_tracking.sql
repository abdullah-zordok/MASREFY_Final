begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_column(
  'public','accounts','automatic_tracking_enabled',
  'accounts persist an automatic-tracking control'
);
select col_not_null(
  'public','accounts','automatic_tracking_enabled',
  'account automatic tracking is non-null'
);
select col_default_is(
  'public','accounts','automatic_tracking_enabled','true',
  'existing and new accounts default to tracking enabled'
);
select has_function(
  'private','assert_automatic_tracking_account',array['text','text'],
  'one shared account tracking assertion exists'
);
select ok(
  not has_function_privilege(
    'public','private.assert_automatic_tracking_account(text,text)','EXECUTE'
  ),
  'PUBLIC cannot use the tracking assertion as an account oracle'
);

grant masarifi_migration,masarifi_api to current_user with inherit true,set true;
set local role masarifi_migration;
insert into public.profiles(id,status) values
  ('tracking_account_owner','active'),('tracking_account_other','active');
insert into public.tracking_preferences(user_id,enabled,review_required) values
  ('tracking_account_owner',true,true),('tracking_account_other',true,true);
insert into public.accounts(
  id,user_id,name,type,currency_code,automatic_tracking_enabled,status,deleted_at
) values
  ('52000000-0000-4000-8000-000000000001','tracking_account_owner','Enabled card','credit_card','SAR',true,'active',null),
  ('52000000-0000-4000-8000-000000000002','tracking_account_owner','Disabled card','credit_card','SAR',false,'active',null),
  ('52000000-0000-4000-8000-000000000003','tracking_account_owner','Archived card','credit_card','SAR',true,'archived',clock_timestamp()),
  ('52000000-0000-4000-8000-000000000004','tracking_account_owner','Cash','cash','SAR',true,'active',null),
  ('52000000-0000-4000-8000-000000000005','tracking_account_other','Foreign card','credit_card','SAR',true,'active',null);

select lives_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000001'
  )$$,
  'enabled owned active supported account passes'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000002'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','disabled account fails closed'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000003'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','archived account fails closed'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000004'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','unsupported account type fails closed'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000005'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','foreign account is indistinguishable from blocked'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000099'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','missing account is indistinguishable from blocked'
);
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','not-a-uuid'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','unresolved account fails closed'
);
update public.tracking_preferences set enabled=false where user_id='tracking_account_owner';
select throws_ok(
  $$select private.assert_automatic_tracking_account(
    'tracking_account_owner','52000000-0000-4000-8000-000000000001'
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED','global opt-out overrides the account opt-in'
);
update public.tracking_preferences set enabled=true where user_id='tracking_account_owner';

select throws_ok(
  $$select private.post_transaction(
    'tracking_account_owner',
    jsonb_build_object(
      'kind','expense','amountMinor',100,'currency','SAR',
      'accountId','52000000-0000-4000-8000-000000000002',
      'categoryId',null,'title','Blocked import','merchant',null,
      'paymentMethod',null,'note',null,'occurredAt',clock_timestamp(),
      'source','tracking-import','externalRef','tracking:blocked'
    )
  )$$,
  'P0001','TRACKING_ACCOUNT_BLOCKED',
  'tracking-import ledger writes reuse the shared gate'
);
select is(
  (select count(*)::integer from public.transactions
    where user_id='tracking_account_owner' and source='tracking-import'),
  0,
  'blocked tracking writes have no financial side effects'
);
select lives_ok(
  $$select private.post_transaction(
    'tracking_account_owner',
    jsonb_build_object(
      'kind','expense','amountMinor',100,'currency','SAR',
      'accountId','52000000-0000-4000-8000-000000000002',
      'categoryId',null,'title','Manual entry','merchant',null,
      'paymentMethod',null,'note',null,'occurredAt',clock_timestamp(),
      'source','manual','externalRef',null
    )
  )$$,
  'account opt-out does not block manual ledger writes'
);

create temporary table enabled_tracking_transaction as
select private.post_transaction(
  'tracking_account_owner',
  jsonb_build_object(
    'kind','expense','amountMinor',100,'currency','SAR',
    'accountId','52000000-0000-4000-8000-000000000001',
    'categoryId',null,'title','Enabled import','merchant',null,
    'paymentMethod',null,'note',null,'occurredAt',clock_timestamp(),
    'source','tracking-import','externalRef','tracking:enabled'
  )
) result;
update public.accounts set automatic_tracking_enabled=false
where id='52000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select private.revise_transaction(
    'tracking_account_owner',
    (select (result->>'transactionId')::uuid from enabled_tracking_transaction),
    1,
    '{"amountMinor":150}'::jsonb,
    'user corrected imported amount'
  )$$,
  'account opt-out does not block manual revision of an imported transaction'
);

update public.accounts set automatic_tracking_enabled=true
where id='52000000-0000-4000-8000-000000000001';
create temporary table tracking_finalize_session as
select private.create_import_session(
  'tracking_account_owner','manual',null,1,repeat('f',64),
  jsonb_build_array(jsonb_build_object(
    'sourceItemKey','finalize-race-item',
    'receivedAt','2026-09-05T08:00:00Z',
    'amountMinor',100,'currency','SAR','kind','expense',
    'accountId','52000000-0000-4000-8000-000000000001'
  ))
) result;
create temporary table tracking_finalize_claim as
select * from private.claim_import_session('tracking-finalize-test',1,60);
select lives_ok(
  $$select private.prepare_import_session(
    (select id from tracking_finalize_claim),
    (select claim_token from tracking_finalize_claim)
  )$$,
  'enabled account passes parser preparation'
);
update public.accounts set automatic_tracking_enabled=false
where id='52000000-0000-4000-8000-000000000001';
create temporary table tracking_finalize_result as
select private.finalize_import_session(
  (select id from tracking_finalize_claim),
  (select claim_token from tracking_finalize_claim)
) result;
select is(
  (select jsonb_array_length(result->'autoItems') from tracking_finalize_result),
  0,
  'account opt-out before finalization prevents automatic ledger work'
);
select is(
  (select status from public.import_items
    where session_id=(select (result->>'id')::uuid from tracking_finalize_session)),
  'rejected',
  'finalization race rejects the blocked account item'
);
select is(
  (select count(*)::integer from public.review_items
    where import_item_id=(select id from public.import_items
      where session_id=(select (result->>'id')::uuid from tracking_finalize_session))),
  0,
  'finalization race creates no review item'
);

create temporary table tracking_account_session as
select private.create_import_session(
  'tracking_account_owner','manual',null,1,repeat('e',64),
  jsonb_build_array(jsonb_build_object(
    'sourceItemKey','disabled-account-item',
    'receivedAt','2026-09-05T08:00:00Z',
    'amountMinor',100,'currency','SAR','kind','expense',
    'accountId','52000000-0000-4000-8000-000000000002'
  ))
) result;
create temporary table tracking_account_claim as
select * from private.claim_import_session('tracking-account-test',1,60);
select lives_ok(
  $$select private.prepare_import_session(
    (select id from tracking_account_claim),
    (select claim_token from tracking_account_claim)
  )$$,
  'parser preparation rejects a blocked account without failing the session'
);
select is(
  (select status from public.import_items
    where session_id=(select (result->>'id')::uuid from tracking_account_session)),
  'rejected',
  'blocked account is rejected before parser or proposal work'
);
select is(
  (select count(*)::integer from public.review_items
    where user_id='tracking_account_owner'),
  0,
  'blocked account creates no review item'
);
select is(
  (select jsonb_array_length(
    private.prepare_import_session(
      (select id from tracking_account_claim),
      (select claim_token from tracking_account_claim)
    )->'parserItems'
  )),
  0,
  'retrying preparation cannot revive a rejected account item'
);
select is(
  (select count(*)::integer from public.tracking_history
    where user_id='tracking_account_owner'
      and source_ref=(select id::text from public.import_items
        where session_id=(select (result->>'id')::uuid from tracking_account_session))
      and reason_codes=array['account_tracking_blocked']),
  1,
  'blocked preparation retries remain idempotent'
);

reset role;
select * from finish();
rollback;
