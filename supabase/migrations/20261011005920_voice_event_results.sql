-- Additive read projection only. Existing receipt/execution capabilities are unchanged.
grant masarifi_migration to current_user with set true,inherit false;
set local role masarifi_migration;

create function private.get_voice_batch_event_result(p_user text,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; outcomes jsonb;
begin
  -- Reuse the authoritative owner/deletion/contract fence and legacy receipt.
  result:=private.get_voice_batch_result(p_user,p_session);
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinal',e.ordinal,
    'kind',case when e.status='committed' and t.kind in ('expense','income') then t.kind
                when e.status='eligible' and c.command->>'kind' in ('expense','income') then c.command->>'kind'
                else null end,
    'status',e.status,'reason',e.reason_code,
    'transactionId',case when e.status='committed' then e.transaction_id else null end
  ) order by e.ordinal),'[]'::jsonb) into outcomes
  from private.voice_batches b
  join private.voice_events e on e.batch_id=b.id and e.user_id=p_user
  left join private.voice_event_commands c on c.event_id=e.id and c.user_id=p_user
  left join public.transactions t on t.id=e.transaction_id and t.user_id=p_user
  where b.session_id=p_session and b.user_id=p_user;
  return result||jsonb_build_object('outcomes',outcomes);
end $$;

create function private.list_voice_batch_event_recovery(p_user text,p_after timestamptz,p_after_id uuid,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare legacy jsonb; items jsonb;
begin
  -- Preserve the existing bounded owner-scoped cursor and recovery window.
  legacy:=private.list_voice_batch_recovery(p_user,p_after,p_after_id,p_limit);
  select coalesce(jsonb_agg(item||jsonb_build_object('outcomes',
    private.get_voice_batch_event_result(p_user,(item->>'sessionId')::uuid)->'outcomes'
  ) order by ordinal),'[]'::jsonb) into items
  from jsonb_array_elements(legacy->'items') with ordinality rows(item,ordinal);
  return jsonb_build_object('items',items);
end $$;

revoke all on function private.get_voice_batch_event_result(text,uuid),private.list_voice_batch_event_recovery(text,timestamptz,uuid,integer) from public,anon,authenticated,masarifi_api,masarifi_worker;
grant execute on function private.get_voice_batch_event_result(text,uuid),private.list_voice_batch_event_recovery(text,timestamptz,uuid,integer) to masarifi_api;
reset role;
revoke masarifi_migration from current_user;
