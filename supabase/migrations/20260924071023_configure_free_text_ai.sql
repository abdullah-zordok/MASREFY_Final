grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

insert into private.ai_providers (
  id,key,display_name,approved,zdr_capable,training_policy,retention_reviewed_at
) values (
  '99010000-0000-4000-8000-000000000005',
  'modelrun',
  'ModelRun via OpenRouter',
  true,
  true,
  'no_training',
  '2026-09-24T00:00:00Z'
)
on conflict (id) do update set
  key=excluded.key,
  display_name=excluded.display_name,
  approved=excluded.approved,
  zdr_capable=excluded.zdr_capable,
  training_policy=excluded.training_policy,
  retention_reviewed_at=excluded.retention_reviewed_at,
  deleted_at=null;

insert into private.ai_models (
  id,provider_id,model_id,capabilities,approved,max_context,structured_output,cost_policy
) values (
  '99020000-0000-4000-8000-000000000007',
  '99010000-0000-4000-8000-000000000005',
  'qwen/qwen3.8-27b:free',
  array['text','structured_output'],
  true,
  262144,
  true,
  '{"prompt":"0","completion":"0","reviewedAt":"2026-09-24"}'
)
on conflict (model_id) do update set
  provider_id=excluded.provider_id,
  capabilities=excluded.capabilities,
  approved=excluded.approved,
  max_context=excluded.max_context,
  structured_output=excluded.structured_output,
  cost_policy=excluded.cost_policy,
  deleted_at=null;

update private.ai_feature_routes
set primary_model_id=(select id from private.ai_models where model_id='qwen/qwen3.8-27b:free'),
    fallback_model_ids='{}',
    provider_allowlist=array['modelrun'],
    max_price='{"prompt":"0","completion":"0"}',
    enabled=false
where workload<>'voice_transcription';

create or replace function private.ai_route_is_compliant(p_route private.ai_feature_routes)
returns boolean language sql stable security definer set search_path='' as $$
  select p_route.enabled and p_route.deleted_at is null and p_route.zdr_required
    and cardinality(p_route.fallback_model_ids) between 0 and 4
    and cardinality(p_route.fallback_model_ids)=(select count(distinct id) from unnest(p_route.fallback_model_ids) id)
    and not p_route.primary_model_id=any(p_route.fallback_model_ids)
    and not exists(
      select 1 from unnest(array_prepend(p_route.primary_model_id,p_route.fallback_model_ids)) candidate(id)
      left join private.ai_models m on m.id=candidate.id
      left join private.ai_providers p on p.id=m.provider_id
      where m.id is null or p.id is null or not m.approved or m.deleted_at is not null or not m.structured_output
        or not 'structured_output'=any(m.capabilities)
        or not (case when p_route.workload='voice_transcription' then 'audio_input' else 'text' end)=any(m.capabilities)
        or not p.approved or not p.zdr_capable or p.training_policy<>'no_training' or p.retention_reviewed_at is null or p.deleted_at is not null
        or not p.key=any(p_route.provider_allowlist) or (p_route.limits->>'inputTokens')::integer>m.max_context
        or case when coalesce(m.cost_policy->>'prompt','')~'^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$' then (m.cost_policy->>'prompt')::numeric>(p_route.max_price->>'prompt')::numeric else true end
        or case when coalesce(m.cost_policy->>'completion','')~'^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$' then (m.cost_policy->>'completion')::numeric>(p_route.max_price->>'completion')::numeric else true end
    )
    and not exists(select 1 from unnest(p_route.provider_allowlist) allowed where not exists(
      select 1 from private.ai_models m join private.ai_providers p on p.id=m.provider_id
      where m.id=any(array_prepend(p_route.primary_model_id,p_route.fallback_model_ids)) and p.key=allowed))
    and exists(select 1 from private.ai_prompt_versions p where p.workload=p_route.workload and p.status='approved' and p.evaluation_passed)
    and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload='all' and s.rule_type='input_block'
      and s.configuration->>'denyControl'='true' and s.configuration->>'denyBidiControls'='true' and (s.configuration->>'maxUtf8Bytes')::integer between 1 and 8192)
    and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload='all' and s.rule_type='output_block'
      and s.configuration->'forbiddenKeys' @> '["tool","tools","sql","url","callback","authorization","secret"]'::jsonb)
    and (p_route.workload<>'financial_assistant' or (
      exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',p_route.workload) and s.rule_type='action_allowlist')
      and exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',p_route.workload) and s.rule_type='evidence_limit' and s.configuration->>'aliasOnly'='true' and (s.configuration->>'maxItems')::integer between 1 and 32)
    ));
$$;

reset role;
revoke masarifi_migration from current_user granted by current_user;
