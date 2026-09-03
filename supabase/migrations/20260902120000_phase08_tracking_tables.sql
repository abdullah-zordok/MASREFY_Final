grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

create unique index if not exists transactions_id_user_uq on public.transactions(id,user_id);

create table public.financial_institutions (
  id uuid primary key default extensions.gen_random_uuid(),
  country_code char(2) not null references public.supported_countries(code) on update restrict on delete restrict,
  name text not null check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  code text not null check(code ~ '^[a-z][a-z0-9-]{1,39}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.financial_institutions owner to masarifi_migration;
create unique index financial_institutions_code_uq on public.financial_institutions(code);
create index financial_institutions_country_active_idx on public.financial_institutions(country_code,active,name,id);

create table public.institution_senders (
  id uuid primary key default extensions.gen_random_uuid(),
  institution_id uuid not null references public.financial_institutions(id) on update restrict on delete restrict,
  sender_pattern text not null check(sender_pattern=btrim(sender_pattern) and char_length(sender_pattern) between 1 and 256 and sender_pattern !~ '[[:cntrl:]]'),
  display_label text not null check(display_label=btrim(display_label) and char_length(display_label) between 1 and 120 and display_label !~ '[[:cntrl:]]'),
  priority integer not null default 100 check(priority between 0 and 10000), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.institution_senders owner to masarifi_migration;
create unique index institution_senders_institution_pattern_uq on public.institution_senders(institution_id,lower(sender_pattern));
create index institution_senders_active_priority_idx on public.institution_senders(priority,id) where active;

create table public.parser_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  institution_id uuid references public.financial_institutions(id) on update restrict on delete restrict,
  name text not null check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  source_type text not null check(source_type in ('sms','file','manual','provider')),
  active_version_id uuid,
  status text not null default 'draft' check(status in ('draft','active','disabled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0),
  check((status='active')=(active_version_id is not null))
);
alter table public.parser_rules owner to masarifi_migration;
create unique index parser_rules_scope_name_uq on public.parser_rules(coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid),source_type,lower(name));
create index parser_rules_scope_status_idx on public.parser_rules(institution_id,status,source_type,id);

create table public.parser_rule_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  parser_rule_id uuid not null references public.parser_rules(id) on update restrict on delete cascade,
  version_no integer not null check(version_no>0),
  definition jsonb not null check(jsonb_typeof(definition)='object' and pg_column_size(definition)<=8192),
  definition_hash text not null check(definition_hash ~ '^[0-9a-f]{64}$'),
  created_by text not null check(created_by=btrim(created_by) and char_length(created_by) between 1 and 128),
  published_at timestamptz,
  corpus_status text not null default 'not_run' check(corpus_status in ('not_run','queued','running','passed','failed')),
  corpus_requested_by text check(corpus_requested_by is null or (corpus_requested_by=btrim(corpus_requested_by) and char_length(corpus_requested_by) between 1 and 128)),
  corpus_requested_at timestamptz, corpus_reason text check(corpus_reason is null or (corpus_reason=btrim(corpus_reason) and char_length(corpus_reason) between 10 and 500)),
  corpus_claim_token uuid, corpus_claimed_by text check(corpus_claimed_by is null or (corpus_claimed_by=btrim(corpus_claimed_by) and char_length(corpus_claimed_by) between 1 and 128)),
  corpus_lease_until timestamptz, corpus_attempt_count integer not null default 0 check(corpus_attempt_count between 0 and 5),
  corpus_next_attempt_at timestamptz not null default now(), corpus_last_error_code text check(corpus_last_error_code is null or corpus_last_error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  created_at timestamptz not null default now(),
  unique(id,parser_rule_id),
  check((corpus_status='running')=(corpus_claim_token is not null and corpus_claimed_by is not null and corpus_lease_until is not null)),
  check((corpus_requested_at is null)=(corpus_requested_by is null and corpus_reason is null))
);
alter table public.parser_rule_versions owner to masarifi_migration;
create unique index parser_rule_versions_rule_number_uq on public.parser_rule_versions(parser_rule_id,version_no);
create unique index parser_rule_versions_rule_hash_uq on public.parser_rule_versions(parser_rule_id,definition_hash);
create index parser_rule_versions_published_idx on public.parser_rule_versions(parser_rule_id,published_at desc);
create index parser_rule_versions_corpus_due_idx on public.parser_rule_versions(corpus_next_attempt_at,id)
  where corpus_status in ('queued','running') and corpus_attempt_count<5;
alter table public.parser_rules add constraint parser_rules_active_version_fk
  foreign key(active_version_id,id) references public.parser_rule_versions(id,parser_rule_id) deferrable initially deferred;

create table public.parser_test_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  parser_version_id uuid not null references public.parser_rule_versions(id) on update restrict on delete cascade,
  name text not null check(name=btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  input_fixture text not null check(octet_length(input_fixture) between 1 and 4096),
  expected_output jsonb not null check(jsonb_typeof(expected_output)='object' and pg_column_size(expected_output)<=8192),
  enabled boolean not null default true,
  last_result text check(last_result is null or last_result in ('passed','failed')),
  last_run_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0)
);
alter table public.parser_test_cases owner to masarifi_migration;
create unique index parser_test_cases_version_name_uq on public.parser_test_cases(parser_version_id,lower(name));
create index parser_test_cases_version_enabled_idx on public.parser_test_cases(parser_version_id,enabled,id);

create table public.tracking_preferences (
  id uuid not null default extensions.gen_random_uuid(),
  user_id text primary key references public.profiles(id) on update restrict on delete cascade,
  enabled boolean not null default false, review_required boolean not null default true,
  duplicate_window_seconds integer not null default 86400 check(duplicate_window_seconds between 60 and 2592000),
  source_retention_days integer not null default 30 check(source_retention_days between 1 and 365),
  history_retention_days integer not null default 365 check(history_retention_days between 30 and 730),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>0), unique(id,user_id)
);
alter table public.tracking_preferences owner to masarifi_migration;

create table public.user_keyword_rules (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  keyword text not null check(keyword=btrim(keyword) and char_length(keyword) between 1 and 120 and keyword !~ '[[:cntrl:]]'),
  group_key text not null check(group_key in ('expense','income','transfer','withdrawal','deposit','refund','subscription','installment','fee','failed_transaction','reversal')),
  language_code char(2) not null check(language_code in ('ar','en')), origin text not null default 'custom' check(origin in ('default','custom')),
  match_type text not null default 'contains' check(match_type in ('exact','contains','safe_pattern')),
  category_id uuid references public.categories(id) on update restrict on delete restrict,
  priority integer not null default 100 check(priority between 0 and 10000), enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0)
);
alter table public.user_keyword_rules owner to masarifi_migration;
create unique index user_keyword_rules_owner_keyword_uq on public.user_keyword_rules(user_id,lower(keyword),match_type);
create index user_keyword_rules_owner_active_idx on public.user_keyword_rules(user_id,priority,id) where enabled;

create table public.user_sender_rules (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  sender_pattern text not null check(sender_pattern=btrim(sender_pattern) and char_length(sender_pattern) between 1 and 256 and sender_pattern !~ '[[:cntrl:]]'),
  display_label text not null check(display_label=btrim(display_label) and char_length(display_label) between 1 and 120 and display_label !~ '[[:cntrl:]]'),
  institution_id uuid references public.financial_institutions(id) on update restrict on delete restrict,
  trusted boolean not null default false, enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0)
);
alter table public.user_sender_rules owner to masarifi_migration;
create unique index user_sender_rules_owner_pattern_uq on public.user_sender_rules(user_id,lower(sender_pattern));
create index user_sender_rules_owner_active_idx on public.user_sender_rules(user_id,id) where enabled;

create table public.merchant_rules (
  id uuid primary key default extensions.gen_random_uuid(), user_id text references public.profiles(id) on update restrict on delete cascade,
  pattern text not null check(pattern=btrim(pattern) and char_length(pattern) between 1 and 256 and pattern !~ '[[:cntrl:]]'),
  normalized_merchant text not null check(normalized_merchant=btrim(normalized_merchant) and char_length(normalized_merchant) between 1 and 160 and normalized_merchant !~ '[[:cntrl:]]'),
  priority integer not null default 100 check(priority between 0 and 10000), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0)
);
alter table public.merchant_rules owner to masarifi_migration;
create unique index merchant_rules_global_pattern_uq on public.merchant_rules(lower(pattern)) where user_id is null;
create unique index merchant_rules_owner_pattern_uq on public.merchant_rules(user_id,lower(pattern)) where user_id is not null;
create index merchant_rules_owner_active_idx on public.merchant_rules(user_id,priority,id) where active;

create table public.category_rules (
  id uuid primary key default extensions.gen_random_uuid(), user_id text references public.profiles(id) on update restrict on delete cascade,
  pattern text not null check(pattern=btrim(pattern) and char_length(pattern) between 1 and 256 and pattern !~ '[[:cntrl:]]'),
  category_id uuid not null references public.categories(id) on update restrict on delete restrict,
  priority integer not null default 100 check(priority between 0 and 10000), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0)
);
alter table public.category_rules owner to masarifi_migration;
create unique index category_rules_global_pattern_uq on public.category_rules(lower(pattern)) where user_id is null;
create unique index category_rules_owner_pattern_uq on public.category_rules(user_id,lower(pattern)) where user_id is not null;
create index category_rules_owner_active_idx on public.category_rules(user_id,priority,id) where active;

create table public.import_sessions (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  source_type text not null check(source_type in ('sms','file','manual','provider')),
  source_name text check(source_name is null or (source_name=btrim(source_name) and char_length(source_name) between 1 and 120 and source_name !~ '[[:cntrl:]]' and position('/' in source_name)=0 and position(chr(92) in source_name)=0)),
  schema_version integer not null default 1 check(schema_version=1), request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check(status in ('received','processing','review','complete','failed','cancelled')),
  item_count integer not null default 0 check(item_count between 0 and 10000), accepted_count integer not null default 0 check(accepted_count>=0),
  rejected_count integer not null default 0 check(rejected_count>=0), attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  claim_token uuid, claimed_by text, lease_until timestamptz, next_attempt_at timestamptz not null default now(), last_error_code text,
  started_at timestamptz not null default now(), completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
  unique(id,user_id), check(accepted_count+rejected_count<=item_count),
  check((claim_token is null and claimed_by is null and lease_until is null) or (claim_token is not null and claimed_by is not null and lease_until is not null)),
  check((status in ('complete','failed','cancelled'))=(completed_at is not null))
);
alter table public.import_sessions owner to masarifi_migration;
create index import_sessions_owner_status_cursor_idx on public.import_sessions(user_id,status,started_at desc,id desc);
create index import_sessions_claim_idx on public.import_sessions(next_attempt_at,started_at,id) where status in ('received','processing');
create unique index import_sessions_owner_request_uq on public.import_sessions(user_id,request_hash);

create table public.import_items (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  session_id uuid not null, source_item_key text not null check(source_item_key=btrim(source_item_key) and char_length(source_item_key) between 1 and 160 and source_item_key !~ '[[:cntrl:]]'),
  normalized_hash text not null check(normalized_hash ~ '^[0-9a-f]{64}$'), source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  parser_version_id uuid references public.parser_rule_versions(id) on update restrict on delete restrict,
  applied_rule_ids uuid[] not null default '{}' check(cardinality(applied_rule_ids)<=32), occurred_at timestamptz,
  amount_minor bigint check(amount_minor is null or (amount_minor between -9007199254740991 and 9007199254740991 and amount_minor<>0)),
  currency_code char(3) references public.currencies(code) on update restrict on delete restrict,
  merchant text check(merchant is null or (merchant=btrim(merchant) and char_length(merchant) between 1 and 160 and merchant !~ '[[:cntrl:]]')),
  normalized_payload jsonb not null default '{}' check(jsonb_typeof(normalized_payload)='object' and pg_column_size(normalized_payload)<=8192),
  confidence_basis_points integer not null default 0 check(confidence_basis_points between 0 and 10000),
  status text not null default 'parsed' check(status in ('parsed','review','accepted','rejected','duplicate','failed')),
  transaction_id uuid, operation_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
  unique(id,user_id), constraint import_items_session_owner_fk foreign key(session_id,user_id) references public.import_sessions(id,user_id) on update restrict on delete cascade,
  constraint import_items_transaction_owner_fk foreign key(transaction_id,user_id) references public.transactions(id,user_id) on update restrict on delete restrict,
  check((status in ('accepted','duplicate'))=(transaction_id is not null))
);
alter table public.import_items owner to masarifi_migration;
create unique index import_items_session_source_uq on public.import_items(session_id,source_item_key);
create index import_items_owner_hash_idx on public.import_items(user_id,normalized_hash);
create index import_items_session_status_idx on public.import_items(session_id,status,id);
create index import_items_owner_cursor_idx on public.import_items(user_id,occurred_at desc,id desc);
create unique index import_items_operation_uq on public.import_items(operation_id) where operation_id is not null;
create index import_items_owner_review_idx on public.import_items(user_id,status,occurred_at,id) where status in ('parsed','review');

create table private.import_attempts (
  id uuid primary key default extensions.gen_random_uuid(), session_id uuid not null references public.import_sessions(id) on update restrict on delete cascade,
  attempt_no integer not null check(attempt_no>0), worker_id text not null check(worker_id=btrim(worker_id) and char_length(worker_id) between 1 and 128),
  fence_token uuid not null, status text not null default 'running' check(status in ('running','succeeded','failed')),
  started_at timestamptz not null default now(), completed_at timestamptz, lease_until timestamptz not null,
  error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'), created_at timestamptz not null default now(),
  unique(session_id,attempt_no), unique(fence_token), check((status='running')=(completed_at is null)), check(lease_until>started_at)
);
alter table private.import_attempts owner to masarifi_migration;
create index import_attempts_running_lease_idx on private.import_attempts(lease_until,session_id) where status='running';
create index import_attempts_status_started_idx on private.import_attempts(status,started_at);

create table private.raw_ingestion_payloads (
  id uuid primary key default extensions.gen_random_uuid(), session_id uuid references public.import_sessions(id) on update restrict on delete cascade,
  item_id uuid references public.import_items(id) on update restrict on delete set null,
  storage_ref text check(storage_ref is null or (storage_ref ~ '^tracking/[0-9a-f-]{36}/[0-9a-f-]{36}$' and char_length(storage_ref)<=300)),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'), content_type text not null check(content_type in ('text/csv','application/json')),
  size_bytes bigint not null check(size_bytes between 1 and 6291456), scan_status text not null default 'clean' check(scan_status in ('clean','cleanup','purging','purged')),
  expires_at timestamptz not null, purge_token uuid, purge_lease_until timestamptz, purged_at timestamptz, created_at timestamptz not null default now(),
  unique(session_id,payload_hash), unique(storage_ref), check(expires_at>created_at),
  check((scan_status='clean' and session_id is not null and storage_ref is not null and purge_token is null and purge_lease_until is null and purged_at is null)
    or (scan_status='cleanup' and session_id is null and storage_ref is not null and purge_token is null and purge_lease_until is null and purged_at is null)
    or (scan_status='purging' and storage_ref is not null and purge_token is not null and purge_lease_until is not null and purged_at is null)
    or (scan_status='purged' and storage_ref is null and purge_token is null and purge_lease_until is null and purged_at is not null))
);
alter table private.raw_ingestion_payloads owner to masarifi_migration;
create index raw_ingestion_payloads_expiry_idx on private.raw_ingestion_payloads(expires_at,purge_lease_until,id) where scan_status in ('clean','cleanup','purging');

create table public.review_items (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  import_item_id uuid not null, reason text not null check(reason ~ '^[a-z][a-z0-9_]{1,79}$'),
  proposed_values jsonb not null check(jsonb_typeof(proposed_values)='object' and pg_column_size(proposed_values)<=8192),
  original_values jsonb not null check(jsonb_typeof(original_values)='object' and pg_column_size(original_values)<=8192),
  accepted_values jsonb check(accepted_values is null or (jsonb_typeof(accepted_values)='object' and pg_column_size(accepted_values)<=8192)),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','edited')),
  decision_token uuid, decision_action text check(decision_action is null or decision_action in ('accept','reject','edit_accept')),
  decision_lease_until timestamptz,
  reviewed_at timestamptz, reviewed_by text references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
  unique(id,user_id), constraint review_items_item_owner_fk foreign key(import_item_id,user_id) references public.import_items(id,user_id) on update restrict on delete cascade,
  check((status='pending')=(reviewed_at is null and reviewed_by is null)), check(reviewed_by is null or reviewed_by=user_id),
  check((decision_token is null)=(decision_action is null)), check(decision_lease_until is null or decision_token is not null),
  check(status='pending' or decision_lease_until is null)
);
alter table public.review_items owner to masarifi_migration;
create unique index review_items_pending_item_uq on public.review_items(import_item_id) where status='pending';
create index review_items_owner_status_cursor_idx on public.review_items(user_id,status,created_at desc,id desc);
create index review_items_decision_lease_idx on public.review_items(decision_lease_until,id) where status='pending' and decision_token is not null;

create table public.duplicate_candidates (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  left_item_id uuid not null, right_transaction_id uuid not null,
  score numeric(5,4) not null check(score between 0 and 1), score_version integer not null default 1 check(score_version>0),
  reasons text[] not null check(cardinality(reasons) between 1 and 8), status text not null default 'proposed' check(status in ('proposed','duplicate','not_duplicate')),
  resolution text check(resolution is null or resolution in ('keep_existing','keep_new','keep_both','merge_details')),
  decision_token uuid, decision_action text check(decision_action is null or decision_action in ('keep_existing','keep_new','keep_both','merge_details')),
  decision_lease_until timestamptz,
  decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
  unique(id,user_id), constraint duplicate_candidates_item_owner_fk foreign key(left_item_id,user_id) references public.import_items(id,user_id) on update restrict on delete cascade,
  constraint duplicate_candidates_transaction_owner_fk foreign key(right_transaction_id,user_id) references public.transactions(id,user_id) on update restrict on delete restrict,
  check((status='proposed')=(decided_at is null and resolution is null)),
  check((decision_token is null)=(decision_action is null)), check(decision_lease_until is null or decision_token is not null),
  check(status='proposed' or decision_lease_until is null)
);
alter table public.duplicate_candidates owner to masarifi_migration;
create unique index duplicate_candidates_pair_uq on public.duplicate_candidates(left_item_id,right_transaction_id);
create index duplicate_candidates_owner_status_score_idx on public.duplicate_candidates(user_id,status,score desc,id);
create index duplicate_candidates_decision_lease_idx on public.duplicate_candidates(decision_lease_until,id) where status='proposed' and decision_token is not null;

create table public.tracking_history (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  source_type text not null check(source_type in ('sms','file','manual','provider')), source_ref text not null check(source_ref=btrim(source_ref) and char_length(source_ref) between 1 and 160),
  outcome text not null check(outcome in ('received','parsed','reviewed','accepted','rejected','duplicate','failed','purged','feedback')),
  reason_codes text[] not null default '{}' check(cardinality(reason_codes)<=8), parser_version_id uuid references public.parser_rule_versions(id) on update restrict on delete restrict,
  applied_rule_ids uuid[] not null default '{}' check(cardinality(applied_rule_ids)<=32), review_item_id uuid references public.review_items(id) on update restrict on delete restrict,
  duplicate_candidate_id uuid references public.duplicate_candidates(id) on update restrict on delete restrict, operation_id uuid,
  transaction_id uuid, occurred_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(id,user_id),
  constraint tracking_history_transaction_owner_fk foreign key(transaction_id,user_id) references public.transactions(id,user_id) on update restrict on delete restrict
);
alter table public.tracking_history owner to masarifi_migration;
create index tracking_history_owner_cursor_idx on public.tracking_history(user_id,occurred_at desc,id desc);
create index tracking_history_owner_source_idx on public.tracking_history(user_id,source_ref);

create table public.tracking_feedback (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  history_id uuid not null, feedback_type text not null check(feedback_type in ('wrong_detection','wrong_category','wrong_merchant','duplicate_missed','other')),
  corrected_category_id uuid references public.categories(id) on update restrict on delete restrict,
  comment text check(comment is null or (comment=btrim(comment) and char_length(comment) between 1 and 1000 and comment !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(), constraint tracking_feedback_history_owner_fk foreign key(history_id,user_id) references public.tracking_history(id,user_id) on update restrict on delete restrict,
  check(corrected_category_id is null or feedback_type='wrong_category')
);
alter table public.tracking_feedback owner to masarifi_migration;
create unique index tracking_feedback_owner_history_type_uq on public.tracking_feedback(user_id,history_id,feedback_type);
create index tracking_feedback_owner_cursor_idx on public.tracking_feedback(user_id,created_at desc,id);

create table public.unsupported_formats (
  id uuid primary key default extensions.gen_random_uuid(), user_id text not null references public.profiles(id) on update restrict on delete cascade,
  session_id uuid not null, content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check(reason ~ '^[A-Z][A-Z0-9_]{1,79}$'), sample_redacted text check(sample_redacted is null or (octet_length(sample_redacted)<=4096 and sample_redacted !~ '[[:cntrl:]]')),
  status text not null default 'open' check(status in ('open','covered','ignored')), reviewed_at timestamptz, reviewed_by text references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
  constraint unsupported_formats_session_owner_fk foreign key(session_id,user_id) references public.import_sessions(id,user_id) on update restrict on delete cascade,
  check((status='open')=(reviewed_at is null and reviewed_by is null))
);
alter table public.unsupported_formats owner to masarifi_migration;
create unique index unsupported_formats_session_hash_uq on public.unsupported_formats(session_id,content_hash);
create index unsupported_formats_status_cursor_idx on public.unsupported_formats(status,updated_at desc,id);
create index unsupported_formats_owner_cursor_idx on public.unsupported_formats(user_id,created_at desc,id);

create trigger tracking_financial_institutions_version before update on public.financial_institutions for each row execute function private.set_updated_at_and_version();
create trigger tracking_institution_senders_version before update on public.institution_senders for each row execute function private.set_updated_at_and_version();
create trigger tracking_parser_rules_version before update on public.parser_rules for each row execute function private.set_updated_at_and_version();
create trigger tracking_parser_test_cases_version before update on public.parser_test_cases for each row execute function private.set_updated_at_and_version();
create trigger tracking_preferences_version before update on public.tracking_preferences for each row execute function private.set_updated_at_and_version();
create trigger tracking_user_keyword_rules_version before update on public.user_keyword_rules for each row execute function private.set_updated_at_and_version();
create trigger tracking_user_sender_rules_version before update on public.user_sender_rules for each row execute function private.set_updated_at_and_version();
create trigger tracking_merchant_rules_version before update on public.merchant_rules for each row execute function private.set_updated_at_and_version();
create trigger tracking_category_rules_version before update on public.category_rules for each row execute function private.set_updated_at_and_version();
create trigger tracking_import_sessions_version before update on public.import_sessions for each row execute function private.set_updated_at_and_version();
create trigger tracking_import_items_version before update on public.import_items for each row execute function private.set_updated_at_and_version();
create trigger tracking_review_items_version before update on public.review_items for each row execute function private.set_updated_at_and_version();
create trigger tracking_duplicate_candidates_version before update on public.duplicate_candidates for each row execute function private.set_updated_at_and_version();
create trigger tracking_unsupported_formats_version before update on public.unsupported_formats for each row execute function private.set_updated_at_and_version();

create trigger tracking_history_immutable before update or delete on public.tracking_history for each row execute function private.reject_immutable_change();
create trigger tracking_feedback_immutable before update or delete on public.tracking_feedback for each row execute function private.reject_immutable_change();
reset role;
revoke masarifi_migration from current_user;
