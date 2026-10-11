"""Only the OS/Docker/HTTP/database boundaries are inert."""
import importlib.util
import pathlib
import copy
import json
import subprocess
import unittest
from unittest.mock import patch

PATH = pathlib.Path(__file__).with_name('api-off-qualification.py')
if PATH.exists():
    spec = importlib.util.spec_from_file_location('candidate', PATH)
    candidate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(candidate)
else:
    candidate = None


class Host:
    def __init__(self, failure=None):
        self.failure = failure
        self.events = []
        self.state = None
        self.running = False

    def preflight(self, packet):
        self.events.append('preflight')
        if self.failure == 'preflight': raise RuntimeError('blocked')
        if self.state is not None: raise RuntimeError('consumed')

    def prepare(self, packet):
        self.events.append('prepare')
        self.state = {'phase': 'prepared'}

    def create(self, packet):
        self.events.append('create')
        if self.failure == 'create': raise RuntimeError('uncertain create')

    def start(self):
        self.events.append('start')
        self.running = True
        if self.failure == 'start': raise RuntimeError('uncertain start')

    def verify(self, packet):
        self.events.append('verify')
        if self.failure == 'verify': raise RuntimeError('not ready')

    def cleanup(self):
        self.events.append('cleanup')
        if self.failure == 'cleanup': raise RuntimeError('stop unconfirmed')
        self.running = False
        self.state['phase'] = 'closed'

    def verify_preserved(self, packet):
        self.events.append('preserved')
        if self.failure == 'preserved': raise RuntimeError('baseline changed')


class Qualification(unittest.TestCase):
    def setUp(self): self.assertIsNotNone(candidate, 'Executable bounded API qualification is missing')

    def test_one_candidate_is_stopped_before_independent_preservation_check(self):
        host = Host()
        result = candidate.qualify({}, host)
        self.assertTrue(result['candidateStopped'])
        self.assertEqual(host.events, ['preflight', 'prepare', 'create', 'start', 'verify', 'cleanup', 'preserved'])
        self.assertFalse(host.running)
        self.assertEqual(host.state['phase'], 'closed')
        with self.assertRaises(RuntimeError): candidate.qualify({}, host)
        self.assertEqual(host.events.count('create'), 1)

    def test_creation_start_or_readiness_failure_still_stops_owned_candidate(self):
        for stage in ['create', 'start', 'verify']:
            with self.subTest(stage=stage):
                host = Host(stage)
                with self.assertRaises(RuntimeError): candidate.qualify({}, host)
                self.assertFalse(host.running)
                self.assertEqual(host.events.count('cleanup'), 1)
                self.assertNotIn('preserved', host.events)

    def test_preflight_failure_does_not_mutate_and_unconfirmed_cleanup_cannot_pass(self):
        host = Host('preflight')
        with self.assertRaises(RuntimeError): candidate.qualify({}, host)
        self.assertEqual(host.events, ['preflight'])
        for failure in ['cleanup', 'preserved']:
            with self.subTest(failure=failure), self.assertRaises(RuntimeError):
                candidate.qualify({}, Host(failure))

    def test_fixed_snapshot_passes_read_only_admission_without_network_access(self):
        script = candidate.snapshot_script('postgres://postgres.qcffvfbpzvpwcwxwjyro:test@fixture.supabase.com/postgres')
        probe = "require('node:module').createRequire=()=>()=>({Pool:class{constructor(){console.log('READ_ONLY_ADMISSION_REACHED');throw Error('synthetic stop');}}});"
        result = subprocess.run(['node', '-'], input=probe + script, capture_output=True, text=True)
        self.assertIn('READ_ONLY_ADMISSION_REACHED', result.stdout)
        self.assertIn('begin isolation level repeatable read read only', script)

    def test_cleanup_uses_full_identity_and_stops_only_owned_container(self):
        identity = 'd' * 64
        state = {'kind': 'posting-off-isolated-api', 'generation': packet()['generation'], 'id': identity}
        running = [True]
        commands = []
        host = candidate.Host(pathlib.Path('.'))
        host.read_json = lambda name: state
        host.target = lambda *args, **kwargs: None
        host.write_state = lambda value: None
        def run(args, **kwargs):
            commands.append(args)
            if args[1] == 'ps': return identity if '--no-trunc' in args else identity[:12]
            self.assertEqual(args, ['docker', 'stop', '--time', '10', identity])
            running[0] = False
            return identity
        host.run = run
        with patch.object(candidate, 'checked_candidate', side_effect=lambda *args: {'Id': identity, 'State': {'Running': running[0]}}):
            host.cleanup()
            host.cleanup()
        self.assertFalse(running[0])
        self.assertEqual(sum(command[1] == 'stop' for command in commands), 1)
        self.assertEqual(state['phase'], 'closed')

    def test_incomplete_or_duplicate_preservation_pins_are_rejected(self):
        for field in ['services', 'composeFiles', 'envHashes']:
            for mutation in ['omit', 'duplicate']:
                p = packet()
                entries = p['cohort'][field]
                if isinstance(entries, list):
                    if mutation == 'omit': entries.pop()
                    else: entries[-1] = copy.deepcopy(entries[0])
                else:
                    value = entries.pop(next(iter(entries)))
                    if mutation == 'duplicate': entries['foreign.env'] = value
                p['approval']['packetHash'] = candidate.packet_hash(p)
                with self.subTest(field=field, mutation=mutation), self.assertRaises(RuntimeError):
                    candidate.validate(p, 1791756000)

    def test_expired_approval_cannot_create_or_start(self):
        p = packet()
        host = candidate.Host(pathlib.Path('.'))
        host.now = lambda: 1791756601
        host.read_json = lambda name: p if name == 'packet.json' else {'id': 'd'*64, 'packetHash': candidate.packet_hash(p)}
        commands = []
        host.run = lambda args, **kwargs: commands.append(args)
        host.write_state = lambda value: None
        with patch.object(candidate, 'checked_candidate', return_value={'Id': 'd'*64, 'State': {'Status': 'created', 'Running': False}}):
            with self.assertRaises(candidate.GuardError): host.create(p)
            with self.assertRaises(candidate.GuardError): host.start()
        self.assertEqual(commands, [])

    def test_short_approval_is_bound_to_exact_isolated_scope(self):
        p = packet()
        candidate.validate(p, 1791756000)
        for key, value in [('approval', None), ('sharedServiceChanges', True),
                           ('financialAuthority', {'activate': True}), ('endpoint', {'host': '0.0.0.0', 'port': 3001})]:
            other = copy.deepcopy(p); other[key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError): candidate.validate(other, 1791756000)


def cohort():
    services = [{'name': name, 'service': role, 'id': str(i+1)*64, 'sourceSha': 'a'*40,
                 'imageDigest': 'b'*64, 'configurationHash': 'c'*64}
                for i, (name, (role, running)) in enumerate(candidate.off.SERVICES.items())]
    return {'observedAt': '2026-10-11T21:59:00Z',
            'composeFiles': [{'path': candidate.op.COHORT+'/'+name, 'sha256': 'c'*64} for name in candidate.op.COMPOSE_NAMES],
            'envHashes': {name: 'c'*64 for name in candidate.op.ENV_NAMES},
            'databaseCAHash': 'c'*64, 'backupDigest': 'c'*64, 'backupRestoreReceiptHash': 'c'*64,
            'services': services, 'containerIDs': [s['id'] for s in services],
            'runningIDs': [s['id'] for s in services[:3]]}


def packet():
    p = {'version': 1, 'kind': 'posting-off-isolated-api', 'host': 'srv2006836', 'project': candidate.op.PROJECT,
         'generation': '10000000-0000-4000-8000-000000000001', 'sourceSha': 'a'*40, 'imageDigest': 'b'*64,
         'endpoint': {'host': '127.0.0.1', 'port': 3001}, 'sharedServiceChanges': False, 'financialAuthority': None,
         'expiresAt': '2026-10-11T22:10:00Z', 'cohort': cohort(),
         'requiredMigrations': candidate.op.MIGRATIONS,
         'baseline': {'posting': False, 'activeEpochs': 0, 'analysisJobs': 0, 'migrations': candidate.op.MIGRATIONS,
                      'fingerprints': {k:'c'*64 for k in ['accounts','transactions','postings','balances']},
                      'historical': {'voicePending': 4, 'assistantPending': 0, 'outboxUnpublished': 497071}}}
    p['approval'] = {'kind': 'direct-human-isolated-api-approval', 'packetHash': candidate.packet_hash(p),
                     'receivedAt': '2026-10-11T21:59:00Z', 'verbatimMessage': 'Approve', 'messageReference': 'synthetic-user-reference'}
    return p


if __name__ == '__main__': unittest.main()
