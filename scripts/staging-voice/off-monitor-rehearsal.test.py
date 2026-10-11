"""OFF-only adapter behavior against inert Docker/pg boundaries."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import types
import unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).parent


def load(name, filename):
    if not filename.exists():
        return None
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


existing = load('operating_fixture', HERE / 'customer-operating-cohort.test.py')
adapter = load('off_rehearsal', HERE / 'off-monitor-rehearsal.py')
if adapter is not None:
    existing.adapter = adapter.operating


def hash_bytes(content):
    return hashlib.sha256(content).hexdigest()


def approve(packet):
    packet['approval'] = {'kind': 'direct-human-posting-off-rehearsal-approval',
        'packetHash': adapter.packet_hash(packet), 'receivedAt': '2026-10-11T06:20:00Z',
        'messageReference': 'local-fixture-approval-reference',
        'verbatimMessage': 'Approve only these exact OFF helper lifecycle operations; no financial epoch changes.'}


class FixtureHost(existing.RetainedDockerHost):
    def __init__(self):
        super().__init__()
        original = self.packet
        services = []
        for container in self.containers.values():
            services.append({'name': container['Name'][1:], 'id': container['Id'],
                'service': container['Config']['Labels']['com.docker.compose.service'],
                'sourceSha': 'f' * 40, 'imageDigest': '1' * 64,
                'configurationHash': adapter.configuration_hash(container)})
        self.snapshot = {'posting': False, 'activeEpochs': 0, 'analysisJobs': 0,
            'migrations': existing.MIGRATIONS,
            'fingerprints': {'accounts': '1' * 64, 'transactions': '2' * 64,
                'postings': '3' * 64, 'balances': '4' * 64},
            'historical': {'voicePending': 4, 'assistantPending': 0,
                'outboxUnpublished': 497071}}
        self.packet = {'version': 1, 'kind': 'posting-off-helper-rehearsal',
            'host': 'srv2006836', 'project': existing.PROJECT,
            'generation': existing.GENERATION, 'sourceSha': 'a' * 40,
            'imageDigest': 'b' * 64, 'expiresAt': '2026-10-11T07:00:00Z',
            'requiredMigrations': existing.MIGRATIONS,
            'files': {'customer-operating-cohort.py': hash_bytes(existing.ADAPTER.read_bytes()),
                'off-monitor-rehearsal.py': hash_bytes((HERE / 'off-monitor-rehearsal.py').read_bytes())},
            'cohort': {'observedAt': '2026-10-11T06:25:00Z',
                'composeFiles': original['rollback']['composeFiles'],
                'envHashes': original['rollback']['envHashes'],
                'databaseCAHash': original['rollback']['databaseCAHash'],
                'backupDigest': '9' * 64, 'backupRestoreReceiptHash': '8' * 64,
                'services': services, 'containerIDs': list(self.containers),
                'runningIDs': [identity for identity, entry in self.containers.items() if entry['State']['Running']]},
            'baseline': copy.deepcopy(self.snapshot), 'financialEpochAuthority': None}
        self.files[str(self.root / 'off-monitor-rehearsal.py')] = (HERE / 'off-monitor-rehearsal.py').read_bytes()
        self.files[str(self.root / 'backup-restore.json')] = json.dumps({
            'restoreVerified': True, 'backupDigest': '9' * 64, 'observedAt': '2026-10-11T06:25:00Z',
            'financialFingerprints': self.snapshot['fingerprints'], 'requiredMigrations': existing.MIGRATIONS,
            'cohortHash': adapter.operating.canonical_hash({key: value for key, value in self.packet['cohort'].items()
                if key not in ('backupDigest', 'backupRestoreReceiptHash')})}).encode()
        self.packet['cohort']['backupRestoreReceiptHash'] = hash_bytes(self.files[str(self.root / 'backup-restore.json')])
        approve(self.packet)
        self.status = adapter.RehearsalHost.status.__get__(self)

    def run(self, command, timeout=30, environment=None):
        if command[:2] == ['docker', 'ps'] and '--filter' not in command:
            ids = [identity for identity, entry in self.containers.items()
                   if '-a' in command or entry['State']['Running']]
            ids += [entry['Id'] for entry in self.runners.values()
                    if '-a' in command or entry['State']['Running']]
            self.commands.append(command)
            return '\n'.join(ids)
        if command[:2] == ['docker', 'exec']:
            self.commands.append(command)
            if self.fail_exec:
                raise existing.adapter.GuardError('HOST_COMMAND_TIMEOUT')
            return json.dumps(self.snapshot)
        return super().run(command, timeout, environment)

    def stop_database_runners(self, state):
        return existing.adapter.LocalHost.stop_database_runners(self, state)


class OffOnlyRehearsal(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(adapter, 'A separate executable OFF-only adapter is unavailable')

    def test_missing_or_operating_approval_rejects_before_docker_boundary(self):
        for kind in (None, 'direct-human-operating-approval'):
            host = FixtureHost()
            if kind is None: host.packet.pop('approval')
            else: host.packet['approval']['kind'] = kind
            with self.assertRaises(existing.adapter.GuardError): adapter.rehearse(host.packet, host)
            self.assertEqual(host.commands, [])

    def test_expired_or_changed_packet_cannot_execute(self):
        for change in ('expiry', 'hash', 'closure-authority'):
            host = FixtureHost()
            if change == 'expiry': host.packet['expiresAt'] = '2026-10-11T04:00:00Z'; approve(host.packet)
            elif change == 'hash': host.packet['imageDigest'] = '0' * 64
            else: host.packet['financialEpochAuthority'] = {'epochId': existing.GENERATION}; approve(host.packet)
            with self.assertRaises(existing.adapter.GuardError): adapter.rehearse(host.packet, host)
            self.assertEqual(host.commands, [])

    def test_stopped_writers_and_exact_shared_configuration_are_required_before_helper_creation(self):
        for drift in ('writer-running', 'api-configuration'):
            host = FixtureHost()
            if drift == 'writer-running': host.containers['9' * 64]['State']['Running'] = True
            else: host.containers['2' * 64]['Config']['Env'].append('UNREVIEWED=true')
            with self.assertRaises(existing.adapter.GuardError): adapter.rehearse(host.packet, host)
            self.assertFalse(any(command[:2] == ['docker', 'create'] for command in host.commands))

    def test_two_helpers_reuse_ids_and_leave_financial_historical_shared_state_unchanged(self):
        host = FixtureHost()
        before = copy.deepcopy(host.containers)
        receipt = adapter.rehearse(host.packet, host)
        self.assertEqual(host.containers, before)
        self.assertEqual(len(host.runners), 2)
        self.assertFalse(any(entry['State']['Running'] for entry in host.runners.values()))
        self.assertEqual(sum(command[:2] == ['docker', 'create'] for command in host.commands), 2)
        self.assertEqual(sum(command[:2] == ['docker', 'exec'] for command in host.commands), 4)
        self.assertTrue(receipt['postingOffConfirmed'])
        self.assertFalse(receipt['financialEpochClosureExercised'])
        self.assertEqual(receipt['financialEpochClosureBlocker'], 'NO_APPROVED_OWNED_FINANCIAL_EPOCH_AUTHORITY')
        self.assertTrue(all(command[-1] in ('5' * 64, '6' * 64)
            for command in host.commands if command[:2] in (['docker', 'start'], ['docker', 'stop'])))

    def test_posting_or_active_epoch_drift_stops_helpers_and_never_repairs_financial_policy(self):
        for key, value in (('posting', True), ('activeEpochs', 1)):
            host = FixtureHost()
            host.snapshot[key] = value
            with self.assertRaises(existing.adapter.GuardError): adapter.rehearse(host.packet, host)
            self.assertFalse(any(entry['State']['Running'] for entry in host.runners.values()))
            self.assertEqual(host.snapshot[key], value)
            self.assertFalse(any('OPERATING_ACTION=activate' in command or 'OPERATING_ACTION=close' in command
                for command in host.commands))

    def test_exec_failure_preserves_failed_helper_and_closes_only_rehearsal_lifecycle(self):
        host = FixtureHost()
        host.fail_exec = True
        with self.assertRaises(existing.adapter.GuardError): adapter.rehearse(host.packet, host)
        self.assertEqual(len(host.runners), 1)
        self.assertFalse(next(iter(host.runners.values()))['State']['Running'])
        self.assertEqual(host.journals['control']['phase'], 'executing')
        self.assertTrue(host.containers['2' * 64]['State']['Running'])
        self.assertFalse(host.containers['9' * 64]['State']['Running'])

    def test_command_guard_rejects_financial_api_start_operating_exec_and_broad_mutations(self):
        host = FixtureHost()
        native = adapter.RehearsalHost('/not-a-live-scope')
        native.read_json = host.read_json
        native.read_runner = host.read_runner
        native.target = host.target
        for command in (['docker', 'start', '2' * 64], ['docker', 'start', '9' * 64],
                        ['docker', 'compose', 'up', '-d', 'api'], ['docker', 'run', '--rm'],
                        ['docker', 'rm', '5' * 64], ['docker', 'exec', '-e', 'OPERATING_ACTION=activate',
                            '5' * 64, '/nodejs/bin/node', '-e', existing.adapter.DB_SCRIPT]):
            with self.subTest(command=command), patch.object(existing.adapter.LocalHost, 'run') as boundary:
                with self.assertRaises(existing.adapter.GuardError): native.run(command)
                boundary.assert_not_called()

    def test_unknown_cli_action_cannot_construct_a_host_or_gain_financial_authority(self):
        for action in ('apply', 'activate', 'prepare', 'close', 'restore', 'start-worker', 'switch-api'):
            with self.subTest(action=action), patch('sys.argv', ['off-monitor-rehearsal.py', action]), \
                    patch.object(adapter, 'RehearsalHost') as host:
                with self.assertRaises(existing.adapter.GuardError): adapter.main()
                host.assert_not_called()

    def test_database_method_rejects_write_actions_even_with_off_approval(self):
        host = FixtureHost()
        for action in ('prepare', 'activate', 'close'):
            with self.subTest(action=action), self.assertRaises(existing.adapter.GuardError):
                adapter.RehearsalHost.db(host, host.packet, action)
        self.assertEqual(host.commands, [])

    def test_real_command_policy_allows_only_reviewed_helper_flow(self):
        host = FixtureHost()
        inert_boundary = host.run
        host.run = adapter.RehearsalHost.run.__get__(host)
        with patch.object(adapter.operating.LocalHost, 'run', side_effect=lambda _host, command, timeout=30, environment=None:
                inert_boundary(command, timeout, environment)):
            receipt = adapter.rehearse(host.packet, host)
        self.assertTrue(receipt['helpersStoppedConfirmed'])
        self.assertEqual(len(host.runners), 2)

    def test_cleanup_uses_protected_journal_when_packet_is_lost_or_expired(self):
        for lost in (False, True):
            host = FixtureHost()
            adapter.rehearse(host.packet, host)
            for runner in host.runners.values(): runner['State']['Running'] = True
            if lost: host.packet = None
            else: host.clock += 3600
            inert_boundary = host.run
            host.run = adapter.RehearsalHost.run.__get__(host)
            with patch.object(adapter.operating.LocalHost, 'run', side_effect=lambda _host, command, timeout=30, environment=None:
                    inert_boundary(command, timeout, environment)):
                receipt = adapter.cleanup(host)
            self.assertTrue(receipt['helpersStoppedConfirmed'])
            self.assertFalse(any(runner['State']['Running'] for runner in host.runners.values()))

    def test_fresh_pin_loss_is_rejected_before_any_helper_creation(self):
        host = FixtureHost()
        host.files['/etc/masarifi/migration.env'] = b'changed'
        with self.assertRaises(adapter.GuardError): adapter.rehearse(host.packet, host)
        self.assertEqual(host.runners, {})

    def test_stale_restore_proof_cannot_be_reapproved_as_fresh_cohort_backup(self):
        host = FixtureHost()
        proof = json.loads(host.files[str(host.root / 'backup-restore.json')])
        proof['observedAt'] = '2026-10-10T06:25:00Z'
        encoded = json.dumps(proof).encode()
        host.files[str(host.root / 'backup-restore.json')] = encoded
        host.packet['cohort']['backupRestoreReceiptHash'] = hash_bytes(encoded)
        approve(host.packet)
        try:
            adapter.rehearse(host.packet, host)
            outcome = 'ACCEPTED'
        except adapter.GuardError as error:
            outcome = str(error)
        self.assertEqual(outcome, 'OFF_BACKUP_RESTORE_UNVERIFIED')
        self.assertEqual(host.runners, {})

    def test_historical_or_financial_drift_is_not_replayed_or_repaired(self):
        host = FixtureHost()
        host.snapshot['historical']['outboxUnpublished'] -= 1
        with self.assertRaisesRegex(adapter.GuardError, '^OFF_FINANCIAL_OR_HISTORICAL_DRIFT$'):
            adapter.rehearse(host.packet, host)
        self.assertFalse(any(runner['State']['Running'] for runner in host.runners.values()))

    def database(self, sqlstate=None):
        harness = r"""
const vm=require('node:vm'),input=JSON.parse(process.argv[1]),queries=[],errors=[];let result;
const db={async query(sql){queries.push(sql);
 if(sql.includes('private.voice_automatic_policy')){
  if(input.sqlstate)throw Object.assign(Error('SECRET_DATABASE_PASSWORD raw transcript SQL SELECT'),{code:input.sqlstate});
  return {rows:[{posting:false,activeEpochs:0,analysisJobs:0,migrations:input.migrations,
   historical:{voicePending:4,assistantPending:0,outboxUnpublished:497071}}]};
 }
 if(sql.startsWith('select to_jsonb')){
  if(!['public.accounts','public.transactions','public.transaction_postings','public.account_balances'].some(table=>sql.includes(' from '+table+' ')))
   throw Object.assign(Error('unavailable relation'),{code:'42P01'});
  return {rows:[{row:{id:'PRIVATE_OWNER_SENTINEL',amount:10}}]};
 }
 return {rows:[]};},release(){}};
class Pool{async connect(){return db;}async end(){}}
const p={env:{MASARIFI_PROCESS_KIND:'migration',OPERATING_ACTION:'status',OPERATING_CONTROL:JSON.stringify({project:input.project}),
 DATABASE_URL:'postgresql://postgres.'+input.project+':secret@aws-0-me-central-1.pooler.supabase.com:5432/postgres'}};
const context={URL,process:p,console:{log(value){result=JSON.parse(value);},error(value){errors.push(value);}},
 require(name){if(name==='node:module')return {createRequire(){return ()=>({Pool});}};return require(name);}};
vm.runInNewContext(input.script,context);
setImmediate(()=>process.stdout.write(JSON.stringify({result,errors,queries,exitCode:p.exitCode||0})));
"""
        result = subprocess.run(['node', '-e', harness, json.dumps({'script': adapter.OFF_DATABASE_SCRIPT,
            'project': existing.PROJECT, 'migrations': existing.MIGRATIONS, 'sqlstate': sqlstate})], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_actual_node_probe_reads_consistent_snapshot_without_claim_grant_or_financial_write(self):
        receipt = self.database()
        self.assertEqual(receipt['exitCode'], 0, receipt)
        self.assertEqual(receipt['queries'][0], 'begin isolation level repeatable read read only')
        self.assertFalse(any(query.lower().startswith(('grant ', 'update ', 'delete ', 'insert '))
            or 'claim_' in query.lower() or 'activate_' in query.lower() or 'close_staging_' in query.lower()
            for query in receipt['queries']))
        self.assertEqual(set(receipt['result']['fingerprints']), {'accounts', 'transactions', 'postings', 'balances'})
        self.assertTrue(all(len(value) == 64 for value in receipt['result']['fingerprints'].values()))
        self.assertNotIn('PRIVATE_OWNER_SENTINEL', json.dumps(receipt['result']))

    def test_actual_node_error_preserves_only_sanitized_stage_sqlstate(self):
        receipt = self.database('42501')
        self.assertEqual(receipt['exitCode'], 1)
        self.assertEqual(json.loads(receipt['errors'][0]), {'error': 'OPERATING_DATABASE_FAILED',
            'action': 'status', 'stage': 'status', 'code': '42501'})
        self.assertNotIn('SECRET_DATABASE_PASSWORD', json.dumps(receipt['errors']))


if __name__ == '__main__':
    unittest.main()
