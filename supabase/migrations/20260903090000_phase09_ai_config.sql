grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create table private.ai_providers (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check(key=lower(btrim(key)) and char_length(key) between 2 and 64 and key !~ '[^a-z0-9_-]'),
  display_name text not null check(display_name=btrim(display_name) and char_length(display_name) between 1 and 120 and display_name !~ '[[:cntrl:]]'),
  approved boolean not null default false,
  zdr_capable boolean not null default false,
  training_policy text not null default 'unknown' check(training_policy in ('unknown','no_training','may_train')),
  retention_reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  check(not approved or (zdr_capable and training_policy='no_training' and retention_reviewed_at is not null))
);
alter table private.ai_providers owner to masarifi_migration;
create index ai_providers_approved_idx on private.ai_providers(approved,key) where deleted_at is null;

create table private.ai_models (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id uuid not null references private.ai_providers(id) on update restrict on delete restrict,
  model_id text not null unique check(model_id=btrim(model_id) and char_length(model_id) between 3 and 160 and model_id like '%/%' and model_id !~ '[[:space:][:cntrl:]]'),
  capabilities text[] not null default '{}' check(cardinality(capabilities) between 1 and 8 and capabilities <@ array['text','audio_input','structured_output']::text[]),
  approved boolean not null default false,
  max_context integer not null check(max_context between 1 and 2000000),
  structured_output boolean not null default false,
  cost_policy jsonb not null check(jsonb_typeof(cost_policy)='object' and pg_column_size(cost_policy)<=2048),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  check(not approved or structured_output)
);
alter table private.ai_models owner to masarifi_migration;
create index ai_models_provider_approved_idx on private.ai_models(provider_id,approved,model_id) where deleted_at is null;

create table private.ai_prompt_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  workload text not null check(workload in ('voice_transcription','transaction_classification','financial_assistant','report_summarization','financial_insights','admin_support')),
  version_no integer not null check(version_no>0),
  template text not null check(template=btrim(template) and octet_length(template) between 1 and 32768 and template !~ '[[:cntrl:]]'),
  schema_version integer not null check(schema_version>0),
  status text not null default 'draft' check(status in ('draft','testing','approved','retired')),
  approved_by text references public.admin_profiles(user_id) on update restrict on delete restrict,
  published_at timestamptz,
  evaluation_passed boolean not null default false,
  evaluation_summary jsonb not null default '{}' check(jsonb_typeof(evaluation_summary)='object' and pg_column_size(evaluation_summary)<=4096),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  claim_token uuid, claimed_by text, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workload,version_no),
  check(
    (status in ('draft','testing') and approved_by is null and published_at is null)
    or (status in ('approved','retired') and approved_by is not null and published_at is not null and evaluation_passed)
  ),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null))
);
alter table private.ai_prompt_versions owner to masarifi_migration;
create unique index ai_prompt_versions_approved_workload_uq on private.ai_prompt_versions(workload) where status='approved';
create index ai_prompt_versions_status_idx on private.ai_prompt_versions(workload,status,version_no desc);
create index ai_prompt_versions_claim_idx on private.ai_prompt_versions(next_attempt_at,created_at,id) where status='testing';

create table private.ai_prompt_test_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  prompt_version_id uuid not null references private.ai_prompt_versions(id) on update restrict on delete cascade,
  case_key text not null check(case_key=lower(btrim(case_key)) and char_length(case_key) between 2 and 80 and case_key !~ '[^a-z0-9_.-]'),
  fixture_redacted jsonb not null check(jsonb_typeof(fixture_redacted)='object' and pg_column_size(fixture_redacted)<=8192),
  expected_rules jsonb not null check(jsonb_typeof(expected_rules)='object' and pg_column_size(expected_rules)<=4096),
  enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  unique(prompt_version_id,case_key)
);
alter table private.ai_prompt_test_cases owner to masarifi_migration;
create index ai_prompt_test_cases_version_enabled_idx on private.ai_prompt_test_cases(prompt_version_id,enabled,id) where deleted_at is null;

create table private.ai_safety_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check(key=lower(btrim(key)) and char_length(key) between 2 and 64 and key !~ '[^a-z0-9_.-]'),
  workload text not null check(workload in ('all','voice_transcription','transaction_classification','financial_assistant','report_summarization','financial_insights','admin_support')),
  rule_type text not null check(rule_type in ('input_block','output_block','field_limit','action_allowlist','evidence_limit')),
  configuration jsonb not null check(jsonb_typeof(configuration)='object' and pg_column_size(configuration)<=8192),
  enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz
);
alter table private.ai_safety_rules owner to masarifi_migration;
create index ai_safety_rules_workload_enabled_idx on private.ai_safety_rules(workload,enabled,key) where deleted_at is null;

create function private.validate_ai_safety_rule()
returns trigger language plpgsql security definer set search_path='' as $$
declare allowed_actions text[]:=array['transaction.create','transaction.update','budget.update','savings_goal.create','obligation.payment.record','tracking.review.resolve'];
begin
  if new.rule_type='input_block' then
    if new.configuration-array['denyControl','denyBidiControls','maxUtf8Bytes']<>'{}'::jsonb or not (new.configuration ?& array['denyControl','denyBidiControls','maxUtf8Bytes'])
      or new.configuration->>'denyControl'<>'true' or new.configuration->>'denyBidiControls'<>'true'
      or coalesce(new.configuration->>'maxUtf8Bytes','')!~'^[1-9][0-9]{0,3}$' or (new.configuration->>'maxUtf8Bytes')::integer>8192 then
      raise exception using errcode='22023',message='AI_SAFETY_RULE_INVALID';
    end if;
  elsif new.rule_type='output_block' then
    if new.configuration-array['forbiddenKeys']<>'{}'::jsonb or jsonb_typeof(new.configuration->'forbiddenKeys')<>'array'
      or not (new.configuration->'forbiddenKeys' @> '["tool","tools","sql","url","callback","authorization","secret"]'::jsonb)
      or exists(select 1 from jsonb_array_elements_text(new.configuration->'forbiddenKeys') key where key!~'^[A-Za-z][A-Za-z0-9_]{1,63}$') then
      raise exception using errcode='22023',message='AI_SAFETY_RULE_INVALID';
    end if;
  elsif new.rule_type='action_allowlist' then
    if new.configuration-array['values']<>'{}'::jsonb or jsonb_typeof(new.configuration->'values')<>'array' or jsonb_array_length(new.configuration->'values')<1
      or exists(select 1 from jsonb_array_elements_text(new.configuration->'values') value where not value=any(allowed_actions)) then
      raise exception using errcode='22023',message='AI_SAFETY_RULE_INVALID';
    end if;
  elsif new.rule_type='evidence_limit' then
    if new.configuration-array['maxItems','aliasOnly']<>'{}'::jsonb or new.configuration->>'aliasOnly'<>'true'
      or coalesce(new.configuration->>'maxItems','')!~'^[1-9][0-9]?$' or (new.configuration->>'maxItems')::integer>32 then
      raise exception using errcode='22023',message='AI_SAFETY_RULE_INVALID';
    end if;
  elsif new.rule_type='field_limit' then
    if new.configuration-array['field','maxUtf8Bytes']<>'{}'::jsonb or new.configuration->>'field' not in ('answer','transcript')
      or coalesce(new.configuration->>'maxUtf8Bytes','')!~'^[1-9][0-9]{0,4}$' or (new.configuration->>'maxUtf8Bytes')::integer>16384 then
      raise exception using errcode='22023',message='AI_SAFETY_RULE_INVALID';
    end if;
  end if;
  return new;
end $$;
alter function private.validate_ai_safety_rule() owner to masarifi_migration;
revoke all on function private.validate_ai_safety_rule() from public;
create trigger ai_safety_rules_validate before insert or update on private.ai_safety_rules for each row execute function private.validate_ai_safety_rule();

create table private.ai_feature_routes (
  id uuid primary key default extensions.gen_random_uuid(),
  workload text not null unique check(workload in ('voice_transcription','transaction_classification','financial_assistant','report_summarization','financial_insights','admin_support')),
  primary_model_id uuid not null references private.ai_models(id) on update restrict on delete restrict,
  fallback_model_ids uuid[] not null default '{}',
  provider_allowlist text[] not null check(cardinality(provider_allowlist) between 1 and 8),
  zdr_required boolean not null default true check(zdr_required),
  max_price jsonb not null check(jsonb_typeof(max_price)='object' and pg_column_size(max_price)<=1024),
  limits jsonb not null check(jsonb_typeof(limits)='object' and pg_column_size(limits)<=2048),
  enabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  check(cardinality(fallback_model_ids)<=4),
  check(not primary_model_id=any(fallback_model_ids))
);
alter table private.ai_feature_routes owner to masarifi_migration;
create index ai_feature_routes_enabled_idx on private.ai_feature_routes(enabled,workload) where deleted_at is null;

create function private.validate_ai_feature_route()
returns trigger language plpgsql security definer set search_path='' as $$
declare model_row record; provider_row record; model_uuid uuid; required_capability text;
begin
  if cardinality(new.fallback_model_ids)<>(select count(distinct item) from unnest(new.fallback_model_ids) item)
    or cardinality(new.provider_allowlist)<>(select count(distinct item) from unnest(new.provider_allowlist) item) then
    raise exception using errcode='22023',message='AI_ROUTE_DUPLICATE';
  end if;
  if not (new.max_price ?& array['prompt','completion'] and new.max_price-array['prompt','completion']='{}'::jsonb
    and (new.max_price->>'prompt') ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$'
    and (new.max_price->>'completion') ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$'
    and new.limits ?& array['inputTokens','outputTokens','timeoutMs','monthlyBudget']
    and new.limits-array['inputTokens','outputTokens','timeoutMs','monthlyBudget']='{}'::jsonb
    and (new.limits->>'inputTokens') ~ '^[1-9][0-9]{0,6}$'
    and (new.limits->>'outputTokens') ~ '^[1-9][0-9]{0,6}$'
    and (new.limits->>'timeoutMs') ~ '^[1-9][0-9]{2,5}$'
    and (new.limits->>'timeoutMs')::integer between 100 and 120000
    and (new.limits->>'monthlyBudget') ~ '^(0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(\.[0-9]{1,8})?)$') then
    raise exception using errcode='22023',message='AI_ROUTE_LIMITS_INVALID';
  end if;
  required_capability:=case when new.workload='voice_transcription' then 'audio_input' else 'text' end;
  foreach model_uuid in array array_prepend(new.primary_model_id,new.fallback_model_ids) loop
    select m.*,p.key provider_key,p.approved provider_approved,p.zdr_capable,p.training_policy
      into model_row from private.ai_models m join private.ai_providers p on p.id=m.provider_id where m.id=model_uuid and m.deleted_at is null and p.deleted_at is null;
    if not found or not model_row.approved or not model_row.provider_approved or not model_row.structured_output
      or not required_capability=any(model_row.capabilities) or not 'structured_output'=any(model_row.capabilities)
      or not model_row.zdr_capable or model_row.training_policy<>'no_training'
      or not model_row.provider_key=any(new.provider_allowlist)
      or (new.limits->>'inputTokens')::integer>model_row.max_context
      or not (model_row.cost_policy->>'prompt' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$'
        and model_row.cost_policy->>'completion' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$')
      or (model_row.cost_policy->>'prompt')::numeric>(new.max_price->>'prompt')::numeric
      or (model_row.cost_policy->>'completion')::numeric>(new.max_price->>'completion')::numeric then
      raise exception using errcode='22023',message='AI_ROUTE_MODEL_INVALID';
    end if;
  end loop;
  if exists(select 1 from unnest(new.provider_allowlist) allowed
    where allowed !~ '^[a-z][a-z0-9_-]{1,63}$' or not exists(
      select 1 from private.ai_models m join private.ai_providers p on p.id=m.provider_id
      where m.id=any(array_prepend(new.primary_model_id,new.fallback_model_ids)) and p.key=allowed)) then
    raise exception using errcode='22023',message='AI_ROUTE_PROVIDER_INVALID';
  end if;
  if new.enabled and not exists(select 1 from private.ai_prompt_versions p where p.workload=new.workload and p.status='approved') then
    raise exception using errcode='22023',message='AI_ROUTE_PROMPT_REQUIRED';
  end if;
  if new.enabled and not exists(select 1 from private.ai_safety_rules s where s.enabled and s.deleted_at is null and s.workload in ('all',new.workload)) then
    raise exception using errcode='22023',message='AI_ROUTE_SAFETY_REQUIRED';
  end if;
  return new;
end $$;
alter function private.validate_ai_feature_route() owner to masarifi_migration;
revoke all on function private.validate_ai_feature_route() from public;
create trigger ai_feature_routes_validate before insert or update on private.ai_feature_routes
for each row execute function private.validate_ai_feature_route();

create trigger ai_providers_version before update on private.ai_providers for each row execute function private.set_updated_at_and_version();
create trigger ai_models_version before update on private.ai_models for each row execute function private.set_updated_at_and_version();
create trigger ai_routes_version before update on private.ai_feature_routes for each row execute function private.set_updated_at_and_version();
create trigger ai_prompt_cases_version before update on private.ai_prompt_test_cases for each row execute function private.set_updated_at_and_version();
create trigger ai_safety_rules_version before update on private.ai_safety_rules for each row execute function private.set_updated_at_and_version();

create function private.reject_ai_prompt_version_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status<>'draft' and (new.template<>old.template or new.schema_version<>old.schema_version or new.workload<>old.workload or new.version_no<>old.version_no) then
    raise exception using errcode='55000',message='AI_PROMPT_IMMUTABLE';
  end if;
  return new;
end $$;
alter function private.reject_ai_prompt_version_change() owner to masarifi_migration;
revoke all on function private.reject_ai_prompt_version_change() from public;
create trigger ai_prompt_versions_immutable before update on private.ai_prompt_versions for each row execute function private.reject_ai_prompt_version_change();

reset role;
revoke masarifi_migration from current_user;
