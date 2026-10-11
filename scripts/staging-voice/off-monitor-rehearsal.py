"""Separately approved OFF-only helper rehearsal. Never controls financial epochs."""
import importlib.util
import json
import pathlib
import signal
import sys

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('off_operating_control', HERE / 'customer-operating-cohort.py')
operating = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operating)
require = operating.require
GuardError = operating.GuardError
SERVICES = {'masarifi-staging-api-1': ('api', True),
            'masarifi-staging-analysis-worker-1': ('analysis-worker', True),
            'masarifi-staging-assistant-worker-1': ('assistant-worker', True),
            'masarifi-staging-voice-epoch-1': ('voice-epoch', False),
            'masarifi-staging-worker-1': ('worker', False)}


def packet_hash(packet):
    return operating.canonical_hash({key: value for key, value in packet.items() if key != 'approval'})


def configuration_hash(container):
    return operating.canonical_hash({key: container.get(key) for key in ('Config', 'HostConfig', 'Mounts', 'Image')})


def validate_packet(packet, now):
    fields = {'version', 'kind', 'host', 'project', 'generation', 'sourceSha', 'imageDigest',
              'expiresAt', 'requiredMigrations', 'files', 'cohort', 'baseline', 'financialEpochAuthority', 'approval'}
    require(isinstance(packet, dict) and set(packet) == fields, 'OFF_PACKET_FIELDS_INVALID')
    require(type(packet['version']) is int and packet['version'] == 1 and
            packet['kind'] == 'posting-off-helper-rehearsal' and packet['host'] == 'srv2006836' and
            packet['project'] == operating.PROJECT, 'OFF_STAGING_SCOPE_REQUIRED')
    require(operating.UUID.fullmatch(packet['generation']) and operating.SHA.fullmatch(packet['sourceSha']) and
            operating.valid_hash(packet['imageDigest']), 'OFF_EXACT_SOURCE_IMAGE_REQUIRED')
    require(packet['financialEpochAuthority'] is None, 'OFF_FINANCIAL_EPOCH_AUTHORITY_FORBIDDEN')
    approval = packet['approval']
    require(isinstance(approval, dict) and approval.get('kind') == 'direct-human-posting-off-rehearsal-approval' and
            approval.get('packetHash') == packet_hash(packet), 'DIRECT_HUMAN_OFF_APPROVAL_REQUIRED')
    received, expires = operating.instant(approval.get('receivedAt')), operating.instant(packet['expiresAt'])
    require(received <= now < expires <= received + 3600, 'OFF_APPROVAL_WINDOW_INVALID')
    require(all(isinstance(approval.get(key), str) and 8 <= len(approval[key].strip()) <= maximum
                for key, maximum in (('messageReference', 256), ('verbatimMessage', 4096))), 'OFF_HUMAN_EVIDENCE_REQUIRED')
    require(packet['requiredMigrations'] == operating.MIGRATIONS and
            set(packet['files']) == {'customer-operating-cohort.py', 'off-monitor-rehearsal.py'} and
            all(operating.valid_hash(value) for value in packet['files'].values()), 'OFF_CONTROL_PINS_REQUIRED')
    cohort = packet['cohort']
    require(set(cohort) == {'observedAt', 'composeFiles', 'envHashes', 'databaseCAHash', 'backupDigest',
                           'backupRestoreReceiptHash', 'services', 'containerIDs', 'runningIDs'} and
            0 <= now - operating.instant(cohort['observedAt']) <= 900, 'OFF_FRESH_COHORT_REQUIRED')
    require([entry.get('path') for entry in cohort['composeFiles']] ==
            [operating.COHORT + '/' + name for name in operating.COMPOSE_NAMES] and
            all(operating.valid_hash(entry.get('sha256')) for entry in cohort['composeFiles']) and
            set(cohort['envHashes']) == operating.ENV_NAMES and
            all(operating.valid_hash(value) for value in cohort['envHashes'].values()) and
            all(operating.valid_hash(cohort[key]) for key in ('databaseCAHash', 'backupDigest', 'backupRestoreReceiptHash')),
            'OFF_PROTECTED_PINS_AND_BACKUP_REQUIRED')
    require(len(cohort['services']) == 5 and {entry.get('name') for entry in cohort['services']} == set(SERVICES) and
            all(set(entry) == {'name', 'id', 'service', 'sourceSha', 'imageDigest', 'configurationHash'} and
                operating.valid_hash(entry['id']) and operating.SHA.fullmatch(entry['sourceSha']) and
                all(operating.valid_hash(entry[key]) for key in ('imageDigest', 'configurationHash')) and
                entry['service'] == SERVICES[entry['name']][0] for entry in cohort['services']), 'OFF_SERVICE_PINS_REQUIRED')
    for key in ('containerIDs', 'runningIDs'):
        values = cohort[key]
        require(isinstance(values, list) and len(values) <= 2048 and len(values) == len(set(values)) and
                all(operating.valid_hash(value) for value in values), 'OFF_CONTAINER_INVENTORY_REQUIRED')
    require(set(cohort['runningIDs']).issubset(cohort['containerIDs']) and
            {entry['id'] for entry in cohort['services']}.issubset(cohort['containerIDs']), 'OFF_CONTAINER_INVENTORY_REQUIRED')
    checked_snapshot(packet['baseline'], packet)
    return packet


def checked_snapshot(snapshot, packet):
    require(isinstance(snapshot, dict) and set(snapshot) ==
            {'posting', 'activeEpochs', 'analysisJobs', 'migrations', 'fingerprints', 'historical'} and
            snapshot['posting'] is False and type(snapshot['activeEpochs']) is int and snapshot['activeEpochs'] == 0 and
            type(snapshot['analysisJobs']) is int and snapshot['analysisJobs'] == 0, 'OFF_POSTING_AND_EPOCHS_REQUIRED')
    require(set(operating.MIGRATIONS).issubset(snapshot['migrations']) and
            set(snapshot['fingerprints']) == {'accounts', 'transactions', 'postings', 'balances'} and
            all(operating.valid_hash(value) for value in snapshot['fingerprints'].values()) and
            set(snapshot['historical']) == {'voicePending', 'assistantPending', 'outboxUnpublished'} and
            all(type(value) is int and 0 <= value <= 2147483647 for value in snapshot['historical'].values()),
            'OFF_DATABASE_BASELINE_INVALID')
    require(snapshot == packet['baseline'], 'OFF_FINANCIAL_OR_HISTORICAL_DRIFT')
    return snapshot


def check_pins(packet, host):
    validate_packet(packet, host.now())
    host.target(packet['generation'])
    require(host.read_json('packet.json') == packet, 'OFF_PACKET_FILE_CHANGED')
    for name, digest in packet['files'].items(): host.pin(host.root / name, digest)
    for entry in packet['cohort']['composeFiles']: host.pin(entry['path'], entry['sha256'])
    for name, digest in packet['cohort']['envHashes'].items(): host.pin('/etc/masarifi/' + name, digest)
    host.pin('/etc/masarifi/supabase-ca.crt', packet['cohort']['databaseCAHash'])
    host.pin(host.root / 'backup-restore.json', packet['cohort']['backupRestoreReceiptHash'])
    backup = host.read_json('backup-restore.json')
    require(backup.get('restoreVerified') is True and backup.get('backupDigest') == packet['cohort']['backupDigest'] and
            0 <= host.now() - operating.instant(backup.get('observedAt')) <= 900 and
            backup.get('financialFingerprints') == packet['baseline']['fingerprints'] and
            backup.get('requiredMigrations') == packet['requiredMigrations'] and
            backup.get('cohortHash') == operating.canonical_hash({key: value for key, value in packet['cohort'].items()
                if key not in ('backupDigest', 'backupRestoreReceiptHash')}),
            'OFF_BACKUP_RESTORE_UNVERIFIED')


def preserved_cohort(packet, host):
    for entry in packet['cohort']['services']:
        expected_running = SERVICES[entry['name']][1]
        container = operating.checked_cohort(host, entry['name'], entry['service'], entry['id'], entry['sourceSha'],
                                             operating.IMAGE_PREFIX + entry['imageDigest'], expected_running)
        require(configuration_hash(container) == entry['configurationHash'], 'OFF_SHARED_CONFIGURATION_CHANGED')
        if entry['service'] in ('api', 'analysis-worker'):
            require(operating.environment(container).get('MASARIFI_VOICE_ANALYSIS_ONLY') == 'true', 'OFF_ANALYSIS_MODE_REQUIRED')
        if entry['service'] == 'assistant-worker':
            require(operating.environment(container).get('MASARIFI_AI_ASSISTANT_ONLY') == 'true', 'OFF_ASSISTANT_SCOPE_REQUIRED')
    helper_ids, running_helpers = set(), set()
    for role in ('control', 'close'):
        journal = host.read_runner(role)
        if journal:
            runner = operating.checked_database_runner(host, journal)
            helper_ids.add(runner['Id'])
            if runner['State']['Running']: running_helpers.add(runner['Id'])
    for all_containers, expected in ((True, set(packet['cohort']['containerIDs']) | helper_ids),
                                      (False, set(packet['cohort']['runningIDs']) | running_helpers)):
        command = ['docker', 'ps'] + (['-a'] if all_containers else []) + ['--no-trunc', '--format', '{{.ID}}']
        values = host.run(command).splitlines()
        require(all(operating.valid_hash(value) for value in values) and len(values) == len(set(values)) and
                set(values) == expected, 'OFF_CONTAINER_INVENTORY_CHANGED')


OFF_DATABASE_SCRIPT = r"""
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
let stage='configuration';
(async()=>{
assert.equal(process.env.MASARIFI_PROCESS_KIND,'migration');
assert.equal(process.env.OPERATING_ACTION,'status');
const c=JSON.parse(process.env.OPERATING_CONTROL);assert.deepEqual(Object.keys(c),['project']);
assert.equal(c.project,'qcffvfbpzvpwcwxwjyro');
const url=new URL(process.env.DATABASE_URL);
assert(url.hostname.endsWith('.supabase.com')&&decodeURIComponent(url.username).endsWith('.'+c.project));
const {Pool}=createRequire('/app/dist/src/ai/ai.worker.js')('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:15000});
stage='connection';const db=await pool.connect();try{
stage='transaction';await db.query('begin isolation level repeatable read read only');
await db.query("set local statement_timeout='15s'");
stage='status';const row=(await db.query(`select
 (select enabled from private.voice_automatic_policy) posting,
 (select count(*)::int from private.staging_voice_epochs where state='active') "activeEpochs",
 (select count(*)::int from public.voice_sessions s join private.voice_batch_context x on x.session_id=s.id
  where x.analysis_only and s.status in ('uploaded','processing')) "analysisJobs",
 (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations) migrations,
 jsonb_build_object('voicePending',(select count(*)::int from public.voice_sessions where status in ('uploaded','processing')),
 'assistantPending',(select count(*)::int from public.assistant_messages where work_status in ('queued','processing')),
 'outboxUnpublished',(select count(*)::int from private.outbox_events where published_at is null)) historical`)).rows[0];
assert(row.posting===false&&row.activeEpochs===0&&row.analysisJobs===0);
stage='fingerprints';const fingerprints={};
for(const [name,table,key] of [['accounts','public.accounts','id'],['transactions','public.transactions','id'],
 ['postings','public.transaction_postings','id'],['balances','public.account_balances','account_id']]){
 const rows=(await db.query(`select to_jsonb(t) row from ${table} t order by ${key} limit 10001`)).rows;
 assert(rows.length<=10000);fingerprints[name]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
stage='commit';await db.query('commit');console.log(JSON.stringify({...row,fingerprints}));
}catch(error){try{await db.query('rollback');}catch{}throw error;}finally{db.release();await pool.end();}
})().catch(error=>{const code=/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:error.code==='ERR_ASSERTION'?'ERR_ASSERTION':'UNAVAILABLE';
console.error(JSON.stringify({error:'OPERATING_DATABASE_FAILED',action:'status',stage:stage==='fingerprints'?'status':stage,code}));process.exitCode=1;});
"""


def status_command(identity):
    require(operating.valid_hash(identity), 'OFF_HELPER_ID_REQUIRED')
    return ['docker', 'exec', '-e', 'OPERATING_ACTION=status', '-e',
            'OPERATING_CONTROL=' + json.dumps({'project': operating.PROJECT}, separators=(',', ':')),
            identity, '/nodejs/bin/node', '-e', OFF_DATABASE_SCRIPT]


def helper_identity(packet):
    return {'generation': packet['generation'], 'sourceSha': packet['sourceSha'], 'imageDigest': packet['imageDigest'],
            'migrationEnvHash': packet['cohort']['envHashes']['migration.env'],
            'databaseCAHash': packet['cohort']['databaseCAHash']}


def cleanup(host):
    state = host.read_json('runtime.json')
    require(isinstance(state, dict) and state.get('kind') == 'posting-off-helper-rehearsal' and
            operating.UUID.fullmatch(state.get('generation', '')) and operating.SHA.fullmatch(state.get('sourceSha', '')) and
            operating.valid_hash(state.get('imageDigest')), 'OFF_CLEANUP_JOURNAL_REQUIRED')
    host.target(state['generation'], incident=True)
    previous_deadline, previous_timeout = host.closure_deadline, host.closure_command_timeout
    previous_cleanup = getattr(host, 'cleanup_identity', None)
    host.cleanup_identity = state
    host.closure_deadline, host.closure_command_timeout = host.monotonic() + 150, 10
    try:
        for role in ('control', 'close'):
            journal = host.read_runner(role)
            if journal and journal['id'] is None:
                # A create timeout may have left the exact guarded helper.
                # Reconcile its ID only for stopping; never create a replacement.
                try:
                    runner = operating.checked_database_runner(host, journal)
                    journal['id'] = runner['Id']
                    host.write_runner(role, journal)
                except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError):
                    pass
        host.stop_database_runners(state)
        state['phase'] = 'closed'
        host.write_state(state)
        return {'helpersStoppedConfirmed': True, 'financialEpochClosureExercised': False,
                'financialEpochClosureBlocker': 'NO_APPROVED_OWNED_FINANCIAL_EPOCH_AUTHORITY'}
    finally:
        host.closure_deadline, host.closure_command_timeout = previous_deadline, previous_timeout
        host.cleanup_identity = previous_cleanup


def rehearse(packet, host):
    check_pins(packet, host)
    with host.deployment_lock():
        preserved_cohort(packet, host)
        require(host.read_json('runtime.json') is None, 'OFF_GENERATION_ALREADY_USED')
        state = {**helper_identity(packet), 'version': 1, 'kind': 'posting-off-helper-rehearsal',
                 'packetHash': packet_hash(packet), 'phase': 'running'}
        host.write_state(state, initial=True)
        try:
            for role in ('control', 'close'): host.status(packet, role)
            # Exercise only this exact idle helper's stop/restart lifecycle.
            journal = host.read_runner('control')
            runner = operating.checked_database_runner(host, journal)
            host.run(['docker', 'stop', '--time', '1', runner['Id']], timeout=10)
            for role in ('control', 'close'): host.status(packet, role)
            preserved_cohort(packet, host)
            receipt = {'postingOffConfirmed': True, 'financialAndHistoricalBaselineUnchanged': True,
                       'sharedCohortPreserved': True, 'helperIDs': [host.read_runner(role)['id'] for role in ('control', 'close')]}
        finally:
            stopped = cleanup(host)
        return {**receipt, **stopped}


def rehearsal_unit(packet, root):
    command = '/usr/bin/python3 ' + str(root / 'off-monitor-rehearsal.py')
    return ('[Unit]\nDescription=Approved Posting-OFF helper rehearsal\nAfter=docker.service\nRequires=docker.service\n'
            '[Service]\nType=oneshot\nUser=root\nExecStart=' + command + ' rehearse\nExecStopPost=' + command +
            ' cleanup\nRestart=no\nTimeoutStartSec=300\nTimeoutStopSec=180\n')


class RehearsalHost(operating.LocalHost):
    def db(self, packet, action, state=None):
        require(action == 'status' and state is None, 'OFF_DATABASE_WRITE_FORBIDDEN')
        return self.status(packet, 'control')

    def status(self, packet, role):
        require(role in ('control', 'close'), 'OFF_HELPER_ROLE_INVALID')
        check_pins(packet, self)
        preserved_cohort(packet, self)
        with self.runner_lock(role):
            identity = operating.retained_database_runner(self, helper_identity(packet), role)
            journal = self.read_runner(role)
            journal['phase'] = 'executing'
            self.write_runner(role, journal)
            try:
                snapshot = operating.parse_json(self.run(status_command(identity)))
                checked_snapshot(snapshot, packet)
                check_pins(packet, self)
                preserved_cohort(packet, self)
            except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError):
                try: self.run(['docker', 'stop', '--time', '1', identity], timeout=10)
                except (GuardError, RuntimeError, OSError): pass
                raise
            journal['phase'] = 'idle'
            self.write_runner(role, journal)
            return snapshot

    def run(self, command, timeout=30, environment=None):
        # Deny by default even if a future caller passes an operating command.
        cleanup_state = getattr(self, 'cleanup_identity', None)
        state = cleanup_state or self.read_json('runtime.json') or self.read_json('packet.json')
        require(state.get('kind') == 'posting-off-helper-rehearsal', 'OFF_COMMAND_SCOPE_REQUIRED')
        identity = {key: state[key] for key in ('generation', 'sourceSha', 'imageDigest')}
        names, ids = set(), set()
        for role in ('control', 'close'):
            create = operating.database_runner_command(identity, role)
            names.add(create[create.index('--name') + 1])
            journal = self.read_runner(role)
            if journal and operating.valid_hash(journal.get('id')): ids.add(journal['id'])
        allowed = len(command) == 3 and command[:2] == ['docker', 'inspect'] and command[-1] in ids | names
        allowed |= len(command) == 5 and command[:4] == ['docker', 'stop', '--time', '1'] and command[-1] in ids
        if cleanup_state:
            require(allowed and environment is None, 'OFF_CLEANUP_COMMAND_FORBIDDEN')
            return operating.LocalHost.run(self, command, timeout, environment)
        packet = self.read_json('packet.json')
        validate_packet(packet, self.now())
        allowed |= command in [operating.database_runner_command(identity, role) for role in ('control', 'close')]
        allowed |= command == ['docker', 'image', 'inspect', operating.IMAGE_PREFIX + identity['imageDigest']]
        if packet:
            allowed |= len(command) == 3 and command[:2] == ['docker', 'inspect'] and command[-1] in {
                entry[key] for entry in packet['cohort']['services'] for key in ('name', 'id')}
        allowed |= command in ([ 'docker', 'ps', '--no-trunc', '--format', '{{.ID}}'],
                              ['docker', 'ps', '-a', '--no-trunc', '--format', '{{.ID}}'])
        allowed |= any(command == ['docker', 'ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'] for name in names)
        allowed |= len(command) == 3 and command[:2] == ['docker', 'start'] and command[-1] in ids
        allowed |= any(command == status_command(helper_id) for helper_id in ids)
        require(allowed and environment is None, 'OFF_HOST_COMMAND_FORBIDDEN')
        check_pins(packet, self)
        return operating.LocalHost.run(self, command, timeout, environment)


def main():
    arguments = sys.argv[1:]
    require(len(arguments) == 1 and arguments[0] in ('rehearse', 'cleanup'), 'OFF_COMMAND_INVALID')
    host = RehearsalHost(HERE)
    if arguments[0] == 'cleanup': result = cleanup(host)
    else:
        def interrupted(_signal, _frame): raise GuardError('OFF_REHEARSAL_INTERRUPTED')
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        result = rehearse(host.read_json('packet.json'), host)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        print(json.dumps({'error': operating.safe_reason(error)}))
        sys.exit(1)
