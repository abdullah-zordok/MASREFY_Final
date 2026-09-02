grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

insert into public.permissions(key,resource,action)
values('planning.read','planning','read')
on conflict(key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='planning.read'
where r.key='super-admin'
on conflict do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'salary_profiles','salary_receipts','budgets','budget_categories','obligations',
    'obligation_schedule_items','obligation_payments','obligation_payment_allocations',
    'payment_matches','savings_goals','savings_goal_movements'
  ] loop
    execute format(
      'create policy %I on public.%I for all to masarifi_migration using(true) with check(true)',
      'planning_'||table_name||'_migration_all',table_name
    );
    execute format(
      'create policy %I on public.%I for select to masarifi_api using(user_id=public.current_clerk_user_id() and exists(select 1 from public.profiles p where p.id=user_id and p.status=''active'') and not private.ledger_actor_is_admin(public.current_clerk_user_id()))',
      'planning_'||table_name||'_api_owner_select',table_name
    );
  end loop;
end $$;

create policy planning_job_claims_migration_all on private.planning_job_claims
for all to masarifi_migration using(true) with check(true);
create policy planning_reminder_intents_migration_all on private.planning_reminder_intents
for all to masarifi_migration using(true) with check(true);

grant select on public.salary_profiles,public.salary_receipts,public.budgets,public.budget_categories,
  public.obligations,public.obligation_schedule_items,public.obligation_payments,
  public.obligation_payment_allocations,public.payment_matches,public.savings_goals,
  public.savings_goal_movements to masarifi_api;
grant select on public.v_salary_cycle_summary,public.v_budget_utilization,public.v_obligation_status
to masarifi_api;

create function private.read_admin_planning_summary(
  p_admin_id text,p_user_id text,p_period_start date,p_period_end date
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_admin_id is null or p_admin_id<>public.current_clerk_user_id()
    or not private.admin_has_permission(p_admin_id,'planning.read',clock_timestamp()) then
    raise exception using errcode='42501',message='FORBIDDEN';
  end if;
  if p_user_id is null or not exists(select 1 from public.profiles p where p.id=p_user_id and p.status='active') then
    raise exception using errcode='P0001',message='NOT_FOUND';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start or p_period_end-p_period_start>365 then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select jsonb_build_object('userId',p_user_id,
    'dataState',case
      when exists(select 1 from public.v_budget_utilization where user_id=p_user_id and data_state='partial') then 'partial'
      when not exists(select 1 from public.salary_profiles where user_id=p_user_id and status<>'archived')
        and not exists(select 1 from public.budgets where user_id=p_user_id and status<>'deleted')
        and not exists(select 1 from public.obligations where user_id=p_user_id and status<>'archived')
        and not exists(select 1 from public.savings_goals where user_id=p_user_id and status<>'deleted') then 'empty'
      else 'ready' end,
    'ledgerVersion',coalesce((select max(ab.ledger_version) from public.account_balances ab
      join public.accounts a on a.id=ab.account_id where a.user_id=p_user_id),0),
    'salary',(select jsonb_build_object('id',p.id,'name',p.name,'currencyCode',p.currency_code,
      'expectedMinor',p.amount_minor::text,'status',p.status,'version',p.version)
      from public.salary_profiles p where p.user_id=p_user_id and p.status='active'
      order by p.updated_at desc,p.id limit 1),
    'budgets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
      'currencyCode',b.currency_code,'totalMinor',b.total_minor::text,'periodStart',b.period_start,
      'periodEnd',b.period_end,'status',b.status,'version',b.version) order by b.period_start desc,b.id)
      from (select * from public.budgets where user_id=p_user_id and status<>'deleted'
        and period_end>=p_period_start and period_start<=p_period_end order by period_start desc,id limit 100) b),'[]'::jsonb),
    'obligations',jsonb_build_object(
      'payables',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
        'currencyCode',s.currency_code,'remainingMinor',s.remaining_minor::text,'overdueMinor',s.overdue_minor::text,
        'nextDueAt',s.next_due_at,'status',s.status,'ledgerVersion',s.ledger_version) order by s.next_due_at nulls last,o.id)
        from (select * from public.obligations where user_id=p_user_id and direction='payable' and status<>'archived' limit 100) o
        join public.v_obligation_status s on s.obligation_id=o.id),'[]'::jsonb),
      'receivables',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
        'currencyCode',s.currency_code,'remainingMinor',s.remaining_minor::text,'overdueMinor',s.overdue_minor::text,
        'nextDueAt',s.next_due_at,'status',s.status,'ledgerVersion',s.ledger_version) order by s.next_due_at nulls last,o.id)
        from (select * from public.obligations where user_id=p_user_id and direction='receivable' and status<>'archived' limit 100) o
        join public.v_obligation_status s on s.obligation_id=o.id),'[]'::jsonb)),
    'savings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'currencyCode',g.currency_code,
      'targetMinor',g.target_minor::text,'progressMinor',(g.opening_tracked_minor+g.movement_minor)::text,
      'remainingMinor',(g.target_minor-g.opening_tracked_minor-g.movement_minor)::text,'targetDate',g.target_date,
      'status',g.status,'version',g.version) order by g.target_date nulls last,g.id)
      from (select root.*,coalesce(sum(m.amount_minor),0)::bigint movement_minor from public.savings_goals root
        left join public.savings_goal_movements m on m.goal_id=root.id
        where root.user_id=p_user_id and root.status<>'deleted' group by root.id order by root.target_date nulls last,root.id limit 100) g),'[]'::jsonb)
  ) into result;
  return result;
end $$;
alter function private.read_admin_planning_summary(text,text,date,date) owner to masarifi_migration;

revoke all on function
  private.save_salary_profile(text,jsonb),private.generate_salary_receipts(text,uuid,date),
  private.link_salary_receipt(text,jsonb),private.save_budget(text,jsonb),
  private.replace_budget_categories(text,uuid,bigint,jsonb),private.save_obligation(text,jsonb),
  private.generate_obligation_schedule(text,uuid,date),private.mark_planning_overdue(timestamptz,integer),
  private.allocate_obligation_payment(text,jsonb),private.propose_payment_matches(uuid,integer),
  private.decide_payment_match(text,jsonb),
  private.save_savings_goal(text,jsonb),private.record_savings_movement(text,jsonb),
  private.reverse_savings_movement(text,uuid,bigint,uuid),
  private.claim_planning_salary_cycles(uuid,integer,integer),
  private.claim_planning_obligation_schedules(uuid,integer,integer),
  private.claim_planning_match_candidates(uuid,integer,integer),
  private.claim_planning_overdue(uuid,integer,integer),
  private.claim_planning_reminders(uuid,integer,integer),
  private.execute_planning_claim(uuid,uuid,text,uuid),
  private.complete_planning_claim(uuid,uuid,text,jsonb),private.reconcile_planning(uuid,boolean,integer),
  private.read_admin_planning_summary(text,text,date,date)
from public,anon,authenticated,service_role,masarifi_api,masarifi_worker;

grant execute on function
  private.save_salary_profile(text,jsonb),
  private.link_salary_receipt(text,jsonb),private.save_budget(text,jsonb),
  private.replace_budget_categories(text,uuid,bigint,jsonb),private.save_obligation(text,jsonb),
  private.allocate_obligation_payment(text,jsonb),private.decide_payment_match(text,jsonb),
  private.save_savings_goal(text,jsonb),private.record_savings_movement(text,jsonb),
  private.reverse_savings_movement(text,uuid,bigint,uuid),
  private.read_admin_planning_summary(text,text,date,date)
to masarifi_api;

grant execute on function
  private.generate_salary_receipts(text,uuid,date),
  private.generate_obligation_schedule(text,uuid,date),private.mark_planning_overdue(timestamptz,integer),
  private.propose_payment_matches(uuid,integer),
  private.claim_planning_salary_cycles(uuid,integer,integer),
  private.claim_planning_obligation_schedules(uuid,integer,integer),
  private.claim_planning_match_candidates(uuid,integer,integer),
  private.claim_planning_overdue(uuid,integer,integer),
  private.claim_planning_reminders(uuid,integer,integer),
  private.execute_planning_claim(uuid,uuid,text,uuid),
  private.complete_planning_claim(uuid,uuid,text,jsonb),private.reconcile_planning(uuid,boolean,integer)
to masarifi_worker;

reset role;
revoke masarifi_migration from current_user granted by current_user;
