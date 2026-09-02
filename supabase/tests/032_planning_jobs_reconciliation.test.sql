begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('private','claim_planning_salary_cycles',array['uuid','integer','integer'],'salary worker bounded claim exists');
select has_function('private','claim_planning_obligation_schedules',array['uuid','integer','integer'],'schedule worker bounded claim exists');
select has_function('private','claim_planning_match_candidates',array['uuid','integer','integer'],'match worker bounded claim exists');
select has_function('private','claim_planning_overdue',array['uuid','integer','integer'],'overdue worker bounded claim exists');
select has_function('private','claim_planning_reminders',array['uuid','integer','integer'],'reminder worker bounded claim exists');
select has_function('private','execute_planning_claim',array['uuid','uuid','text','uuid'],'worker execution requires the live claim fence');
select has_function('private','complete_planning_claim',array['uuid','uuid','text','jsonb'],'fenced worker completion exists');
select has_function('private','reconcile_planning',array['uuid','boolean','integer'],'bounded planning reconciliation exists');

select has_index('public','salary_receipts','salary_receipts_profile_expected_uq','salary retry identity is unique');
select has_index('public','obligation_schedule_items','obligation_schedule_items_obligation_sequence_uq','schedule retry identity is unique');
select has_index('public','payment_matches','payment_matches_transaction_obligation_uq','match retry identity is unique');
select has_index('private','planning_reminder_intents','planning_reminder_intents_natural_key_uq','reminder retry identity is unique');
select has_index('private','planning_job_claims','planning_job_claims_due_idx','worker claims are bounded by a due index');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in (
      'claim_planning_salary_cycles','claim_planning_obligation_schedules',
      'claim_planning_match_candidates','claim_planning_overdue','claim_planning_reminders',
      'complete_planning_claim','reconcile_planning'
    )
    and (coalesce(array_to_string(p.proconfig,','),'') !~ 'search_path=' or not p.prosecdef)
),'planning worker functions are fixed-path definers');

select * from finish();
rollback;
