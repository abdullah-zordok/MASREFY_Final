grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create unique index if not exists transactions_id_user_uq on public.transactions(id,user_id);
create unique index if not exists categories_id_user_scope_uq on public.categories(id,coalesce(user_id,''));

create table public.voice_sessions (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  locale text not null check(locale in ('ar','en')),
  storage_ref text unique check(storage_ref is null or storage_ref ~ '^voice/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  content_type text not null check(content_type in ('audio/m4a','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/webm')),
  size_bytes bigint not null check(size_bytes between 1 and 12582912),
  content_hash text check(content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded' check(status in ('uploaded','processing','proposed','confirmed','expired','failed')),
  duration_ms integer not null check(duration_ms between 1 and 120000),
  expires_at timestamptz not null, finalized_at timestamptz, confirmed_at timestamptz,
  failure_code text check(failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  operation_id uuid not null unique,
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  claim_token uuid, claimed_by text, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  unique(id,user_id),
  check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null)),
  check(confirmed_at is null or status='confirmed'),
  check(failure_code is null or status='failed')
);
alter table public.voice_sessions owner to masarifi_migration;
create index voice_sessions_owner_status_idx on public.voice_sessions(user_id,status,created_at desc,id desc) where deleted_at is null;
create index voice_sessions_claim_idx on public.voice_sessions(next_attempt_at,created_at,id) where status in ('uploaded','processing') and finalized_at is not null;
create index voice_sessions_expiry_idx on public.voice_sessions(expires_at,id) where storage_ref is not null;

create table public.voice_transcripts (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  session_id uuid not null unique, provider text not null check(char_length(provider) between 1 and 64),
  model text not null check(char_length(model) between 3 and 160),
  text_redacted text not null check(octet_length(text_redacted)<=8192 and text_redacted !~ '[[:cntrl:]]'),
  confidence numeric(5,4) check(confidence between 0 and 1), language text not null check(language in ('ar','en')),
  created_at timestamptz not null default now(),
  constraint voice_transcripts_session_owner_fk foreign key(session_id,user_id) references public.voice_sessions(id,user_id) on update restrict on delete cascade
);
alter table public.voice_transcripts owner to masarifi_migration;
create index voice_transcripts_session_time_idx on public.voice_transcripts(session_id,created_at);

create table public.voice_proposals (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  session_id uuid not null, schema_version integer not null check(schema_version=1),
  proposal_type text not null check(proposal_type='transaction.create'),
  payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=8192),
  status text not null default 'draft' check(status in ('draft','validated','confirmed','executed','rejected','expired')),
  expires_at timestamptz not null, confirmed_at timestamptz,
  executed_transaction_id uuid, confirmation_operation_id uuid, decision_token uuid, decision_action text,
  decision_lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  unique(id,user_id),
  constraint voice_proposals_session_owner_fk foreign key(session_id,user_id) references public.voice_sessions(id,user_id) on update restrict on delete cascade,
  constraint voice_proposals_transaction_owner_fk foreign key(executed_transaction_id,user_id) references public.transactions(id,user_id) on update restrict on delete restrict,
  check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
  check(confirmed_at is null or status in ('confirmed','executed')),
  check((status='executed')=(executed_transaction_id is not null)),
  check((decision_token is null)=(decision_action is null)),
  check(decision_lease_until is null or decision_token is not null)
);
alter table public.voice_proposals owner to masarifi_migration;
create unique index voice_proposals_session_active_uq on public.voice_proposals(session_id) where status in ('draft','validated','confirmed');
create index voice_proposals_owner_status_idx on public.voice_proposals(user_id,status,expires_at,id) where deleted_at is null;

create table public.voice_proposal_fields (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  proposal_id uuid not null, field_name text not null check(field_name in ('amountMinor','currency','categoryId','accountId','date','merchant','note')),
  value_json jsonb not null check(jsonb_typeof(value_json) in ('string','number','boolean','null') and pg_column_size(value_json)<=1024),
  confidence numeric(5,4) check(confidence between 0 and 1),
  source_span text check(source_span is null or (char_length(source_span)<=160 and source_span !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  constraint voice_fields_proposal_owner_fk foreign key(proposal_id,user_id) references public.voice_proposals(id,user_id) on update restrict on delete cascade,
  unique(proposal_id,field_name)
);
alter table public.voice_proposal_fields owner to masarifi_migration;
create index voice_proposal_fields_proposal_idx on public.voice_proposal_fields(proposal_id,field_name);

create table public.voice_category_preferences (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  merchant_pattern text not null check(merchant_pattern=btrim(merchant_pattern) and char_length(merchant_pattern) between 1 and 160 and merchant_pattern !~ '[[:cntrl:]]'),
  category_id uuid not null references public.categories(id) on update restrict on delete restrict,
  confidence numeric(5,4) not null check(confidence between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz
);
alter table public.voice_category_preferences owner to masarifi_migration;
create unique index voice_category_preferences_owner_pattern_uq on public.voice_category_preferences(user_id,lower(merchant_pattern)) where deleted_at is null;
create index voice_category_preferences_owner_category_idx on public.voice_category_preferences(user_id,category_id) where deleted_at is null;

create table public.assistant_consents (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  policy_version text not null check(policy_version=btrim(policy_version) and char_length(policy_version) between 1 and 64),
  granted_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,policy_version), check(granted_at>=created_at), check(revoked_at is null or revoked_at>=granted_at)
);
alter table public.assistant_consents owner to masarifi_migration;
create unique index assistant_consents_one_active_uq on public.assistant_consents(user_id) where revoked_at is null;
create index assistant_consents_owner_time_idx on public.assistant_consents(user_id,granted_at desc);

create table public.assistant_conversations (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  title text check(title is null or (title=btrim(title) and char_length(title) between 1 and 120 and title !~ '[[:cntrl:]]')),
  status text not null default 'active' check(status in ('active','archived','deleted')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  unique(id,user_id), check((status='deleted')=(deleted_at is not null))
);
alter table public.assistant_conversations owner to masarifi_migration;
create index assistant_conversations_owner_cursor_idx on public.assistant_conversations(user_id,status,last_message_at desc,id desc);

create table public.assistant_messages (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  conversation_id uuid not null, reply_to_message_id uuid, role text not null check(role in ('user','assistant','system')),
  content_redacted text not null check(octet_length(content_redacted) between 1 and 16384 and content_redacted !~ '[[:cntrl:]]'),
  prompt_version_id uuid references private.ai_prompt_versions(id) on update restrict on delete restrict,
  context_scope text[] not null default '{}' check(cardinality(context_scope)<=5),
  operation_id uuid unique, work_status text check(work_status is null or work_status in ('queued','processing','completed','failed','cancelled')),
  response_mode text check(response_mode is null or response_mode in ('async','stream')),
  failure_code text check(failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  claim_token uuid, claimed_by text, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  constraint assistant_messages_conversation_owner_fk foreign key(conversation_id,user_id) references public.assistant_conversations(id,user_id) on update restrict on delete cascade,
  constraint assistant_messages_reply_owner_fk foreign key(reply_to_message_id,user_id) references public.assistant_messages(id,user_id) on update restrict on delete cascade,
  check((role='user' and prompt_version_id is null) or role<>'user'),
  check((role='assistant')=(reply_to_message_id is not null)),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null))
);
alter table public.assistant_messages owner to masarifi_migration;
create index assistant_messages_conversation_cursor_idx on public.assistant_messages(conversation_id,created_at,id);
create unique index assistant_messages_one_reply_uq on public.assistant_messages(reply_to_message_id) where reply_to_message_id is not null;
create index assistant_messages_claim_idx on public.assistant_messages(next_attempt_at,created_at,id) where role='user' and work_status in ('queued','processing');

create table public.assistant_response_snapshots (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  message_id uuid not null unique, schema_version integer not null check(schema_version=1),
  evidence_refs jsonb not null check(jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)<=32 and pg_column_size(evidence_refs)<=8192),
  model text not null check(char_length(model) between 3 and 160), provider text not null check(char_length(provider) between 1 and 64),
  created_at timestamptz not null default now(),
  constraint assistant_snapshots_message_owner_fk foreign key(message_id,user_id) references public.assistant_messages(id,user_id) on update restrict on delete cascade
);
alter table public.assistant_response_snapshots owner to masarifi_migration;

create table public.assistant_action_previews (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  message_id uuid not null, schema_version integer not null check(schema_version=1),
  action_type text not null check(action_type in ('transaction.create','transaction.update','budget.update','savings_goal.create','obligation.payment.record','tracking.review.resolve')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=8192),
  status text not null default 'draft' check(status in ('draft','validated','confirmed','executed','rejected','expired')),
  expires_at timestamptz not null, confirmed_at timestamptz, executed_resource_id uuid,
  confirmation_operation_id uuid, decision_token uuid, decision_action text, decision_lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  unique(id,user_id),
  constraint assistant_previews_message_owner_fk foreign key(message_id,user_id) references public.assistant_messages(id,user_id) on update restrict on delete cascade,
  check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
  check(confirmed_at is null or status in ('confirmed','executed')),
  check((status='executed')=(executed_resource_id is not null)),
  check((decision_token is null)=(decision_action is null)),
  check(decision_lease_until is null or decision_token is not null)
);
alter table public.assistant_action_previews owner to masarifi_migration;
create unique index assistant_previews_message_action_active_uq on public.assistant_action_previews(message_id,action_type) where status in ('draft','validated','confirmed');
create index assistant_previews_owner_status_idx on public.assistant_action_previews(user_id,status,expires_at,id) where deleted_at is null;

create table public.assistant_feedback (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  message_id uuid not null, rating smallint not null check(rating in (-1,1)),
  reason text check(reason is null or (char_length(reason)<=500 and reason !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  constraint assistant_feedback_message_owner_fk foreign key(message_id,user_id) references public.assistant_messages(id,user_id) on update restrict on delete cascade,
  unique(user_id,message_id)
);
alter table public.assistant_feedback owner to masarifi_migration;

create table public.ai_response_reports (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  message_id uuid not null, report_type text not null check(report_type in ('unsafe','inaccurate','irrelevant','privacy','other')),
  reason text not null check(reason=btrim(reason) and char_length(reason) between 1 and 1000 and reason !~ '[[:cntrl:]]'),
  status text not null default 'open' check(status in ('open','reviewed','actioned','dismissed')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), deleted_at timestamptz,
  constraint ai_reports_message_owner_fk foreign key(message_id,user_id) references public.assistant_messages(id,user_id) on update restrict on delete cascade,
  check((status='open')=(reviewed_at is null))
);
alter table public.ai_response_reports owner to masarifi_migration;
create unique index ai_response_reports_owner_message_type_uq on public.ai_response_reports(user_id,message_id,report_type) where status='open' and deleted_at is null;
create index ai_response_reports_status_idx on public.ai_response_reports(status,created_at,id) where deleted_at is null;

create table private.ai_usage_events (
  id uuid primary key default extensions.gen_random_uuid(), user_id text references public.profiles(id) on update restrict on delete set null,
  workload text not null check(workload in ('voice_transcription','transaction_classification','financial_assistant','report_summarization','financial_insights','admin_support')),
  model text not null check(char_length(model) between 1 and 160), provider text not null check(char_length(provider) between 1 and 64),
  input_tokens integer not null default 0 check(input_tokens>=0), output_tokens integer not null default 0 check(output_tokens>=0),
  estimated_cost numeric(18,8) not null default 0 check(estimated_cost>=0), latency_ms integer not null default 0 check(latency_ms>=0),
  fallback_used boolean not null default false, request_id text not null unique check(char_length(request_id) between 16 and 128),
  reservation_status text not null default 'reserved' check(reservation_status in ('reserved','completed','failed','released')),
  budget_period date not null default date_trunc('month',current_date)::date,
  threshold_events smallint[] not null default '{}' check(threshold_events <@ array[70,85,95,100]::smallint[]),
  provider_generation_hash text check(provider_generation_hash is null or provider_generation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table private.ai_usage_events owner to masarifi_migration;
create index ai_usage_events_owner_time_idx on private.ai_usage_events(user_id,created_at desc,id);
create index ai_usage_events_workload_time_idx on private.ai_usage_events(workload,created_at desc,id);
create index ai_usage_events_budget_idx on private.ai_usage_events(workload,budget_period,reservation_status);

create table private.ai_failure_events (
  id uuid primary key default extensions.gen_random_uuid(), user_id text references public.profiles(id) on update restrict on delete set null,
  workload text not null, model text, provider text,
  failure_code text not null check(failure_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  schema_failure boolean not null default false, retryable boolean not null default false,
  latency_ms integer not null default 0 check(latency_ms>=0), request_id text not null check(char_length(request_id) between 16 and 128),
  status text not null default 'open' check(status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0)
);
alter table private.ai_failure_events owner to masarifi_migration;
create index ai_failure_events_workload_time_idx on private.ai_failure_events(workload,created_at desc,id);
create index ai_failure_events_request_idx on private.ai_failure_events(request_id,created_at,id);

create function private.guard_ai_failure_event_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and current_setting('masarifi.ai_privacy_delete',true)='on'
    and old.user_id is not null and new.user_id is null
    and to_jsonb(new)-'user_id' is not distinct from to_jsonb(old)-'user_id' then
    return new;
  end if;
  if tg_op='DELETE'
    or to_jsonb(new)-array['status','updated_at','version'] is distinct from to_jsonb(old)-array['status','updated_at','version']
    or (old.status='acknowledged' and new.status not in ('acknowledged','resolved'))
    or (old.status='resolved' and new.status<>'resolved') then
    raise exception using errcode='55000',message='IMMUTABLE_RECORD';
  end if;
  return new;
end $$;
alter function private.guard_ai_failure_event_change() owner to masarifi_migration;
revoke all on function private.guard_ai_failure_event_change() from public;

create trigger voice_sessions_version before update on public.voice_sessions for each row execute function private.set_updated_at_and_version();
create trigger voice_proposals_version before update on public.voice_proposals for each row execute function private.set_updated_at_and_version();
create trigger voice_preferences_version before update on public.voice_category_preferences for each row execute function private.set_updated_at_and_version();
create trigger assistant_conversations_version before update on public.assistant_conversations for each row execute function private.set_updated_at_and_version();
create trigger assistant_previews_version before update on public.assistant_action_previews for each row execute function private.set_updated_at_and_version();
create trigger ai_response_reports_version before update on public.ai_response_reports for each row execute function private.set_updated_at_and_version();
create trigger ai_failure_events_version before update on private.ai_failure_events for each row execute function private.set_updated_at_and_version();

create function private.reject_ai_immutable_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' and current_setting('masarifi.ai_privacy_delete',true)='on' then return old; end if;
  raise exception using errcode='55000',message='IMMUTABLE_RECORD';
end $$;
alter function private.reject_ai_immutable_change() owner to masarifi_migration;
revoke all on function private.reject_ai_immutable_change() from public;

create trigger voice_transcripts_immutable before update or delete on public.voice_transcripts for each row execute function private.reject_ai_immutable_change();
create trigger voice_fields_immutable before update or delete on public.voice_proposal_fields for each row execute function private.reject_ai_immutable_change();
create trigger assistant_snapshots_immutable before update or delete on public.assistant_response_snapshots for each row execute function private.reject_ai_immutable_change();
create trigger ai_failure_events_immutable before update or delete on private.ai_failure_events for each row execute function private.guard_ai_failure_event_change();

reset role;
revoke masarifi_migration from current_user;
