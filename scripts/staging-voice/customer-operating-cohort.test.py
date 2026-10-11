"""Persistent operating controls use an inert host; never contact Staging."""
import json
import copy
import hashlib
import importlib.util
import pathlib
import subprocess
import sys
import unittest
import contextlib
import types
import stat
import tempfile
import shutil
import os
from unittest.mock import patch

ADAPTER = pathlib.Path(__file__).with_name('customer-operating-cohort.py')
SPEC = importlib.util.spec_from_file_location('customer_operating_cohort', ADAPTER)
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)
NOW = 1791700000
GENERATION = '10000000-0000-4000-8000-000000000001'
PROJECT = 'qcffvfbpzvpwcwxwjyro'
IMAGE_PREFIX = 'ghcr.io/masarifiratibi-spec/masarifi-backend@sha256:'
MIGRATIONS = ['20261010221534', '20261011002702', '20261011004500', '20261011004600', '20261011005920']
CONTRACTS = {'voiceSession': 2, 'voiceBatch': 3, 'voiceExtraction': 3,
             'voiceWorker': 1, 'voiceConfirmation': 2, 'assistantDirect': 2,
             'assistantProvider': 1, 'manualReceipt': 1}


def digest(content):
    return hashlib.sha256(content).hexdigest()


def canonical(record):
    return digest(json.dumps(record, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def approved_packet():
    packet = {
        'version': 1, 'mode': 'operating', 'project': PROJECT, 'host': 'srv2006836',
        'generation': GENERATION, 'sourceSha': 'a' * 40, 'imageDigest': 'b' * 64,
        'apkHash': 'c' * 64, 'requiredMigrations': MIGRATIONS,
        'apiContracts': CONTRACTS,
        'verification': {'sourceSha': 'a' * 40, 'imageDigest': 'b' * 64,
                         'apkHash': 'c' * 64, 'ciEvidenceHash': 'd' * 64,
                         'apkRuntimeEvidenceHash': 'e' * 64},
        'files': {'customer-operating-cohort.py': digest(ADAPTER.read_bytes()),
                  'financial-api.yml': 'd' * 64},
        'rollback': {
            'sourceSha': 'f' * 40, 'imageDigest': '1' * 64,
            'apiID': '2' * 64, 'analysisID': '3' * 64, 'assistantID': '4' * 64,
            'composeFiles': [{'path': adapter.COHORT + '/' + name,
                              'sha256': digest(name.encode())} for name in adapter.COMPOSE_NAMES],
            'envHashes': {name: digest(name.encode()) for name in
                         ('api.env', 'worker.env', 'migration.env', 'compose.env', 'admin.env')},
            'databaseCAHash': digest(b'database-ca'),
            'backupDigest': '5' * 64, 'backupRestoreReceiptHash': '6' * 64
        },
        'offRehearsal': {'intentHash': '7' * 64, 'receiptHash': '8' * 64},
    }
    packet['offRehearsal']['intentHash'] = canonical({key: value for key, value in packet.items()
                                                    if key not in ('approval', 'offRehearsal')})
    approve(packet)
    return packet


def approve(packet):
    packet['approval'] = {
        'kind': 'direct-human-operating-approval',
        'packetHash': canonical({key: value for key, value in packet.items() if key != 'approval'}),
        'messageReference': 'explicit-human-message-reference',
        'verbatimMessage': 'Approve the exact persistent Staging operating packet.',
        'receivedAt': '2026-10-11T05:00:00Z'
    }


def observed_guard(packet, now=NOW):
    try:
        adapter.validate_packet(packet, now)
        return 'VALID'
    except Exception as error:
        return str(error)


def observation(operation, *arguments):
    try:
        return getattr(adapter, operation)(*arguments)
    except Exception as error:
        return {'error': str(error)}


def container(name, identity, service, running=True, source='f' * 40, image_digest='1' * 64):
    return {'Name': '/' + name, 'Id': identity,
            'Config': {'Image': IMAGE_PREFIX + image_digest,
                       'Labels': {'com.docker.compose.project': 'masarifi-staging',
                                  'com.docker.compose.service': service},
                       'Cmd': ['dist/src/main.js' if service == 'api' else 'dist/src/worker.js'],
                       'Env': ['SUPABASE_URL=https://' + PROJECT + '.supabase.co',
                               'MASARIFI_RELEASE_VERSION=' + source,
                               'MASARIFI_VOICE_ANALYSIS_ONLY=true',
                               'MASARIFI_AI_PROVIDER_ENABLED=true',
                               'MASARIFI_AI_ASSISTANT_ONLY=' + ('true' if service == 'assistant-worker' else 'false')]},
            'HostConfig': {'NetworkMode': 'masarifi-staging_backend'},
            'State': {'Running': running, 'Health': {'Status': 'healthy'}}}


class FakeHost:
    """Only external OS/files, Docker/HTTP and database boundaries are replaced."""
    def __init__(self, packet):
        self.packet = packet
        self.root = pathlib.PurePosixPath('/opt/masarifi/customer-voice-operating-' + GENERATION)
        self.clock = NOW
        self.calls = []
        self.files = {}
        self.runtime = None
        self.unit = None
        self.stale = False
        self.close_failure = False
        self.contract_failure = False
        self.image_source = packet['sourceSha']
        self.pause_count = 0
        self.unhealthy_after = None
        self.dbstate = {'posting': False, 'activeEpochs': 0, 'analysisJobs': 0,
                        'migrations': MIGRATIONS, 'epoch': None, 'committed': 0}
        self.containers = {}
        for name, identity, service, running in (
            ('masarifi-staging-api-1', '2' * 64, 'api', True),
            ('masarifi-staging-analysis-worker-1', '3' * 64, 'analysis-worker', True),
            ('masarifi-staging-assistant-worker-1', '4' * 64, 'assistant-worker', True),
            ('masarifi-staging-worker-1', '9' * 64, 'worker', False),
            ('masarifi-staging-voice-epoch-1', '0' * 64, 'voice-epoch', False)
        ):
            self.containers[identity] = container(name, identity, service, running)
        self.original_config = {'name': 'masarifi-staging', 'services': {
            'api': {'image': IMAGE_PREFIX + '1' * 64, 'command': ['dist/src/main.js'],
                    'environment': {'MASARIFI_RELEASE_VERSION': 'f' * 40,
                                    'MASARIFI_VOICE_ANALYSIS_ONLY': 'true'}},
            'worker': {'image': IMAGE_PREFIX + '1' * 64, 'command': ['dist/src/worker.js']},
            'analysis-worker': {'image': IMAGE_PREFIX + '1' * 64, 'command': ['dist/src/worker.js']},
            'assistant-worker': {'image': IMAGE_PREFIX + '1' * 64, 'command': ['dist/src/worker.js']}
        }}
        overlay = {'services': {'api': {'image': IMAGE_PREFIX + packet['imageDigest'],
                                      'environment': {'MASARIFI_RELEASE_VERSION': packet['sourceSha'],
                                                      'MASARIFI_VOICE_ANALYSIS_ONLY': 'false'}}}}
        self.files[str(self.root / 'financial-api.yml')] = (json.dumps(overlay, sort_keys=True, indent=2) + '\n').encode()
        self.files[str(self.root / 'customer-operating-cohort.py')] = ADAPTER.read_bytes()
        packet['files']['financial-api.yml'] = digest(self.files[str(self.root / 'financial-api.yml')])
        for entry in packet['rollback']['composeFiles']:
            self.files[entry['path']] = pathlib.PurePosixPath(entry['path']).name.encode()
        for name in packet['rollback']['envHashes']:
            self.files['/etc/masarifi/' + name] = name.encode()
        self.files['/etc/masarifi/supabase-ca.crt'] = b'database-ca'
        backup_receipt = {'backupDigest': packet['rollback']['backupDigest'], 'restoreVerified': True,
                          'schemaVersions': MIGRATIONS,
                          'cohortHash': canonical({key: entry for key, entry in packet['rollback'].items()
                                                   if key not in ('backupDigest', 'backupRestoreReceiptHash')})}
        self.files[str(self.root / 'backup-restore.json')] = json.dumps(backup_receipt).encode()
        packet['rollback']['backupRestoreReceiptHash'] = digest(self.files[str(self.root / 'backup-restore.json')])
        proofs = {
            'ci-evidence.json': {'status': 'passed', 'sourceSha': packet['sourceSha'],
                                 'imageDigest': packet['imageDigest'], 'requiredMigrations': MIGRATIONS,
                                 'contracts': CONTRACTS,
                                 'checks': {'clientApiCompatibility': 'passed', 'confirmationOptIn': 'passed'}},
            'apk-runtime.json': {'status': 'passed', 'sourceSha': packet['sourceSha'],
                                  'apkHash': packet['apkHash'], 'project': PROJECT,
                                  'package': 'com.masarifi.mobile', 'certificateHash': adapter.CERTIFICATE,
                                  'runtimePurpose': 'staging'}
        }
        for name, field in (('ci-evidence.json', 'ciEvidenceHash'), ('apk-runtime.json', 'apkRuntimeEvidenceHash')):
            self.files[str(self.root / name)] = json.dumps(proofs[name]).encode()
            packet['verification'][field] = digest(self.files[str(self.root / name)])
        packet['offRehearsal']['intentHash'] = canonical({key: entry for key, entry in packet.items()
                                                        if key not in ('approval', 'offRehearsal')})
        rehearsal = {'intentHash': packet['offRehearsal']['intentHash'],
                     'postingOffConfirmed': True, 'workerStoppedConfirmed': True,
                     'apiRestored': True, 'analysisRestored': True,
                     'financialBeforeHash': 'e' * 64, 'financialAfterHash': 'e' * 64,
                     'backupDigest': packet['rollback']['backupDigest'],
                     'observedAt': '2026-10-11T05:00:00Z'}
        self.files[str(self.root / 'off-rehearsal.json')] = json.dumps(rehearsal).encode()
        packet['offRehearsal']['receiptHash'] = digest(self.files[str(self.root / 'off-rehearsal.json')])
        approve(packet)

    def now(self): return self.clock
    def target(self, generation, incident=False):
        if generation != GENERATION: raise adapter.GuardError('ROOT_SCOPE_MISMATCH')

    def pin(self, path, expected):
        if digest(self.files[str(path)]) != expected: raise adapter.GuardError('PIN_CHANGED')

    def read_json(self, name):
        if name == 'runtime.json': return copy.deepcopy(self.runtime)
        if name == 'packet.json': return copy.deepcopy(self.packet)
        return json.loads(self.files[str(self.root / name)])

    def write_state(self, state, initial=False):
        if initial and self.runtime is not None: raise adapter.GuardError('GENERATION_ALREADY_USED')
        self.runtime = copy.deepcopy(state)
        self.calls.append(('journal', state['phase']))

    def write_unit(self, name, text):
        if self.unit is not None: raise adapter.GuardError('MONITOR_ALREADY_EXISTS')
        self.unit = text
        self.calls.append(('unit', name))
        return '/etc/systemd/system/' + name

    @contextlib.contextmanager
    def deployment_lock(self):
        self.calls.append(('lock',))
        yield

    def inspect(self, identity):
        self.calls.append(('inspect', identity))
        if identity in self.containers: return copy.deepcopy(self.containers[identity])
        return copy.deepcopy(next(item for item in self.containers.values() if item['Name'] == '/' + identity))

    def http(self, endpoint):
        if endpoint == 'live':
            env = dict(entry.split('=', 1) for entry in self.inspect('masarifi-staging-api-1')['Config']['Env'])
            return {'version': env['MASARIFI_RELEASE_VERSION']}
        if endpoint == 'ready': return {'status': 'ready'}
        return {'schemaVersion': 1, 'contracts': {**CONTRACTS, **({'voiceWorker': 0} if self.contract_failure else {})}}

    def db(self, packet, action, state=None):
        self.calls.append(('db', action))
        if action == 'prepare':
            self.dbstate['epoch'] = {'epochId': '20000000-0000-4000-8000-000000000001',
                                    'manifestHash': 'd' * 64, 'state': 'prepared', 'mode': 'operating',
                                    'expiresAt': None, 'heartbeatAt': None}
            return copy.deepcopy(self.dbstate['epoch'])
        if action == 'activate':
            if self.dbstate['posting']: raise adapter.GuardError('POSTING_MUST_BE_OFF')
            self.dbstate.update(posting=True, activeEpochs=1)
            self.dbstate['epoch'].update(state='active', startedAt=self.clock)
            return {'epochId': state['epochId'], 'expiresAt': None}
        if action == 'close':
            self.pin('/etc/masarifi/migration.env', state['migrationEnvHash'])
            self.pin('/etc/masarifi/supabase-ca.crt', state['databaseCAHash'])
            if self.close_failure: raise RuntimeError('database unavailable')
            self.dbstate.update(posting=False, activeEpochs=0)
            self.dbstate['epoch']['state'] = 'closed'
            return {'posting': False, 'state': 'closed'}
        if action != 'status': raise AssertionError('Historical/broad database operation forbidden')
        receipt = copy.deepcopy(self.dbstate)
        if receipt['epoch']:
            receipt['currentEpoch'] = receipt['epoch']['epochId']
            receipt['epoch']['heartbeatAt'] = self.clock - (30 if self.stale else 0)
        return receipt

    def pause(self, seconds):
        self.clock += seconds
        self.pause_count += 1
        if self.unhealthy_after is not None and self.pause_count >= self.unhealthy_after:
            self.stale = True

    def run(self, command, timeout=30, environment=None):
        self.calls.append(tuple(command))
        if command[:3] == ['docker', 'image', 'inspect']:
            return json.dumps([{'RepoDigests': [IMAGE_PREFIX + self.packet['imageDigest']],
                                'Config': {'Labels': {'org.opencontainers.image.revision': self.image_source}}}])
        if command[:2] == ['docker', 'ps']:
            wanted = command[command.index('--filter') + 1][len('name=^/'):-1]
            return wanted if any(item['Name'] == '/' + wanted for item in self.containers.values()) else ''
        if command[:2] == ['docker', 'compose']:
            candidate = str(self.root / 'financial-api.yml') in command
            if 'config' in command:
                config = copy.deepcopy(self.original_config)
                if candidate:
                    config['services']['api']['image'] = IMAGE_PREFIX + self.packet['imageDigest']
                    config['services']['api']['environment'].update(MASARIFI_RELEASE_VERSION=self.packet['sourceSha'],
                                                                   MASARIFI_VOICE_ANALYSIS_ONLY='false')
                return json.dumps(config)
            # Only one explicitly named API service can be reconciled.
            if command[-6:] != ['up', '-d', '--no-deps', '--pull', 'never', 'api']:
                raise AssertionError('Broad Compose operation or implicit image pull')
            previous = next(identity for identity, item in self.containers.items() if item['Name'] == '/masarifi-staging-api-1')
            del self.containers[previous]
            identity = 'a' * 64 if candidate else 'c' * 64
            api = container('masarifi-staging-api-1', identity, 'api', source='a' * 40 if candidate else 'f' * 40,
                            image_digest='b' * 64 if candidate else '1' * 64)
            if candidate:
                api['Config']['Env'] = [entry.replace('MASARIFI_VOICE_ANALYSIS_ONLY=true', 'MASARIFI_VOICE_ANALYSIS_ONLY=false') for entry in api['Config']['Env']]
            self.containers[identity] = api
            return ''
        if command[:2] == ['docker', 'create']:
            name = command[command.index('--name') + 1]
            labels = dict(command[index + 1].split('=', 1) for index, entry in enumerate(command) if entry == '--label')
            environment_values = [command[index + 1] for index, entry in enumerate(command) if entry == '-e']
            worker = container(name, 'b' * 64, labels['com.docker.compose.service'], False,
                               source=self.packet['sourceSha'], image_digest=self.packet['imageDigest'])
            worker['Config']['Labels'] = labels
            worker['Config']['Cmd'] = [command[-1]]
            worker['Config']['Env'] = ['SUPABASE_URL=https://' + PROJECT + '.supabase.co'] + environment_values
            self.containers[worker['Id']] = worker
            return worker['Id']
        if command[:2] == ['docker', 'start']:
            identity = command[-1]
            if identity not in ('b' * 64, '3' * 64): raise AssertionError('Unowned worker start')
            self.containers[identity]['State']['Running'] = True
            return identity
        if command[:2] == ['docker', 'stop']:
            identity = command[-1]
            if identity not in ('b' * 64, '3' * 64): raise AssertionError('Broad/unowned writer stop')
            self.containers[identity]['State']['Running'] = False
            return identity
        if command[:2] == ['docker', 'exec']:
            if command[-1] == 'dist/src/staging-voice-healthcheck.js': return ''
            return json.dumps({'sourceSha': self.packet['sourceSha'], 'epochId': self.runtime['epochId'],
                               'mode': 'operating', 'enabled': True,
                               'observedAt': (self.clock - (30 if self.stale else 0)) * 1000})
        if command[:2] == ['systemctl', 'is-active']: return 'active'
        if command[0] in ('systemctl', 'systemd-analyze'): return ''
        raise AssertionError('Unreviewed host operation: ' + command[0])


class HostSafety(unittest.TestCase):
    def fixture(self):
        packet = approved_packet()
        return packet, FakeHost(packet)

    def active(self):
        packet, host = self.fixture()
        receipt = observation('apply', packet, host)
        self.assertNotIn('error', receipt, receipt)
        return packet, host

    def test_apply_arms_monitor_before_admission_and_starts_only_new_writer(self):
        packet, host = self.active()
        self.assertTrue(host.dbstate['posting'])
        self.assertEqual(host.dbstate['epoch']['mode'], 'operating')
        self.assertIsNone(host.dbstate['epoch']['expiresAt'])
        self.assertLess(host.calls.index(('systemctl', 'enable', '--now', adapter.unit_name(packet))), host.calls.index(('db', 'activate')))
        starts = [call[-1] for call in host.calls if call[:2] == ('docker', 'start')]
        self.assertEqual(starts, ['b' * 64])
        self.assertNotEqual(host.runtime['workerName'], 'masarifi-staging-voice-epoch-1')
        self.assertEqual(host.inspect('masarifi-staging-worker-1')['State']['Running'], False)

    def test_changed_environment_pin_rejects_before_any_runtime_mutation(self):
        packet, host = self.fixture()
        host.files['/etc/masarifi/api.env'] = b'changed'
        self.assertEqual(observation('apply', packet, host).get('error'), 'PIN_CHANGED')
        self.assertNotIn(('db', 'prepare'), host.calls)

    def test_posting_must_be_off_before_any_api_switch_or_new_writer(self):
        packet, host = self.fixture()
        host.dbstate.update(posting=True, activeEpochs=1)
        self.assertEqual(observation('apply', packet, host).get('error'), 'POSTING_MUST_BE_OFF')
        self.assertNotIn(('db', 'prepare'), host.calls)

    def test_worker_name_collision_is_preserved_and_blocks_activation(self):
        packet, host = self.fixture()
        foreign = container(adapter.worker_name(packet), 'e' * 64, 'foreign', False)
        host.containers[foreign['Id']] = foreign
        self.assertEqual(observation('apply', packet, host).get('error'), 'WORKER_NAME_ALREADY_OWNED')
        self.assertNotIn(('db', 'prepare'), host.calls)

    def test_missing_migration_in_database_rejects_even_with_complete_packet(self):
        packet, host = self.fixture()
        host.dbstate['migrations'] = MIGRATIONS[:2]
        self.assertEqual(observation('apply', packet, host).get('error'), 'DATABASE_MIGRATIONS_MISSING')

    def test_locally_loaded_image_must_match_approved_source_before_database_helper(self):
        packet, host = self.fixture()
        host.image_source = '9' * 40
        self.assertEqual(observation('preflight', packet, host).get('error'), 'LOCAL_IMAGE_SOURCE_MISMATCH')
        self.assertNotIn(('db', 'status'), host.calls)

    def test_ci_without_client_compatibility_and_confirmation_opt_in_blocks_preflight(self):
        packet, host = self.fixture()
        proof_path = str(host.root / 'ci-evidence.json')
        proof = json.loads(host.files[proof_path])
        del proof['checks']
        host.files[proof_path] = json.dumps(proof).encode()
        packet['verification']['ciEvidenceHash'] = digest(host.files[proof_path])
        packet['offRehearsal']['intentHash'] = canonical({key: value for key, value in packet.items()
                                                        if key not in ('approval', 'offRehearsal')})
        rehearsal_path = str(host.root / 'off-rehearsal.json')
        rehearsal = json.loads(host.files[rehearsal_path])
        rehearsal['intentHash'] = packet['offRehearsal']['intentHash']
        host.files[rehearsal_path] = json.dumps(rehearsal).encode()
        packet['offRehearsal']['receiptHash'] = digest(host.files[rehearsal_path])
        approve(packet)
        self.assertEqual(observation('preflight', packet, host).get('error'), 'CLIENT_CONFIRMATION_CI_REQUIRED')
        self.assertNotIn(('db', 'status'), host.calls)

    def test_incompatible_api_cannot_start_a_writer(self):
        packet, host = self.fixture()
        host.contract_failure = True
        self.assertEqual(observation('apply', packet, host).get('error'), 'API_COMPATIBILITY_INVALID')
        self.assertNotIn(('db', 'prepare'), host.calls)

    def test_stale_heartbeat_and_local_worker_receipt_cannot_report_ready(self):
        packet, host = self.active()
        host.stale = True
        self.assertIn(observation('status', packet, host).get('error'), ('HEARTBEAT_STALE', 'WORKER_HEARTBEAT_STALE'))

    def test_pin_loss_still_stops_exact_owned_id_when_close_sql_fails(self):
        _packet, host = self.active()
        host.files['/etc/masarifi/supabase-ca.crt'] = b'changed'
        receipt = observation('incident_close', host)
        self.assertFalse(receipt['postingOffConfirmed'])
        self.assertTrue(receipt['workerStoppedConfirmed'])
        self.assertFalse(host.containers['b' * 64]['State']['Running'])
        self.assertTrue(host.containers['a' * 64]['State']['Running'])
        self.assertLess(host.calls.index(('db', 'close')), host.calls.index(('docker', 'stop', '--time', '5', 'b' * 64)))

    def test_sql_failure_never_leaves_owned_writer_running_or_restores_shared_api(self):
        _packet, host = self.active()
        host.close_failure = True
        receipt = observation('incident_close', host)
        self.assertFalse(receipt['postingOffConfirmed'])
        self.assertTrue(receipt['workerStoppedConfirmed'])
        self.assertTrue(host.containers['a' * 64]['State']['Running'])
        self.assertFalse(host.containers['3' * 64]['State']['Running'])

    def test_replaced_worker_name_never_targets_foreign_writer(self):
        packet, host = self.active()
        host.containers['b' * 64]['Name'] += '-preserved'
        foreign = container(adapter.worker_name(packet), 'e' * 64, 'foreign', True)
        host.containers['e' * 64] = foreign
        receipt = observation('incident_close', host)
        self.assertTrue(receipt['workerStoppedConfirmed'])
        self.assertTrue(host.containers['e' * 64]['State']['Running'])

    def test_restore_requires_separate_explicit_approval_and_preserves_foreign_api(self):
        packet, host = self.active()
        observation('incident_close', host)
        self.assertEqual(observation('restore', packet, host, None).get('error'), 'RESTORATION_APPROVAL_REQUIRED')
        approval = adapter.restoration_intent(packet, host.runtime)
        approval = {'kind': 'direct-human-operating-restoration-approval',
                    'intentHash': canonical(approval), 'messageReference': 'human-restore-message',
                    'verbatimMessage': 'Restore this exact original API and Analysis cohort.',
                    'receivedAt': '2026-10-11T05:00:00Z'}
        host.containers['a' * 64]['Id'] = 'e' * 64
        self.assertEqual(observation('restore', packet, host, approval).get('error'), 'FOREIGN_API_COHORT_PRESERVED')

    def test_persistent_monitor_survives_many_commits_and_hours_until_real_health_failure(self):
        packet, host = self.active()
        host.dbstate['committed'] = 41
        host.unhealthy_after = 4
        original_pause = host.pause
        def pause(seconds):
            original_pause(seconds)
            host.clock += 1800
        host.pause = pause
        receipt = observation('monitor', packet, host)
        self.assertNotIn('error', receipt, receipt)
        self.assertGreaterEqual(host.pause_count, 4)
        self.assertTrue(receipt['workerStoppedConfirmed'])
        self.assertTrue(host.containers['a' * 64]['State']['Running'])

    def test_normal_reboot_recovers_exact_stopped_writer_without_reactivating_generation(self):
        packet, host = self.active()
        original_start = host.dbstate['epoch']['startedAt']
        host.containers['b' * 64]['State']['Running'] = False
        host.calls.clear()
        host.unhealthy_after = 4
        receipt = observation('monitor', packet, host)
        self.assertNotIn('error', receipt, receipt)
        self.assertTrue(receipt['postingOffConfirmed'])
        self.assertEqual([call[-1] for call in host.calls if call[:2] == ('docker', 'start')], ['b' * 64])
        self.assertEqual(host.dbstate['epoch']['startedAt'], original_start)
        self.assertNotIn(('db', 'activate'), host.calls)

    def test_restart_refuses_closed_epoch_unready_api_and_lost_pins(self):
        for scenario in ('closed', 'api-unready', 'pin-loss', 'foreign-api', 'foreign-epoch'):
            with self.subTest(scenario=scenario):
                packet, host = self.active()
                host.containers['b' * 64]['State']['Running'] = False
                host.calls.clear()
                if scenario == 'closed':
                    host.dbstate['epoch']['state'] = 'closed'
                    host.dbstate['posting'] = False
                elif scenario == 'api-unready': host.containers['a' * 64]['State']['Health']['Status'] = 'unhealthy'
                elif scenario == 'pin-loss': host.files['/etc/masarifi/api.env'] = b'changed'
                elif scenario == 'foreign-api': host.containers['a' * 64]['Id'] = 'e' * 64
                else: host.dbstate['epoch']['epochId'] = '30000000-0000-4000-8000-000000000001'
                receipt = observation('monitor', packet, host)
                self.assertTrue(receipt.get('workerStoppedConfirmed'), receipt)
                self.assertFalse(any(call[:2] == ('docker', 'start') for call in host.calls))
                self.assertNotIn(('db', 'activate'), host.calls)
                self.assertTrue(host.containers['a' * 64]['State']['Running'])

    def test_restart_cooldown_survives_monitor_process_restart(self):
        packet, host = self.active()
        host.containers['b' * 64]['State']['Running'] = False
        receipt = observation('recover_writer', packet, host)
        self.assertEqual(receipt.get('status'), 'ready', receipt)
        host.containers['b' * 64]['State']['Running'] = False
        host.calls.clear()
        receipt = observation('resume_monitor', host)
        self.assertTrue(receipt.get('workerStoppedConfirmed'), receipt)
        self.assertTrue(receipt.get('postingOffConfirmed'), receipt)
        self.assertFalse(any(call[:2] == ('docker', 'start') for call in host.calls))

    def test_stale_post_restart_heartbeat_closes_even_if_docker_reports_healthy(self):
        packet, host = self.active()
        host.containers['b' * 64]['State']['Running'] = False
        host.stale = True
        receipt = observation('recover_writer', packet, host)
        self.assertEqual(receipt.get('error'), 'OPERATING_READINESS_UNCONFIRMED')
        closed = observation('incident_close', host)
        self.assertTrue(closed.get('postingOffConfirmed'), closed)
        self.assertTrue(closed.get('workerStoppedConfirmed'), closed)

    def test_same_api_starting_after_reboot_gets_bounded_grace_before_exact_writer_start(self):
        packet, host = self.active()
        host.containers['b' * 64]['State']['Running'] = False
        host.containers['a' * 64]['State']['Health']['Status'] = 'starting'
        pause = host.pause
        def api_starts(seconds):
            pause(seconds)
            if host.pause_count == 3:
                host.containers['a' * 64]['State']['Health']['Status'] = 'healthy'
        host.pause = api_starts
        original_start = host.dbstate['epoch']['startedAt']
        host.calls.clear()
        receipt = observation('recover_writer', packet, host)
        self.assertEqual(receipt.get('status'), 'ready', receipt)
        self.assertEqual(host.pause_count, 3)
        self.assertEqual(host.dbstate['epoch']['startedAt'], original_start)
        self.assertNotIn(('db', 'activate'), host.calls)

    def test_foreign_api_replacement_during_readiness_grace_is_immediate_fence(self):
        packet, host = self.active()
        host.containers['b' * 64]['State']['Running'] = False
        host.containers['a' * 64]['State']['Health']['Status'] = 'starting'
        pause = host.pause
        def replace_api(seconds):
            pause(seconds)
            host.containers['a' * 64]['Id'] = 'e' * 64
        host.pause = replace_api
        host.calls.clear()
        receipt = observation('recover_writer', packet, host)
        self.assertEqual(receipt.get('error'), 'FOREIGN_API_COHORT_PRESERVED')
        self.assertEqual(host.pause_count, 1)
        self.assertFalse(any(call[:2] == ('docker', 'start') for call in host.calls))

    def test_monitor_rejects_foreign_api_even_when_contracts_and_version_match(self):
        packet, host = self.active()
        host.containers['a' * 64]['Id'] = 'e' * 64
        self.assertEqual(observation('status', packet, host).get('error'), 'FOREIGN_API_COHORT_PRESERVED')
        receipt = observation('monitor', packet, host)
        self.assertTrue(receipt['postingOffConfirmed'])
        self.assertTrue(receipt['workerStoppedConfirmed'])
        self.assertTrue(host.containers['a' * 64]['State']['Running'])

    def test_complete_preflight_is_read_only(self):
        packet, host = self.fixture()
        self.assertEqual(observation('preflight', packet, host).get('status'), 'prepared')
        self.assertIsNone(host.runtime)
        self.assertFalse(any(call[:2] in (('docker', 'stop'), ('docker', 'start'), ('docker', 'create')) for call in host.calls))
        self.assertEqual([call for call in host.calls if call[0] == 'db'], [('db', 'status')])

    def test_monitor_restart_with_invalid_packet_closes_from_durable_journal(self):
        packet, host = self.active()
        packet['imageDigest'] = '8' * 64
        receipt = observation('resume_monitor', host)
        self.assertTrue(receipt.get('postingOffConfirmed'), receipt)
        self.assertTrue(receipt.get('workerStoppedConfirmed'), receipt)
        self.assertTrue(host.containers['a' * 64]['State']['Running'])

    def test_api_replacement_during_arming_blocks_activation_and_writer_start(self):
        packet, host = self.fixture()
        run = host.run
        def replace(command, **options):
            result = run(command, **options)
            if command[:2] == ['systemctl', 'is-active']:
                host.containers['a' * 64]['Id'] = 'e' * 64
            return result
        host.run = replace
        self.assertEqual(observation('apply', packet, host).get('error'), 'FOREIGN_API_COHORT_PRESERVED')
        self.assertNotIn(('db', 'activate'), host.calls)
        self.assertFalse(host.containers['b' * 64]['State']['Running'])
        self.assertTrue(host.containers['a' * 64]['State']['Running'])

    def test_wrong_journal_scope_cannot_stop_a_foreign_worker(self):
        _packet, host = self.active()
        host.runtime['scope'] = 'masarifi-staging'
        host.runtime['workerID'] = '4' * 64
        self.assertEqual(observation('incident_close', host).get('error'), 'INCIDENT_JOURNAL_SCOPE_INVALID')
        self.assertTrue(host.containers['4' * 64]['State']['Running'])

    def test_separately_approved_restore_reconciles_only_api_and_exact_analysis(self):
        packet, host = self.active()
        adapter.incident_close(host)
        approval = {'kind': 'direct-human-operating-restoration-approval',
                    'intentHash': canonical(adapter.restoration_intent(packet, host.runtime)),
                    'messageReference': 'human-restore-message',
                    'verbatimMessage': 'Restore this exact original API and Analysis cohort.',
                    'receivedAt': '2026-10-11T05:00:00Z'}
        receipt = observation('restore', packet, host, approval)
        self.assertTrue(receipt.get('apiRestored'), receipt)
        self.assertTrue(receipt.get('analysisRestored'), receipt)
        self.assertFalse(host.dbstate['posting'])
        self.assertFalse(host.containers['b' * 64]['State']['Running'])
        self.assertTrue(host.containers['4' * 64]['State']['Running'])


class NativeBoundaries(unittest.TestCase):
    def database(self, action, options=None):
        packet = approved_packet()
        control = {'project': PROJECT, 'manifest': adapter.manifest(packet), 'requiredMigrations': MIGRATIONS,
                   'epochId': '20000000-0000-4000-8000-000000000001', 'manifestHash': 'd' * 64,
                   'sourceSha': packet['sourceSha'], 'imageDigest': packet['imageDigest']}
        # Execute the actual Node helper; replace only pg's connection/query
        # boundary. No sockets, Docker or database is accessed.
        harness = r"""
const vm=require('node:vm'),input=JSON.parse(process.argv[1]),queries=[],errors=[];
let role=false,result;
const db={async query(sql,args){queries.push({sql,args});
 if(input.options.sqlstate&&sql.includes('"activeEpochs"'))throw Object.assign(Error('secret DATABASE_URL=postgres://password SELECT * from private.voice_events'),{code:input.options.sqlstate});
 if(sql==='set local role masarifi_migration')role=true;
 if(sql==='reset role')role=false;
 if(sql.startsWith('select version from supabase_migrations')){
  if(role)throw Error('migration catalog permission denied');
  return {rows:input.control.requiredMigrations.map(version=>({version}))};
 }
 if(sql.includes(' active,')&&sql.includes(' jobs'))return {rows:[{posting:!!input.options.posting,active:0,jobs:0}]};
 if(sql.startsWith('select manifest_hash'))return {rows:[{manifest_hash:input.options.foreign?'e'.repeat(64):input.control.manifestHash,
  mode:'operating',source:input.control.sourceSha,image:input.control.imageDigest}]};
 if(sql==='select current_epoch from private.staging_voice_runtime_control')return {rows:[{current_epoch:input.control.epochId}]};
 if(sql.includes('private.prepare_staging_voice_epoch'))return {rows:[{result:{epochId:input.control.epochId,manifestHash:input.control.manifestHash,state:'prepared'}}]};
 if(sql.includes('private.activate_staging_voice_epoch'))return {rows:[{result:{epochId:input.control.epochId,expiresAt:null}}]};
 if(sql.startsWith('select state,'))return {rows:[{posting:false,state:'closed'}]};
 if(sql.includes('"activeEpochs"'))return {rows:[{posting:false,activeEpochs:0,migrations:input.control.requiredMigrations,epoch:null}]};
 return {rows:[]};},release(){}};
class Pool{async connect(){return db;}async end(){}}
const fakeProcess={env:{OPERATING_CONTROL:JSON.stringify(input.control),OPERATING_ACTION:input.action,
 MASARIFI_PROCESS_KIND:'migration',DATABASE_URL:'postgresql://postgres.'+input.control.project+':test@aws-0-me-central-1.pooler.supabase.com:5432/postgres'}};
const context={URL,process:fakeProcess,console:{log(value){result=JSON.parse(value);},error(value){errors.push(value);}},
 require(name){if(name==='node:module')return {createRequire(){return ()=>({Pool});}};return require(name);}};
vm.runInNewContext(input.script,context);
setImmediate(()=>process.stdout.write(JSON.stringify({result,errors,queries,exitCode:fakeProcess.exitCode||0})));
"""
        completed = subprocess.run([shutil.which('node') or 'C:/Program Files/nodejs/node.exe', '-e', harness,
                                    json.dumps({'script': adapter.DB_SCRIPT, 'control': control,
                                                'action': action, 'options': options or {}})], capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)

    def test_native_prepare_can_read_catalog_with_existing_deployment_credentials(self):
        receipt = self.database('prepare')
        self.assertEqual(receipt['exitCode'], 0, receipt)
        self.assertEqual(receipt['result']['state'], 'prepared')

    def test_native_activation_refuses_posting_on_and_uses_no_deadline(self):
        rejected = self.database('activate', {'posting': True})
        self.assertNotEqual(rejected['exitCode'], 0)
        self.assertFalse(any('private.activate_staging_voice_epoch' in query['sql'] for query in rejected['queries']))
        active = self.database('activate')
        self.assertEqual(active['exitCode'], 0, active)
        self.assertIsNone(active['result']['expiresAt'])
        query = next(query for query in active['queries'] if 'private.activate_staging_voice_epoch' in query['sql'])
        self.assertIn('$1::uuid,$2,null', query['sql'])

    def test_native_close_rejects_foreign_epoch_manifest_without_mutation(self):
        receipt = self.database('close', {'foreign': True})
        self.assertNotEqual(receipt['exitCode'], 0)
        self.assertFalse(any('private.close_staging_voice_epoch' in query['sql'] for query in receipt['queries']))

    def test_native_status_uses_read_only_transaction_and_never_grants_role(self):
        receipt = self.database('status')
        self.assertEqual(receipt['exitCode'], 0, receipt)
        self.assertEqual(receipt['queries'][0]['sql'], 'begin read only')
        self.assertFalse(any(query['sql'].startswith(('grant ', 'update ', 'delete ', 'insert ')) for query in receipt['queries']))

    def test_native_permission_failure_preserves_only_sanitized_action_stage_sqlstate(self):
        receipt = self.database('status', {'sqlstate': '42501'})
        self.assertNotEqual(receipt['exitCode'], 0)
        diagnostic = json.loads(receipt['errors'][0])
        self.assertEqual(diagnostic, {'error': 'OPERATING_DATABASE_FAILED', 'action': 'status',
                                     'stage': 'status', 'code': '42501'})
        self.assertNotIn('password', json.dumps(receipt['errors']))
        self.assertNotIn('SELECT', json.dumps(receipt['errors']))

    def test_native_process_failure_does_not_erase_sanitized_database_reason(self):
        diagnostic = {'error': 'OPERATING_DATABASE_FAILED', 'action': 'close', 'stage': 'close', 'code': '42501'}
        completed = types.SimpleNamespace(returncode=1, stdout='', stderr=json.dumps(diagnostic))
        with patch.object(adapter.subprocess, 'run', return_value=completed):
            host = adapter.LocalHost('/opt/masarifi/customer-voice-operating-' + GENERATION)
            with self.assertRaisesRegex(adapter.GuardError, '^OPERATING_DATABASE_FAILED_CLOSE_CLOSE_42501$'):
                host.run(['docker', 'run', '--rm'])
    def test_inherited_docker_context_or_remote_host_cannot_redirect_commands(self):
        with patch.dict('os.environ', {'DOCKER_HOST': 'tcp://foreign:2375', 'DOCKER_CONTEXT': 'foreign'}), \
                patch.object(adapter.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0, stdout='ok')) as process:
            host = adapter.LocalHost('/opt/masarifi/customer-voice-operating-' + GENERATION)
            self.assertEqual(host.run(['docker', 'inspect', '2' * 64]), 'ok')
            environment = process.call_args.kwargs['env']
            self.assertEqual(environment['DOCKER_HOST'], 'unix:///var/run/docker.sock')
            self.assertNotIn('DOCKER_CONTEXT', environment)

    def test_duplicate_json_and_nonfinite_numbers_are_rejected(self):
        for text in ('{"approval":1,"approval":2}', '{"observedAt":NaN}'):
            with self.subTest(text=text), self.assertRaises(adapter.GuardError):
                adapter.parse_json(text)

    def test_database_helper_is_project_bound_image_pinned_and_close_independent_of_packet(self):
        packet = approved_packet()
        state = {'epochId': '20000000-0000-4000-8000-000000000001', 'manifestHash': 'd' * 64,
                 'sourceSha': packet['sourceSha'], 'imageDigest': packet['imageDigest']}
        for action in ('status', 'prepare', 'activate', 'close'):
            with self.subTest(action=action):
                command = adapter.database_command(None if action == 'close' else packet, action, state)
                self.assertEqual(command[:3], ['docker', 'run', '--rm'])
                self.assertIn(IMAGE_PREFIX + packet['imageDigest'], command)
                self.assertIn('OPERATING_ACTION=' + action, command)
                self.assertIn('MASARIFI_PROCESS_KIND=migration', command)
                self.assertIn('--read-only', command)
                self.assertIn('--cap-drop=ALL', command)
                self.assertNotIn('--privileged', command)
                control = json.loads(next(value for value in command if value.startswith('OPERATING_CONTROL='))[18:])
                self.assertEqual(control['project'], PROJECT)
        self.assertIn('private.close_staging_voice_epoch', adapter.DB_SCRIPT)
        self.assertNotIn('delete from', adapter.DB_SCRIPT.lower())

    def test_root_guard_rejects_wrong_host_uid_permissions_and_generation(self):
        root = '/opt/masarifi/customer-voice-operating-' + GENERATION
        folder = types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        control = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0)
        adapter.root_guard(root, GENERATION, 'srv2006836', 0, folder, control)
        for host, uid, directory, file in (('foreign', 0, folder, control), ('srv2006836', 1000, folder, control),
                ('srv2006836', 0, types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0), control),
                ('srv2006836', 0, folder, types.SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0))):
            with self.assertRaises(adapter.GuardError):
                adapter.root_guard(root, GENERATION, host, uid, directory, file)

    def test_cli_validate_rejects_unapproved_packet_without_host_calls(self):
        scratch_root = os.environ.get('MASARIFI_TEST_SCRATCH') or ('E:/' if pathlib.Path('E:/').is_dir() else None)
        with tempfile.TemporaryDirectory(dir=scratch_root) as scratch:
            filename = pathlib.Path(scratch) / 'packet.json'
            packet = approved_packet()
            del packet['approval']
            filename.write_text(json.dumps(packet))
            completed = subprocess.run([sys.executable, str(ADAPTER), 'validate', str(filename)], capture_output=True, text=True)
            self.assertNotEqual(completed.returncode, 0)
            self.assertEqual(json.loads(completed.stdout)['error'], 'DIRECT_HUMAN_OPERATING_APPROVAL_REQUIRED')


class PreparationCLI(unittest.TestCase):
    def test_unapproved_intent_is_reviewable_but_never_executable(self):
        completed = subprocess.run([sys.executable, str(ADAPTER), 'intent'],
                                   capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        receipt = json.loads(completed.stdout)
        self.assertFalse(receipt['executable'])
        self.assertIn('FINAL_IMAGE_AND_SOURCE_REQUIRED', receipt['blockers'])
        self.assertIn('CURRENT_COHORT_BACKUP_AND_OFF_REHEARSAL_REQUIRED', receipt['blockers'])
        self.assertIn('DIRECT_HUMAN_OPERATING_APPROVAL_REQUIRED', receipt['blockers'])
        self.assertEqual(len(receipt['rollbackComposeFiles']), 6)


class PacketSafety(unittest.TestCase):
    def test_valid_indefinite_operating_generation_has_no_canary_restrictions(self):
        self.assertEqual(observed_guard(approved_packet()), 'VALID')

    def test_missing_direct_approval_is_rejected(self):
        packet = approved_packet()
        del packet['approval']
        self.assertEqual(observed_guard(packet), 'DIRECT_HUMAN_OPERATING_APPROVAL_REQUIRED')

    def test_packet_mutation_cannot_reuse_approval_hash(self):
        packet = approved_packet()
        packet['imageDigest'] = '9' * 64
        self.assertEqual(observed_guard(packet), 'APPROVED_PACKET_MISMATCH')

    def test_canary_owner_device_amount_and_deadline_fields_are_rejected(self):
        for key in ('ownerId', 'device', 'maxTransactions', 'maxExpenseMinor', 'deadline'):
            with self.subTest(key=key):
                packet = approved_packet()
                packet[key] = 'unexpected canary restriction'
                approve(packet)
                self.assertEqual(observed_guard(packet), 'OPERATING_PACKET_FIELDS_INVALID')

    def test_four_file_legacy_cohort_cannot_be_used_as_a_rollback_descriptor(self):
        packet = approved_packet()
        packet['rollback']['composeFiles'] = packet['rollback']['composeFiles'][:4]
        approve(packet)
        self.assertEqual(observed_guard(packet), 'EXACT_SIX_FILE_COHORT_REQUIRED')

    def test_missing_backup_digest_is_not_an_executable_placeholder(self):
        packet = approved_packet()
        del packet['rollback']['backupDigest']
        approve(packet)
        self.assertEqual(observed_guard(packet), 'CURRENT_COHORT_BACKUP_REQUIRED')

    def test_missing_cash_confirmation_or_availability_migration_is_rejected(self):
        for migration in MIGRATIONS[1:]:
            with self.subTest(migration=migration):
                packet = approved_packet()
                packet['requiredMigrations'] = [version for version in MIGRATIONS if version != migration]
                approve(packet)
                self.assertEqual(observed_guard(packet), 'REQUIRED_MIGRATIONS_INVALID')

    def test_stale_approval_cannot_start_a_new_writer(self):
        self.assertEqual(observed_guard(approved_packet(), NOW + 86400 * 2), 'ACTIVATION_APPROVAL_STALE')


if __name__ == '__main__':
    unittest.main()
