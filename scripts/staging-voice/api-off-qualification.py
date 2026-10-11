"""One approval-bound, loopback-only API qualification; never replaces a service."""
import importlib.util
import json
import pathlib
import signal
import socket
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('api_off_baseline', HERE / 'off-monitor-rehearsal.py')
off = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(off)
op = off.operating
require, GuardError = op.require, op.GuardError
CASES = {'voiceSessionCreate', 'voiceAnalysis', 'voiceFinancialIntent', 'voiceWorker',
         'postingPreservation', 'assistantDirect', 'assistantProvider', 'manualAdd', 'idempotentRecovery'}
PORT = 3001


def packet_hash(packet):
    return op.canonical_hash({k: v for k, v in packet.items() if k != 'approval'})


def validate(packet, now):
    require(packet.get('version') == 1 and packet.get('kind') == 'posting-off-isolated-api' and
            packet.get('host') == 'srv2006836' and packet.get('project') == op.PROJECT,
            'ISOLATED_STAGING_API_REQUIRED')
    require(op.UUID.fullmatch(packet.get('generation', '')) and op.SHA.fullmatch(packet.get('sourceSha', '')) and
            op.valid_hash(packet.get('imageDigest')), 'EXACT_CANDIDATE_REQUIRED')
    require(packet.get('endpoint') == {'host': '127.0.0.1', 'port': PORT} and
            packet.get('sharedServiceChanges') is False and packet.get('financialAuthority') is None,
            'LOOPBACK_ONLY_SCOPE_REQUIRED')
    approval = packet.get('approval') or {}
    require(approval.get('kind') == 'direct-human-isolated-api-approval' and
            approval.get('packetHash') == packet_hash(packet) and
            isinstance(approval.get('verbatimMessage'), str) and 1 <= len(approval['verbatimMessage'].strip()) <= 4096 and
            isinstance(approval.get('messageReference'), str) and 8 <= len(approval['messageReference']) <= 256,
            'DIRECT_HUMAN_API_APPROVAL_REQUIRED')
    received, expires = op.instant(approval.get('receivedAt')), op.instant(packet.get('expiresAt'))
    require(received <= now < expires <= received + 3600 and
            0 <= now - op.instant(packet['cohort']['observedAt']) <= 900, 'FRESH_API_APPROVAL_REQUIRED')
    require(packet.get('requiredMigrations') == op.MIGRATIONS, 'MIGRATION_PINS_REQUIRED')
    off.validate_cohort(packet['cohort'], now)
    off.checked_snapshot(packet['baseline'], packet)


def candidate_name(identity):
    require(op.UUID.fullmatch(identity.get('generation', '')), 'GENERATION_REQUIRED')
    return 'masarifi-staging-api-qualification-' + identity['generation']


def snapshot_script(database_url):
    return ('process.env.DATABASE_URL=' + json.dumps(database_url) +
            ';process.env.MASARIFI_PROCESS_KIND="migration";process.env.OPERATING_ACTION="status";' +
            'process.env.OPERATING_CONTROL=' + json.dumps(json.dumps({'project': op.PROJECT})) + ';' + off.OFF_DATABASE_SCRIPT)


def create_command(packet):
    return ['docker', 'create', '--pull=never', '--name', candidate_name(packet),
            '--user', '65532:65532', '--entrypoint', '/nodejs/bin/node', '--init',
            '--network', op.NETWORK, '--ipc=none', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--pids-limit', '256', '--memory', '512m', '--cpus', '1',
            '--restart', 'no', '--log-driver', 'json-file', '--log-opt', 'max-size=1m', '--log-opt', 'max-file=2',
            '--publish', '127.0.0.1:3001:3000', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
            '--label', 'org.masarifi.api-qualification=' + packet['generation'],
            '--env-file', '/opt/masarifi/customer-voice-operating-' + packet['generation'] + '/database-control.env',
            '-v', op.DATABASE_CA_BIND, op.IMAGE_PREFIX + packet['imageDigest'], 'dist/src/main.js']


def checked_candidate(host, state):
    c = host.inspect(state['id'] or candidate_name(state))
    require(op.valid_hash(c.get('Id')) and (state['id'] is None or c['Id'] == state['id']) and
            c.get('Name') == '/' + candidate_name(state) and c.get('Image') == state['imageID'], 'CANDIDATE_IDENTITY_CHANGED')
    config, isolation = c['Config'], c['HostConfig']
    env = op.environment(c)
    require(config['Image'] == op.IMAGE_PREFIX + state['imageDigest'] and config['User'] == '65532:65532' and
            config['Entrypoint'] == ['/nodejs/bin/node'] and config['Cmd'] == ['dist/src/main.js'] and
            config['Labels'].get('org.masarifi.api-qualification') == state['generation'] and
            not any(key.startswith('com.docker.compose.') for key in config['Labels']) and
            len(config['Env']) == len(env) and op.canonical_hash(env) == state['environmentHash'] and
            env.get('MASARIFI_PROCESS_KIND') == 'api' and env.get('MASARIFI_RELEASE_VERSION') == state['sourceSha'] and
            env.get('MASARIFI_VOICE_ANALYSIS_ONLY') == 'true' and env.get('SUPABASE_URL') == 'https://' + op.PROJECT + '.supabase.co',
            'CANDIDATE_CONFIGURATION_CHANGED')
    require(isolation.get('NetworkMode') == op.NETWORK and isolation.get('ReadonlyRootfs') is True and
            isolation.get('Privileged') is False and not isolation.get('CapAdd') and isolation.get('CapDrop') == ['ALL'] and
            isolation.get('SecurityOpt') == ['no-new-privileges'] and isolation.get('Init') is True and
            isolation.get('PidsLimit') == 256 and isolation.get('Memory') == 536870912 and
            isolation.get('NanoCpus') == 1000000000 and isolation.get('AutoRemove') is False and
            isolation.get('RestartPolicy') == {'Name': 'no', 'MaximumRetryCount': 0} and
            isolation.get('Binds') == [op.DATABASE_CA_BIND] and
            isolation.get('Tmpfs') == {'/tmp': 'rw,noexec,nosuid,size=64m'} and
            isolation.get('PortBindings') == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3001'}]} and
            isolation.get('PublishAllPorts') is False and isolation.get('IpcMode') == 'none' and not isolation.get('PidMode') and
            not any(isolation.get(key) for key in ['Devices', 'DeviceRequests', 'VolumesFrom', 'Links', 'Mounts']) and
            isolation.get('LogConfig') == {'Type': 'json-file', 'Config': {'max-size': '1m', 'max-file': '2'}},
            'CANDIDATE_ISOLATION_CHANGED')
    mounts = c['Mounts']
    require(len([m for m in mounts if m.get('Type') == 'bind']) == 1 and all(
            (m.get('Type') == 'bind' and m.get('Source') == '/etc/masarifi/supabase-ca.crt' and
             m.get('Destination') == '/etc/ssl/certs/masarifi-database-ca.crt' and m.get('RW') is False) or
            (m.get('Type') == 'tmpfs' and m.get('Destination') == '/tmp') for m in mounts), 'CANDIDATE_MOUNT_CHANGED')
    networks = c['NetworkSettings']['Networks']
    require(set(networks) == {op.NETWORK} and all(alias in (candidate_name(state), c['Id'][:12])
            for alias in (networks[op.NETWORK].get('Aliases') or [])), 'CANDIDATE_NETWORK_ALIAS_CHANGED')
    return c


def qualify(packet, host):
    host.preflight(packet)
    host.prepare(packet)
    try:
        host.create(packet)
        host.start()
        host.verify(packet)
    finally:
        host.cleanup()
    host.verify_preserved(packet)
    return {'candidateStopped': True, 'sharedServicesPreserved': True, 'financialBaselinePreserved': True,
            'postingOff': True, 'clientTrafficPromoted': False, 'deviceAcceptancePerformed': False}


class RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise GuardError('HTTP_REDIRECT_FORBIDDEN')


class Host(op.LocalHost):
    def pins(self, packet):
        validate(packet, self.now())
        self.target(packet['generation'])
        require(self.read_json('packet.json') == packet, 'PACKET_CHANGED')
        for name, digest in packet['files'].items():
            require(pathlib.Path(name).name == name, 'ARTIFACT_PATH_INVALID')
            self.pin(self.root / name, digest)
        require({'api-off-qualification.py', 'customer-operating-cohort.py', 'off-monitor-rehearsal.py',
                 'compatibility.json', 'backup-restore.json', 'off-rehearsal.json'}.issubset(packet['files']), 'ARTIFACTS_REQUIRED')
        for entry in packet['cohort']['composeFiles']: self.pin(entry['path'], entry['sha256'])
        for name, digest in packet['cohort']['envHashes'].items(): self.pin('/etc/masarifi/' + name, digest)
        self.pin('/etc/masarifi/supabase-ca.crt', packet['cohort']['databaseCAHash'])
        compatibility = self.read_json('compatibility.json')
        require(compatibility['sourceSha'] == packet['sourceSha'] and compatibility['image'] == op.IMAGE_PREFIX + packet['imageDigest'] and
                compatibility['contracts'] == op.CONTRACTS and set(compatibility['cases']) == CASES and
                all(value == 'passed' for value in compatibility['cases'].values()) and compatibility['validationLogs'] and
                all(packet['files'].get(name) == value for name, value in compatibility['validationLogs'].items()), 'BEHAVIORAL_COMPATIBILITY_REQUIRED')
        proof = self.read_json('backup-restore.json')
        require(proof.get('restoreVerified') is True and proof.get('financialFingerprints') == packet['baseline']['fingerprints'] and
                proof.get('backupDigest') == packet['cohort']['backupDigest'] and
                packet['files']['backup-restore.json'] == packet['cohort']['backupRestoreReceiptHash'] and
                proof.get('requiredMigrations') == packet['requiredMigrations'] and
                proof.get('cohortHash') == op.canonical_hash({k: v for k, v in packet['cohort'].items()
                    if k not in ('backupDigest', 'backupRestoreReceiptHash')}) and
                0 <= self.now() - op.instant(proof.get('observedAt')) <= 900, 'VERIFIED_RESTORE_REQUIRED')
        receipt = self.read_json('off-rehearsal.json')
        require(receipt.get('result') == 'PASS' and receipt.get('bothHelpersStopped') is True and
                receipt.get('financialAndHistoricalBaselineUnchanged') is True, 'ACTUAL_OFF_REHEARSAL_REQUIRED')

    def preserved(self, packet):
        for entry in packet['cohort']['services']:
            c = op.checked_cohort(self, entry['name'], entry['service'], entry['id'], entry['sourceSha'],
                                  op.IMAGE_PREFIX + entry['imageDigest'], off.SERVICES[entry['name']][1])
            require(off.configuration_hash(c) == entry['configurationHash'], 'SHARED_SERVICE_CHANGED')
        state = self.read_json('runtime.json')
        extra = set()
        if state and state.get('id'):
            c = checked_candidate(self, state)
            require(c['State']['Running'] is False, 'CANDIDATE_STILL_RUNNING')
            extra.add(c['Id'])
        for all_containers, key in [(True, 'containerIDs'), (False, 'runningIDs')]:
            actual = self.run(['docker', 'ps'] + (['-a'] if all_containers else []) + ['--no-trunc', '--format', '{{.ID}}']).splitlines()
            require(set(actual) == set(packet['cohort'][key]) | (extra if all_containers else set()), 'INVENTORY_CHANGED')

    def snapshot(self, packet):
        api = next(entry for entry in packet['cohort']['services'] if entry['service'] == 'api')
        c = self.inspect(api['id'])
        require(off.configuration_hash(c) == api['configurationHash'] and c['State']['Running'] is True, 'BASELINE_READER_CHANGED')
        self.pin('/etc/masarifi/migration.env', packet['cohort']['envHashes']['migration.env'])
        values = self.database_environment({'Config': {'Env': []}}, {'sourceSha': packet['sourceSha'],
                    'migrationEnvHash': packet['cohort']['envHashes']['migration.env']})
        # The fixed script uses BEGIN READ ONLY and bounded SELECTs only.
        import subprocess
        result = subprocess.run(['docker', 'exec', '-i', api['id'], '/nodejs/bin/node', '-'],
                                input=snapshot_script(values['DATABASE_URL']), capture_output=True, text=True, timeout=40)
        require(result.returncode == 0, 'READ_ONLY_SNAPSHOT_FAILED')
        return off.checked_snapshot(op.parse_json(result.stdout), packet)

    def preflight(self, packet):
        self.pins(packet)
        require(self.read_json('runtime.json') is None, 'GENERATION_ALREADY_CONSUMED')
        self.preserved(packet)
        self.snapshot(packet)
        require(not self.run(['docker', 'ps', '-a', '--filter', 'name=^/' + candidate_name(packet) + '$', '--format', '{{.ID}}']), 'CANDIDATE_NAME_COLLISION')
        with socket.socket() as probe: probe.bind(('127.0.0.1', PORT))

    def prepare(self, packet):
        image = op.parse_json(self.run(['docker', 'image', 'inspect', op.IMAGE_PREFIX + packet['imageDigest']]))[0]
        require(op.IMAGE_PREFIX + packet['imageDigest'] in image['RepoDigests'] and
                image['Config']['Labels']['org.opencontainers.image.revision'] == packet['sourceSha'], 'IMAGE_SOURCE_CHANGED')
        api = next(entry for entry in packet['cohort']['services'] if entry['service'] == 'api')
        current = self.inspect(api['id'])
        require(off.configuration_hash(current) == api['configurationHash'], 'API_ENV_SOURCE_CHANGED')
        values = dict(entry.split('=', 1) for entry in image['Config'].get('Env', []))
        require(len(values) == len(image['Config'].get('Env', [])), 'IMAGE_ENV_DUPLICATE')
        require(len(op.environment(current)) == len(current['Config']['Env']), 'API_ENV_DUPLICATE')
        values.update(op.environment(current)); values.update(MASARIFI_PROCESS_KIND='api', MASARIFI_RELEASE_VERSION=packet['sourceSha'])
        require(values.get('MASARIFI_VOICE_ANALYSIS_ONLY') == 'true' and
                not any(values.get(k) for k in ['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH']), 'API_ENV_UNSAFE')
        self.prepare_database_environment(packet, 'control', values)
        state = {key: packet[key] for key in ['generation', 'sourceSha', 'imageDigest']}
        state.update(version=1, kind='posting-off-isolated-api', packetHash=packet_hash(packet), imageID=image['Id'],
                     environmentHash=op.canonical_hash(values), id=None, phase='prepared')
        self.write_state(state, initial=True)

    def authorize_mutation(self, packet):
        require(self.read_json('packet.json') == packet, 'PACKET_CHANGED')
        require(self.read_json('runtime.json')['packetHash'] == packet_hash(packet), 'RUNTIME_PACKET_CHANGED')
        validate(packet, self.now())

    def create(self, packet):
        self.authorize_mutation(packet)
        identity = self.run(create_command(packet), timeout=30)
        state = self.read_json('runtime.json')
        c = checked_candidate(self, state)
        require(c['Id'] == identity, 'CREATE_ID_UNCONFIRMED')
        state['id'] = identity; state['phase'] = 'created'; self.write_state(state)

    def start(self):
        state = self.read_json('runtime.json'); c = checked_candidate(self, state)
        require(c['State']['Status'] == 'created' and c['State']['Running'] is False, 'ONLY_ONE_START_ALLOWED')
        state['phase'] = 'starting'; self.write_state(state)
        self.authorize_mutation(self.read_json('packet.json'))
        self.run(['docker', 'start', c['Id']])

    def verify(self, packet):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), RejectRedirect())
        for attempt in range(15):
            self.pins(packet)
            c = checked_candidate(self, self.read_json('runtime.json'))
            require(c['State']['Running'] is True, 'CANDIDATE_EXITED')
            responses = {}
            try:
                for endpoint in ['live', 'ready', 'compatibility']:
                    url = 'http://127.0.0.1:3001/health/' + endpoint
                    with opener.open(url, timeout=2) as response:
                        require(response.geturl() == url, 'HTTP_REDIRECT_FORBIDDEN')
                        responses[endpoint] = op.parse_json(response.read(65537).decode())
                require(responses['live'].get('status') == 'ok' and responses['live'].get('version') == packet['sourceSha'] and
                        responses['compatibility'] == {'schemaVersion': 1, 'contracts': op.CONTRACTS}, 'CANDIDATE_CONTRACT_CHANGED')
                if responses['ready'].get('status') == 'ready' and c['State'].get('Health', {}).get('Status') == 'healthy':
                    return
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pass
            if attempt < 14: self.pause(1)
        raise GuardError('CANDIDATE_READINESS_UNCONFIRMED')

    def cleanup(self):
        state = self.read_json('runtime.json')
        require(state and state.get('kind') == 'posting-off-isolated-api', 'OWNED_RUNTIME_REQUIRED')
        self.target(state['generation'], incident=True)
        names = self.run(['docker', 'ps', '-a', '--filter', 'name=^/' + candidate_name(state) + '$', '--no-trunc', '--format', '{{.ID}}'])
        if not names:
            require(state['id'] is None, 'OWNED_CANDIDATE_MISSING')
        else:
            c = checked_candidate(self, state)
            require(names == c['Id'], 'OWNERSHIP_UNCONFIRMED')
            state['id'] = c['Id']; self.write_state(state)
            if c['State']['Running']: self.run(['docker', 'stop', '--time', '10', c['Id']], timeout=25)
            require(checked_candidate(self, state)['State']['Running'] is False, 'STOP_UNCONFIRMED')
        state['phase'] = 'closed'; self.write_state(state)

    def verify_preserved(self, packet):
        self.pins(packet); self.preserved(packet); self.snapshot(packet)


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ('qualify', 'cleanup'), 'COMMAND_INVALID')
    host = Host(HERE)
    if sys.argv[1] == 'cleanup': host.cleanup(); return 0
    def interrupted(_signal, _frame): raise GuardError('QUALIFICATION_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    with host.deployment_lock():
        result = qualify(host.read_json('packet.json'), host)
    print(json.dumps(result, sort_keys=True)); return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        print(json.dumps({'error': op.safe_reason(error)})); sys.exit(1)
