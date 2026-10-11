"""Approval-bound persistent customer Voice cohort. Preparation is never approval."""
import json
import sys
import hashlib
import re
import datetime
import pathlib
import os
import socket
import stat
import subprocess
import time
import urllib.request
import contextlib

COHORT = '/opt/masarifi/staging-cohort-ac7bc92-client-recovery-20261010'
COMPOSE_NAMES = ('compose.backend.yml', 'release-version.yml', 'voice-runtime.yml',
                 'voice-analysis.yml', 'candidate.yml', 'api-ai-admission.yml')
PROJECT = 'qcffvfbpzvpwcwxwjyro'
HEX = re.compile(r'^[a-f0-9]{64}$')
SHA = re.compile(r'^[a-f0-9]{40}$')
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
ENV_NAMES = {'api.env', 'worker.env', 'migration.env', 'compose.env', 'admin.env'}
MIGRATIONS = ['20261010221534', '20261011002702', '20261011004500', '20261011004600', '20261011005920']
CONTRACTS = {'voiceSession': 2, 'voiceBatch': 3, 'voiceExtraction': 3,
             'voiceWorker': 1, 'voiceConfirmation': 2, 'assistantDirect': 2,
             'assistantProvider': 1, 'manualReceipt': 1}
IMAGE_PREFIX = 'ghcr.io/masarifiratibi-spec/masarifi-backend@sha256:'
NETWORK = 'masarifi-staging_backend'
CERTIFICATE = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'


class GuardError(RuntimeError):
    pass


def require(condition, reason):
    if not condition:
        raise GuardError(reason)


def canonical_hash(record):
    return hashlib.sha256(json.dumps(record, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False).encode()).hexdigest()


def instant(value):
    require(isinstance(value, str), 'TIMESTAMP_REQUIRED')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'UTC_TIMESTAMP_REQUIRED')
    return parsed.timestamp()


def packet_hash(packet):
    return canonical_hash({key: entry for key, entry in packet.items() if key != 'approval'})


def intent_hash(packet):
    return canonical_hash({key: entry for key, entry in packet.items()
                           if key not in ('approval', 'offRehearsal')})


def valid_hash(value):
    return isinstance(value, str) and HEX.fullmatch(value) is not None


def intent():
    return {'executable': False, 'project': 'qcffvfbpzvpwcwxwjyro',
            'mode': 'operating', 'version': 1, 'expiresAt': None,
            'rollbackComposeFiles': [COHORT + '/' + name for name in COMPOSE_NAMES],
            'blockers': ['FINAL_IMAGE_AND_SOURCE_REQUIRED',
                         'CURRENT_COHORT_BACKUP_AND_OFF_REHEARSAL_REQUIRED',
                         'DIRECT_HUMAN_OPERATING_APPROVAL_REQUIRED'],
            'admission': 'fresh captures; normal authenticated eligibility',
            'incidentAction': 'close owned epoch; stop exact owned writer ID; preserve shared API',
            'restoration': 'separate approval and unchanged owned API/cohort required'}


def validate_packet(packet, now, activation=True):
    require(isinstance(packet, dict), 'OPERATING_PACKET_REQUIRED')
    approval = packet.get('approval', {})
    require(approval.get('kind') == 'direct-human-operating-approval',
            'DIRECT_HUMAN_OPERATING_APPROVAL_REQUIRED')
    require(approval.get('packetHash') == packet_hash(packet), 'APPROVED_PACKET_MISMATCH')
    fields = {'version', 'mode', 'project', 'host', 'generation', 'sourceSha',
              'imageDigest', 'apkHash', 'requiredMigrations', 'apiContracts',
              'verification', 'files', 'rollback', 'offRehearsal', 'approval'}
    require(set(packet) == fields, 'OPERATING_PACKET_FIELDS_INVALID')
    require(type(packet['version']) is int and packet['version'] == 1 and
            packet['mode'] == 'operating', 'OPERATING_GENERATION_REQUIRED')
    require(packet['project'] == PROJECT and packet['host'] == 'srv2006836', 'STAGING_ONLY')
    require(UUID.fullmatch(packet['generation']) and SHA.fullmatch(packet['sourceSha']), 'IDENTITY_INVALID')
    require(valid_hash(packet['imageDigest']) and valid_hash(packet['apkHash']), 'FINAL_IMAGE_AND_APK_REQUIRED')
    for key, maximum in (('messageReference', 256), ('verbatimMessage', 4096)):
        require(isinstance(approval.get(key), str) and 8 <= len(approval[key].strip()) <= maximum,
                'DIRECT_HUMAN_EVIDENCE_REQUIRED')
    received = instant(approval.get('receivedAt'))
    require(received <= now, 'APPROVAL_FUTURE')
    if activation:
        require(now - received <= 86400, 'ACTIVATION_APPROVAL_STALE')
    rollback = packet['rollback']
    require(valid_hash(rollback.get('backupDigest')) and valid_hash(rollback.get('backupRestoreReceiptHash')),
            'CURRENT_COHORT_BACKUP_REQUIRED')
    compose = rollback.get('composeFiles', [])
    require([entry.get('path') for entry in compose] == [COHORT + '/' + name for name in COMPOSE_NAMES]
            and all(valid_hash(entry.get('sha256')) for entry in compose), 'EXACT_SIX_FILE_COHORT_REQUIRED')
    require(set(rollback.get('envHashes', {})) == ENV_NAMES and
            all(valid_hash(digest) for digest in rollback['envHashes'].values()) and
            valid_hash(rollback.get('databaseCAHash')), 'ENV_AND_CA_PINS_REQUIRED')
    require(SHA.fullmatch(rollback.get('sourceSha', '')) and valid_hash(rollback.get('imageDigest')) and
            all(valid_hash(rollback.get(key)) for key in ('apiID', 'analysisID', 'assistantID')), 'ROLLBACK_IDENTITIES_REQUIRED')
    require(packet['requiredMigrations'] == MIGRATIONS, 'REQUIRED_MIGRATIONS_INVALID')
    require(packet['apiContracts'] == CONTRACTS, 'COMPATIBILITY_CONTRACTS_REQUIRED')
    verification = packet['verification']
    require(all(verification.get(key) == packet[key] for key in ('sourceSha', 'imageDigest', 'apkHash')) and
            valid_hash(verification.get('ciEvidenceHash')) and valid_hash(verification.get('apkRuntimeEvidenceHash')),
            'EXACT_SOURCE_IMAGE_APK_VERIFICATION_REQUIRED')
    require(set(packet['files']) == {'customer-operating-cohort.py', 'financial-api.yml'} and
            all(valid_hash(digest) for digest in packet['files'].values()), 'CONTROL_PINS_REQUIRED')
    require(packet['offRehearsal'].get('intentHash') == intent_hash(packet) and
            valid_hash(packet['offRehearsal'].get('receiptHash')), 'OFF_REHEARSAL_REQUIRED')
    return packet


def worker_name(packet):
    return 'masarifi-staging-voice-operating-' + packet['generation']


def scope_name(packet):
    return 'masarifi-customer-voice-' + packet['generation']


def unit_name(packet):
    return scope_name(packet) + '-monitor.service'


def manifest(packet):
    return {'version': 1, 'mode': 'operating', 'sourceSha': packet['sourceSha'],
            'imageDigest': packet['imageDigest'], 'apkHash': packet['apkHash'],
            'controlHash': intent_hash(packet), 'newCapturesOnly': True,
            'normalEligibility': True, 'retentionPolicy': 'existing-operating'}


def candidate_api(packet):
    overlay = {'services': {'api': {'image': IMAGE_PREFIX + packet['imageDigest'],
                                   'environment': {'MASARIFI_RELEASE_VERSION': packet['sourceSha'],
                                                   'MASARIFI_VOICE_ANALYSIS_ONLY': 'false'}}}}
    return json.dumps(overlay, sort_keys=True, indent=2) + '\n'


def compose_command(packet, host, candidate=False):
    command = ['docker', 'compose', '--project-name', 'masarifi-staging',
               '--env-file', '/etc/masarifi/compose.env']
    for entry in packet['rollback']['composeFiles']:
        command += ['-f', entry['path']]
    if candidate:
        command += ['-f', str(host.root / 'financial-api.yml')]
    return command


def check_pins(packet, host):
    for name, digest in packet['files'].items():
        host.pin(host.root / name, digest)
    require(hashlib.sha256(candidate_api(packet).encode()).hexdigest() ==
            packet['files']['financial-api.yml'], 'CANDIDATE_API_ARTIFACT_INVALID')
    for entry in packet['rollback']['composeFiles']:
        host.pin(entry['path'], entry['sha256'])
    for name, digest in packet['rollback']['envHashes'].items():
        host.pin('/etc/masarifi/' + name, digest)
    host.pin('/etc/masarifi/supabase-ca.crt', packet['rollback']['databaseCAHash'])


def check_preparation_evidence(packet, host):
    rollback = packet['rollback']
    host.pin(host.root / 'backup-restore.json', rollback['backupRestoreReceiptHash'])
    backup = host.read_json('backup-restore.json')
    cohort = {key: entry for key, entry in rollback.items()
              if key not in ('backupDigest', 'backupRestoreReceiptHash')}
    require(backup.get('restoreVerified') is True and backup.get('backupDigest') == rollback['backupDigest']
            and backup.get('schemaVersions') == MIGRATIONS and backup.get('cohortHash') == canonical_hash(cohort),
            'BACKUP_RESTORE_PROOF_INVALID')
    host.pin(host.root / 'off-rehearsal.json', packet['offRehearsal']['receiptHash'])
    rehearsal = host.read_json('off-rehearsal.json')
    require(rehearsal.get('intentHash') == intent_hash(packet) and
            rehearsal.get('backupDigest') == rollback['backupDigest'] and
            all(rehearsal.get(key) is True for key in
                ('postingOffConfirmed', 'workerStoppedConfirmed', 'apiRestored', 'analysisRestored')) and
            valid_hash(rehearsal.get('financialBeforeHash')) and
            rehearsal.get('financialBeforeHash') == rehearsal.get('financialAfterHash') and
            0 <= host.now() - instant(rehearsal.get('observedAt')) <= 86400, 'OFF_REHEARSAL_UNVERIFIED')
    for name, digest_field in (('ci-evidence.json', 'ciEvidenceHash'), ('apk-runtime.json', 'apkRuntimeEvidenceHash')):
        host.pin(host.root / name, packet['verification'][digest_field])
        proof = host.read_json(name)
        require(proof.get('status') == 'passed' and proof.get('sourceSha') == packet['sourceSha'],
                'EXACT_ARTIFACT_PROOF_REQUIRED')
        if name == 'ci-evidence.json':
            require(proof.get('imageDigest') == packet['imageDigest'] and
                    proof.get('requiredMigrations') == MIGRATIONS and proof.get('contracts') == CONTRACTS,
                    'EXACT_CI_PROOF_REQUIRED')
            require(all(proof.get('checks', {}).get(check) == 'passed'
                        for check in ('clientApiCompatibility', 'confirmationOptIn')), 'CLIENT_CONFIRMATION_CI_REQUIRED')
        else:
            require(proof.get('apkHash') == packet['apkHash'] and proof.get('project') == PROJECT and
                    proof.get('package') == 'com.masarifi.mobile' and proof.get('certificateHash') == CERTIFICATE and
                    proof.get('runtimePurpose') == 'staging', 'STAGING_APK_PROOF_REQUIRED')


def environment(container):
    return dict(entry.split('=', 1) for entry in container['Config']['Env'])


def checked_cohort(host, name, service, identity=None, source=None, image=None, running=None):
    container = host.inspect(name)
    require(container['Name'] == '/' + name and (identity is None or container['Id'] == identity),
            'FOREIGN_API_COHORT_PRESERVED' if service == 'api' else 'COHORT_ID_CHANGED')
    labels = container['Config'].get('Labels', {})
    require(labels.get('com.docker.compose.project') == 'masarifi-staging' and
            labels.get('com.docker.compose.service') == service and container['HostConfig']['NetworkMode'] == NETWORK,
            'COHORT_IDENTITY_INVALID')
    env = environment(container)
    require(env.get('SUPABASE_URL') == 'https://' + PROJECT + '.supabase.co', 'COHORT_PROJECT_INVALID')
    if source is not None:
        require(env.get('MASARIFI_RELEASE_VERSION') == source, 'COHORT_SOURCE_CHANGED')
    if image is not None:
        require(container['Config']['Image'] == image, 'COHORT_IMAGE_CHANGED')
    if running is not None:
        require(container['State']['Running'] is running, 'COHORT_RUNNING_STATE_CHANGED')
    return container


def preserved_workers(packet, host, analysis_running):
    rollback = packet['rollback']
    image = IMAGE_PREFIX + rollback['imageDigest']
    analysis = checked_cohort(host, 'masarifi-staging-analysis-worker-1', 'analysis-worker',
                              rollback['analysisID'], rollback['sourceSha'], image, analysis_running)
    require(environment(analysis).get('MASARIFI_VOICE_ANALYSIS_ONLY') == 'true', 'ANALYSIS_MODE_CHANGED')
    assistant = checked_cohort(host, 'masarifi-staging-assistant-worker-1', 'assistant-worker',
                               rollback['assistantID'], rollback['sourceSha'], image, True)
    require(environment(assistant).get('MASARIFI_AI_ASSISTANT_ONLY') == 'true', 'ASSISTANT_MODE_CHANGED')
    for name, service in (('masarifi-staging-worker-1', 'worker'), ('masarifi-staging-voice-epoch-1', 'voice-epoch')):
        checked_cohort(host, name, service, running=False)


def api_health(packet, host, financial, original=False):
    rollback = packet['rollback']
    api = checked_cohort(host, 'masarifi-staging-api-1', 'api',
                         rollback['apiID'] if original else None,
                         rollback['sourceSha'] if original else None,
                         IMAGE_PREFIX + rollback['imageDigest'] if original else None, True)
    env = environment(api)
    require(api['State'].get('Health', {}).get('Status') == 'healthy', 'API_UNHEALTHY')
    require(env.get('MASARIFI_VOICE_ANALYSIS_ONLY') == ('false' if financial else 'true') and
            env.get('MASARIFI_AI_PROVIDER_ENABLED') == 'true', 'API_MODE_INVALID')
    require(SHA.fullmatch(env.get('MASARIFI_RELEASE_VERSION', '')) and
            re.fullmatch(re.escape(IMAGE_PREFIX) + '[a-f0-9]{64}', api['Config']['Image']), 'API_RELEASE_INVALID')
    require(host.http('ready').get('status') == 'ready' and
            host.http('live').get('version') == env['MASARIFI_RELEASE_VERSION'], 'API_NOT_READY')
    compatibility = host.http('compatibility')
    require(compatibility.get('schemaVersion') == 1 and compatibility.get('contracts') == packet['apiContracts'],
            'API_COMPATIBILITY_INVALID')
    return api


def checked_writer(host, state, require_name=True):
    require(valid_hash(state.get('workerID')), 'OWNED_WRITER_ID_REQUIRED')
    writer = host.inspect(state['workerID'])
    labels = writer['Config'].get('Labels', {})
    require(writer['Id'] == state['workerID'] and writer['HostConfig']['NetworkMode'] == NETWORK and
            labels.get('org.masarifi.scope') == state['scope'] and
            labels.get('com.docker.compose.project') == state['scope'] and
            labels.get('com.docker.compose.service') == state['service'], 'WRITER_OWNERSHIP_INVALID')
    if require_name:
        require(writer['Name'] == '/' + state['workerName'], 'WRITER_NAME_CHANGED')
    require(writer['Config']['Image'] == IMAGE_PREFIX + state['imageDigest'] and
            writer['Config']['Cmd'] == ['dist/src/staging-voice-worker.js'], 'WRITER_IMAGE_OR_COMMAND_CHANGED')
    env = environment(writer)
    require(env.get('MASARIFI_RELEASE_VERSION') == state['sourceSha'] and
            env.get('MASARIFI_STAGING_VOICE_EPOCH_ID') == state['epochId'] and
            env.get('MASARIFI_VOICE_ANALYSIS_ONLY') == 'false' and
            env.get('MASARIFI_AI_ASSISTANT_ONLY') == 'false' and
            env.get('SUPABASE_URL') == 'https://' + PROJECT + '.supabase.co', 'WRITER_ENV_INVALID')
    return writer


def preflight(packet, host):
    validate_packet(packet, host.now())
    host.target(packet['generation'])
    require(host.read_json('runtime.json') is None, 'GENERATION_ALREADY_USED')
    check_pins(packet, host)
    check_preparation_evidence(packet, host)
    images = parse_json(host.run(['docker', 'image', 'inspect', IMAGE_PREFIX + packet['imageDigest']]))
    require(isinstance(images, list) and len(images) == 1 and
            IMAGE_PREFIX + packet['imageDigest'] in images[0].get('RepoDigests', []) and
            images[0].get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') == packet['sourceSha'],
            'LOCAL_IMAGE_SOURCE_MISMATCH')
    database = host.db(packet, 'status')
    require(database.get('posting') is False and database.get('activeEpochs') == 0, 'POSTING_MUST_BE_OFF')
    require(database.get('analysisJobs') == 0, 'ANALYSIS_JOBS_PENDING')
    require(set(MIGRATIONS).issubset(database.get('migrations', [])), 'DATABASE_MIGRATIONS_MISSING')
    preserved_workers(packet, host, True)
    api_health(packet, host, False, True)
    exists = host.run(['docker', 'ps', '-a', '--filter', 'name=^/' + worker_name(packet) + '$', '--format', '{{.Names}}'])
    require(not exists, 'WORKER_NAME_ALREADY_OWNED')
    original = json.loads(host.run(compose_command(packet, host) + ['config', '--format', 'json']))
    candidate = json.loads(host.run(compose_command(packet, host, True) + ['config', '--format', 'json']))
    expected = json.loads(json.dumps(original))
    expected['services']['api']['image'] = IMAGE_PREFIX + packet['imageDigest']
    expected['services']['api']['environment'].update(MASARIFI_RELEASE_VERSION=packet['sourceSha'],
                                                    MASARIFI_VOICE_ANALYSIS_ONLY='false')
    require(original.get('name') == 'masarifi-staging' and candidate == expected,
            'API_ONLY_COMPOSE_CHANGE_REQUIRED')
    require(candidate['services']['api']['command'] == ['dist/src/main.js'], 'API_ENTRYPOINT_INVALID')
    return {'status': 'prepared', 'executable': True, 'manifest': manifest(packet),
            'packetHash': packet_hash(packet), 'workerName': worker_name(packet), 'monitor': unit_name(packet)}


def writer_command(packet, state):
    command = ['docker', 'create', '--pull=never', '--name', state['workerName'], '--network', NETWORK,
               '--user', '65532:65532', '--init', '--read-only', '--cap-drop=ALL',
               '--security-opt=no-new-privileges', '--pids-limit', '128', '--memory', '512m', '--cpus', '1',
               '--restart', 'no', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
               '--env-file', '/etc/masarifi/worker.env', '--health-cmd',
               '/nodejs/bin/node dist/src/staging-voice-healthcheck.js', '--health-interval', '5s',
               '--health-timeout', '3s', '--health-start-period', '10s', '--health-retries', '2',
               '--log-driver', 'json-file', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=5',
               '-v', '/etc/masarifi/supabase-ca.crt:/etc/ssl/certs/masarifi-database-ca.crt:ro']
    for name, entry in {'org.masarifi.scope': state['scope'], 'com.docker.compose.project': state['scope'],
                        'com.docker.compose.service': state['service']}.items():
        command += ['--label', name + '=' + entry]
    for name, entry in {'MASARIFI_PROCESS_KIND': 'worker', 'MASARIFI_RELEASE_VERSION': packet['sourceSha'],
                        'MASARIFI_STAGING_VOICE_EPOCH_ID': state['epochId'], 'MASARIFI_VOICE_ANALYSIS_ONLY': 'false',
                        'MASARIFI_AI_ASSISTANT_ONLY': 'false', 'MASARIFI_AI_PROVIDER_ENABLED': 'true',
                        'MASARIFI_AI_WORKER_POLL_MS': '500', 'MASARIFI_AI_JOB_BATCH_SIZE': '1',
                        'MASARIFI_AI_MAX_CONCURRENCY': '1', 'MASARIFI_AI_LEASE_SECONDS': '120'}.items():
        command += ['-e', name + '=' + entry]
    return command + [IMAGE_PREFIX + packet['imageDigest'], 'dist/src/staging-voice-worker.js']


def monitor_unit(packet, host):
    return ('[Unit]\nDescription=Masarifi customer Voice operating guard\nAfter=docker.service network-online.target\n'
            'Requires=docker.service\n[Service]\nType=simple\nUser=root\nExecStart=/usr/bin/python3 ' +
            str(host.root / 'customer-operating-cohort.py') + ' monitor\nExecStopPost=/usr/bin/python3 ' +
            str(host.root / 'customer-operating-cohort.py') + ' close\nTimeoutStopSec=180\n'
            'Restart=on-failure\nRestartSec=5\n'
            '[Install]\nWantedBy=multi-user.target\n')


def wait_ready(probe, host):
    previous = getattr(host, 'readiness_deadline', None)
    host.readiness_deadline = host.now() + 30
    try:
        for _ in range(30):
            if host.now() >= host.readiness_deadline:
                break
            try:
                receipt = probe()
                require(host.now() < host.readiness_deadline, 'OPERATING_READINESS_DEADLINE')
                return receipt
            except (GuardError, RuntimeError, OSError, KeyError, ValueError):
                host.pause(min(1, max(0, host.readiness_deadline - host.now())))
    finally:
        host.readiness_deadline = previous
    raise GuardError('OPERATING_READINESS_UNCONFIRMED')


def apply(packet, host):
    with host.deployment_lock():
        receipt = preflight(packet, host)
        epoch = host.db(packet, 'prepare')
        require(UUID.fullmatch(epoch.get('epochId', '')) and valid_hash(epoch.get('manifestHash')) and
                epoch.get('state') == 'prepared', 'EPOCH_PREPARATION_INVALID')
        state = {'version': 1, 'generation': packet['generation'], 'packetHash': packet_hash(packet),
                 'phase': 'prepared', 'scope': scope_name(packet), 'service': 'voice-operating-' + packet['generation'],
                 'workerName': worker_name(packet), 'workerID': None, 'apiID': None,
                 'sourceSha': packet['sourceSha'], 'imageDigest': packet['imageDigest'],
                 'epochId': epoch['epochId'], 'manifestHash': epoch['manifestHash'],
                 'migrationEnvHash': packet['rollback']['envHashes']['migration.env'],
                 'databaseCAHash': packet['rollback']['databaseCAHash'], 'armedAt': host.now()}
        host.write_state(state, initial=True)
        try:
            analysis = checked_cohort(host, 'masarifi-staging-analysis-worker-1', 'analysis-worker',
                                      packet['rollback']['analysisID'], running=True)
            api_health(packet, host, False, True)
            host.run(['docker', 'stop', '--time', '5', analysis['Id']])
            api_health(packet, host, False, True)
            host.run(compose_command(packet, host, True) + ['up', '-d', '--no-deps', '--pull', 'never', 'api'], timeout=60)
            api = host.inspect('masarifi-staging-api-1')
            require(api['Config']['Image'] == IMAGE_PREFIX + packet['imageDigest'] and
                    environment(api).get('MASARIFI_RELEASE_VERSION') == packet['sourceSha'], 'NEW_API_ID_UNCONFIRMED')
            state['apiID'] = api['Id']
            host.write_state(state)
            wait_ready(lambda: api_health(packet, host, True), host)
            state['workerID'] = host.run(writer_command(packet, state))
            require(valid_hash(state['workerID']), 'NEW_WRITER_ID_UNCONFIRMED')
            state.update(phase='armed', armedAt=host.now())
            host.write_state(state)
            checked_writer(host, state)
            unit = host.write_unit(unit_name(packet), monitor_unit(packet, host))
            host.run(['systemd-analyze', 'verify', unit])
            host.run(['systemctl', 'daemon-reload'])
            host.run(['systemctl', 'enable', '--now', unit_name(packet)])
            require(host.run(['systemctl', 'is-active', unit_name(packet)]) == 'active', 'MONITOR_NOT_ARMED')
            check_pins(packet, host)
            preserved_workers(packet, host, False)
            checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                           IMAGE_PREFIX + packet['imageDigest'], True)
            api_health(packet, host, True)
            activated = host.db(packet, 'activate', state)
            require(activated.get('epochId') == state['epochId'] and activated.get('expiresAt') is None,
                    'INDEFINITE_ACTIVATION_UNCONFIRMED')
            checked_writer(host, state)
            checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                           IMAGE_PREFIX + packet['imageDigest'], True)
            host.run(['docker', 'start', state['workerID']])
            wait_ready(lambda: status(packet, host), host)
            state['phase'] = 'active'
            host.write_state(state)
            return {**receipt, 'status': 'active', 'epochId': state['epochId'], 'workerID': state['workerID']}
        except (GuardError, RuntimeError, OSError, KeyError, ValueError):
            incident_close(host)
            raise


def status(packet, host):
    validate_packet(packet, host.now(), activation=False)
    host.target(packet['generation'])
    check_pins(packet, host)
    state = host.read_json('runtime.json')
    require(state and state['packetHash'] == packet_hash(packet), 'RUNTIME_APPROVAL_CHANGED')
    database = host.db(packet, 'status', state)
    epoch = operating_admission(state, database)
    require(set(MIGRATIONS).issubset(database.get('migrations', [])), 'DATABASE_MIGRATIONS_MISSING')
    heartbeat = epoch.get('heartbeatAt')
    require(isinstance(heartbeat, (int, float)) and 0 <= host.now() - heartbeat <= 15, 'HEARTBEAT_STALE')
    preserved_workers(packet, host, False)
    checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                   IMAGE_PREFIX + packet['imageDigest'], True)
    api = api_health(packet, host, True)
    writer = checked_writer(host, state)
    require(writer['State']['Running'] and writer['State'].get('Health', {}).get('Status') == 'healthy',
            'WRITER_UNHEALTHY')
    host.run(['docker', 'exec', state['workerID'], '/nodejs/bin/node', 'dist/src/staging-voice-healthcheck.js'], timeout=5)
    pulse = parse_json(host.run(['docker', 'exec', state['workerID'], '/nodejs/bin/node', '-e',
        "process.stdout.write(require('node:fs').readFileSync('/tmp/staging-voice-health.json','utf8'))"], timeout=5))
    require(pulse.get('sourceSha') == state['sourceSha'] and pulse.get('epochId') == state['epochId'] and
            pulse.get('mode') == 'operating' and pulse.get('enabled') is True and
            isinstance(pulse.get('observedAt'), (int, float)) and
            0 <= host.now() * 1000 - pulse['observedAt'] <= 15000, 'WORKER_HEARTBEAT_STALE')
    return {'status': 'ready', 'expiresAt': None, 'epochId': state['epochId'], 'workerID': state['workerID'],
            'apiSourceSha': environment(api)['MASARIFI_RELEASE_VERSION']}


def operating_admission(state, database):
    epoch = database.get('epoch', {}) or {}
    require(database.get('posting') is True and database.get('activeEpochs') == 1 and
            database.get('currentEpoch') == state['epochId'] and epoch.get('epochId') == state['epochId'] and epoch.get('state') == 'active' and
            epoch.get('mode') == 'operating' and epoch.get('manifestHash') == state['manifestHash'] and
            epoch.get('expiresAt') is None, 'OPERATING_ADMISSION_CLOSED')
    return epoch


def recover_writer(packet, host):
    # A stopped writer can resume only an already-open approved epoch. Docker
    # itself never restarts it ahead of these checks, including after reboot.
    with host.deployment_lock():
        validate_packet(packet, host.now(), activation=False)
        host.target(packet['generation'])
        check_pins(packet, host)
        state = host.read_json('runtime.json')
        require(state['packetHash'] == packet_hash(packet) and state['phase'] == 'active', 'RESTART_SCOPE_NOT_ACTIVE')
        require(state.get('lastRecoveryAt') is None or host.now() - state['lastRecoveryAt'] >= 60,
                'RESTART_COOLDOWN_ACTIVE')
        database = host.db(packet, 'status', state)
        operating_admission(state, database)
        require(set(MIGRATIONS).issubset(database.get('migrations', [])), 'DATABASE_MIGRATIONS_MISSING')
        preserved_workers(packet, host, False)
        checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                       IMAGE_PREFIX + packet['imageDigest'], True)
        require(checked_writer(host, state)['State']['Running'] is False, 'RESTART_REQUIRES_STOPPED_WRITER')
        recovery_api_ready(packet, state, host)
        state.update(phase='recovering', lastRecoveryAt=host.now())
        host.write_state(state)
        operating_admission(state, host.db(packet, 'status', state))
        checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                       IMAGE_PREFIX + packet['imageDigest'], True)
        checked_writer(host, state)
        host.run(['docker', 'start', state['workerID']])
        receipt = wait_ready(lambda: status(packet, host), host)
        state['phase'] = 'active'
        host.write_state(state)
        return receipt


def recovery_api_ready(packet, state, host):
    previous = getattr(host, 'readiness_deadline', None)
    host.readiness_deadline = host.now() + 30
    try:
        for _ in range(30):
            if host.now() >= host.readiness_deadline:
                break
            # Identity/pin loss never receives startup grace.
            check_pins(packet, host)
            checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                           IMAGE_PREFIX + packet['imageDigest'])
            require(checked_writer(host, state)['State']['Running'] is False, 'RESTART_REQUIRES_STOPPED_WRITER')
            try:
                api_health(packet, host, True)
                require(host.now() < host.readiness_deadline, 'OPERATING_READINESS_DEADLINE')
                return
            except GuardError as error:
                if str(error) not in ('API_UNHEALTHY', 'API_NOT_READY', 'COHORT_RUNNING_STATE_CHANGED'):
                    raise
            except OSError:
                pass
            host.pause(min(1, max(0, host.readiness_deadline - host.now())))
    finally:
        host.readiness_deadline = previous
    raise GuardError('RESTART_API_READINESS_UNCONFIRMED')


def safe_reason(error):
    return str(error) if isinstance(error, GuardError) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,127}', str(error)) else type(error).__name__


def incident_close(host):
    # Root-protected durable identities survive mutable packet/image/env pin loss.
    state = host.read_json('runtime.json')
    require(state and UUID.fullmatch(state.get('generation', '')) and UUID.fullmatch(state.get('epochId', '')) and
            valid_hash(state.get('manifestHash')), 'INCIDENT_IDENTITY_REQUIRED')
    require(state.get('version') == 1 and state.get('scope') == scope_name(state) and
            state.get('workerName') == worker_name(state) and state.get('service') == 'voice-operating-' + state['generation'] and
            valid_hash(state.get('packetHash')) and valid_hash(state.get('imageDigest')) and
            SHA.fullmatch(state.get('sourceSha', '')), 'INCIDENT_JOURNAL_SCOPE_INVALID')
    host.target(state['generation'], incident=True)
    previous_deadline = host.closure_deadline
    previous_timeout = host.closure_command_timeout
    previous_readiness = host.readiness_deadline
    host.readiness_deadline = None
    # The service permits 180s for shutdown. Share a monotonic 150s budget
    # across every Docker boundary, leaving time to persist the final receipt.
    host.closure_deadline = min(previous_deadline if previous_deadline is not None else float('inf'),
                                host.monotonic() + 150)
    try:
        return close_owned_scope(host, state)
    finally:
        host.closure_deadline = previous_deadline
        host.closure_command_timeout = previous_timeout
        host.readiness_deadline = previous_readiness


def close_owned_scope(host, state):
    receipt = {'postingOffConfirmed': False, 'workerStoppedConfirmed': False,
               'sharedApi': 'preserved', 'blockers': []}
    # Stop the sole owned financial writer before fresh SQL-helper setup: a
    # slow/unavailable daemon or database must never consume its stop window.
    host.closure_command_timeout = 10
    try:
        if state.get('workerID'):
            writer = checked_writer(host, state, require_name=False)
            if writer['State']['Running']:
                host.run(['docker', 'stop', '--time', '5', state['workerID']])
            require(host.inspect(state['workerID'])['State']['Running'] is False, 'WRITER_STOP_UNCONFIRMED')
        receipt['workerStoppedConfirmed'] = True
    except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        receipt['blockers'].append('OWNED_WRITER_STOP_UNCONFIRMED:' + safe_reason(error))
    host.closure_command_timeout = 30
    try:
        closed = host.db(None, 'close', state)
        require(closed.get('posting') is False and closed.get('state') == 'closed', 'DATABASE_OFF_UNCONFIRMED')
        receipt['postingOffConfirmed'] = True
    except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        receipt['blockers'].append('DATABASE_OFF_UNCONFIRMED:' + safe_reason(error))
    host.closure_command_timeout = 10
    try:
        host.stop_database_runners(state)
        receipt['databaseRunnersStoppedConfirmed'] = True
    except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        receipt['databaseRunnersStoppedConfirmed'] = False
        receipt['blockers'].append('DATABASE_RUNNER_STOP_UNCONFIRMED:' + safe_reason(error))
    state['phase'] = 'closed' if receipt['postingOffConfirmed'] and receipt['workerStoppedConfirmed'] else 'closure-pending'
    host.write_state(state)
    return receipt


def restoration_intent(packet, state):
    return {'packetHash': packet_hash(packet), 'epochId': state['epochId'], 'workerID': state['workerID'],
            'ownedAPIID': state['apiID'], 'rollbackHash': canonical_hash(packet['rollback'])}


def restore(packet, host, approval):
    state = host.read_json('runtime.json')
    require(isinstance(approval, dict) and approval.get('kind') == 'direct-human-operating-restoration-approval',
            'RESTORATION_APPROVAL_REQUIRED')
    require(approval.get('intentHash') == canonical_hash(restoration_intent(packet, state)) and
            0 <= host.now() - instant(approval.get('receivedAt')) <= 86400 and
            all(isinstance(approval.get(key), str) and 8 <= len(approval[key].strip()) <= maximum
                for key, maximum in (('messageReference', 256), ('verbatimMessage', 4096))), 'RESTORATION_APPROVAL_INVALID')
    with host.deployment_lock():
        validate_packet(packet, host.now(), activation=False)
        host.target(packet['generation'])
        check_pins(packet, host)
        require(state['packetHash'] == packet_hash(packet), 'RUNTIME_APPROVAL_CHANGED')
        database = host.db(packet, 'status', state)
        require(database.get('posting') is False and database.get('activeEpochs') == 0 and
                database.get('epoch', {}).get('state') == 'closed', 'RESTORATION_REQUIRES_OFF')
        require(checked_writer(host, state, require_name=False)['State']['Running'] is False, 'RESTORATION_REQUIRES_WRITER_STOP')
        preserved_workers(packet, host, False)
        checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'], packet['sourceSha'],
                       IMAGE_PREFIX + packet['imageDigest'], True)
        host.run(compose_command(packet, host) + ['config', '--quiet'])
        checked_cohort(host, 'masarifi-staging-api-1', 'api', state['apiID'])
        host.run(compose_command(packet, host) + ['up', '-d', '--no-deps', '--pull', 'never', 'api'], timeout=60)
        restored = wait_ready(lambda: api_health(packet, host, False), host)
        require(restored['Config']['Image'] == IMAGE_PREFIX + packet['rollback']['imageDigest'] and
                environment(restored)['MASARIFI_RELEASE_VERSION'] == packet['rollback']['sourceSha'], 'RESTORED_API_RELEASE_UNCONFIRMED')
        preserved_workers(packet, host, False)
        host.run(['docker', 'start', packet['rollback']['analysisID']])
        preserved_workers(packet, host, True)
        return {'posting': False, 'apiRestored': True, 'analysisRestored': True, 'workerStopped': True}


def monitor(packet, host):
    failures = 0
    while True:
        try:
            state = host.read_json('runtime.json')
            if state['phase'] in ('closed', 'closure-pending'):
                return incident_close(host)
            database = host.db(packet, 'status', state)
            epoch = database.get('epoch', {}) or {}
            if epoch.get('state') == 'prepared':
                require(database.get('posting') is False and 0 <= host.now() - state['armedAt'] <= 30,
                        'ARMING_FAILED')
                validate_packet(packet, host.now(), activation=False)
                check_pins(packet, host)
                failures = 0
            else:
                if state['phase'] == 'active' and checked_writer(host, state)['State']['Running'] is False:
                    recover_writer(packet, host)
                else:
                    require(state['phase'] != 'recovering', 'RESTART_INTERRUPTED')
                    status(packet, host)
                failures = 0
        except (GuardError, RuntimeError, OSError, KeyError, ValueError) as error:
            failures += 1
            if failures >= 3:
                receipt = incident_close(host)
                receipt['incidentReason'] = safe_reason(error)
                return receipt
        host.pause(5)


def resume_monitor(host):
    # A restarted guard must still close its owned scope when packet.json was
    # deleted or changed. The protected journal supplies closure identities.
    try:
        packet = host.read_json('packet.json')
        validate_packet(packet, host.now(), activation=False)
        host.target(packet['generation'])
    except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError):
        return incident_close(host)
    return monitor(packet, host)


DB_SCRIPT = r"""
const assert=require('node:assert/strict'),{createRequire}=require('node:module');
let stage='configuration';
const action=process.env.OPERATING_ACTION;
(async()=>{
const {Pool}=createRequire('/app/dist/src/ai/ai.worker.js')('pg');
const c=JSON.parse(process.env.OPERATING_CONTROL);
assert.equal(c.project,'qcffvfbpzvpwcwxwjyro');
assert.equal(process.env.MASARIFI_PROCESS_KIND,'migration');
assert(['status','prepare','activate','close'].includes(action));
const url=new URL(process.env.DATABASE_URL);
assert(url.hostname.endsWith('.supabase.com')&&decodeURIComponent(url.username).endsWith('.'+c.project));
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:15000});
stage='connection';const db=await pool.connect();try{
 stage='transaction';
 await db.query(action==='status'?'begin read only':'begin');
 await db.query("set local statement_timeout='15s'");
 if(action==='prepare'||action==='activate'){
  stage='migrations';
  const migrations=(await db.query('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version);
  assert(c.requiredMigrations.every(version=>migrations.includes(version)));
 }
 if(action!=='status'){
  stage='ownership';
  await db.query('grant masarifi_migration to current_user with set true,inherit false');
  await db.query('set local role masarifi_migration');
  await db.query('select singleton from private.staging_voice_runtime_control for update');
 }
 let result;
 if(action==='prepare'||action==='activate'){
  stage='admission';
  const admission=(await db.query(`select
   (select enabled from private.voice_automatic_policy) posting,
   (select count(*)::int from private.staging_voice_epochs where state='active') active,
   (select count(*)::int from public.voice_sessions s join private.voice_batch_context x on x.session_id=s.id
    where x.analysis_only and s.status in ('uploaded','processing')) jobs`)).rows[0];
  assert(admission.posting===false&&admission.active===0&&admission.jobs===0);
 }
 if(action==='prepare'){
  stage='prepare';
  assert(c.manifest.mode==='operating'&&c.manifest.version===1&&c.manifest.newCapturesOnly===true);
  result=(await db.query('select private.prepare_staging_voice_epoch($1,$2::jsonb) result',
    [c.project,JSON.stringify(c.manifest)])).rows[0].result;
 }
 if(action==='activate'||action==='close'){
  stage='ownership';
  const epoch=(await db.query(`select manifest_hash,mode,manifest->>'sourceSha' source,
   manifest->>'imageDigest' image from private.staging_voice_epochs where id=$1::uuid for update`,[c.epochId])).rows[0];
  assert(epoch&&epoch.manifest_hash===c.manifestHash&&epoch.mode==='operating'&&epoch.source===c.sourceSha&&epoch.image===c.imageDigest);
  if(action==='activate'){
   stage='activate';
   const current=(await db.query('select current_epoch from private.staging_voice_runtime_control')).rows[0];
   assert(current.current_epoch===c.epochId);
   result=(await db.query('select private.activate_staging_voice_epoch($1::uuid,$2,null) result',
     [c.epochId,c.manifestHash])).rows[0].result;
  }else{
   stage='close';
   await db.query("select private.close_staging_voice_epoch($1::uuid,'customer_operating_guard')",[c.epochId]);
   result=(await db.query(`select state,(select enabled from private.voice_automatic_policy) posting
    from private.staging_voice_epochs where id=$1::uuid`,[c.epochId])).rows[0];
  }
 }
 if(action==='status'){
  stage='status';
  result=(await db.query(`select (select enabled from private.voice_automatic_policy) posting,
   (select count(*)::int from private.staging_voice_epochs where state='active') "activeEpochs",
   (select current_epoch from private.staging_voice_runtime_control) "currentEpoch",
   (select count(*)::int from public.voice_sessions s join private.voice_batch_context x on x.session_id=s.id
    where x.analysis_only and s.status in ('uploaded','processing')) "analysisJobs",
   (select coalesce(jsonb_agg(version),'[]'::jsonb) from supabase_migrations.schema_migrations) migrations,
   (select jsonb_build_object('epochId',id,'state',state,'mode',mode,'manifestHash',manifest_hash,
    'expiresAt',expires_at,'heartbeatAt',extract(epoch from heartbeat_at)::double precision)
    from private.staging_voice_epochs where id=$1::uuid) epoch`,[c.epochId||null])).rows[0];
 }
 if(action!=='status'){
  stage='ownership';
  await db.query('reset role');await db.query('revoke masarifi_migration from current_user granted by current_user');
 }
 stage='commit';await db.query('commit');console.log(JSON.stringify(result));
 }catch(error){await db.query('rollback');throw error;}finally{db.release();await pool.end();}
})().catch(error=>{
 const code=/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:
  error.code==='ERR_ASSERTION'?'ERR_ASSERTION':
  /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message||'')?error.message:'UNAVAILABLE';
 console.error(JSON.stringify({error:'OPERATING_DATABASE_FAILED',
  action:['status','prepare','activate','close'].includes(action)?action:'invalid',stage,code}));
 process.exitCode=1;
});
"""


def database_control(packet, action, state=None):
    require(action in ('status', 'prepare', 'activate', 'close'), 'DATABASE_ACTION_INVALID')
    require(action != 'close' or state is not None, 'INCIDENT_IDENTITY_REQUIRED')
    control = {'project': PROJECT}
    if packet is not None:
        control.update(manifest=manifest(packet), requiredMigrations=packet['requiredMigrations'])
        image, source = packet['imageDigest'], packet['sourceSha']
    else:
        image, source = state['imageDigest'], state['sourceSha']
    require(valid_hash(image) and SHA.fullmatch(source), 'DATABASE_IMAGE_INVALID')
    if state:
        control.update({key: state[key] for key in ('epochId', 'manifestHash', 'sourceSha', 'imageDigest')})
        require(UUID.fullmatch(control['epochId']) and valid_hash(control['manifestHash']), 'DATABASE_SCOPE_INVALID')
    return control


DATABASE_IDLE = 'setInterval(()=>{},2147483647)'
DATABASE_CA_BIND = '/etc/masarifi/supabase-ca.crt:/etc/ssl/certs/masarifi-database-ca.crt:ro'


def database_command(packet, action, state=None, runner_id=None):
    control = database_control(packet, action, state)
    require(valid_hash(runner_id), 'DATABASE_RUNNER_ID_REQUIRED')
    return ['docker', 'exec', '-e', 'OPERATING_ACTION=' + action,
            '-e', 'OPERATING_CONTROL=' + json.dumps(control, separators=(',', ':')),
            runner_id, '/nodejs/bin/node', '-e', DB_SCRIPT]


def database_runner_command(identity, role):
    require(role in ('control', 'close') and UUID.fullmatch(identity.get('generation', '')) and
            valid_hash(identity.get('imageDigest')) and SHA.fullmatch(identity.get('sourceSha', '')),
            'DATABASE_RUNNER_SCOPE_INVALID')
    name = 'masarifi-staging-voice-database-' + identity['generation'] + '-' + role
    return ['docker', 'create', '--pull=never', '--name', name, '--user', '65532:65532',
            '--entrypoint', '/nodejs/bin/node', '--network', NETWORK, '--ipc=none', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit', '128', '--memory', '512m',
            '--cpus', '1', '--restart', 'no', '--log-driver', 'json-file',
            '--log-opt', 'max-size=1m', '--log-opt', 'max-file=2',
            '--label', 'org.masarifi.scope=' + scope_name(identity),
            '--label', 'org.masarifi.database-role=' + role,
            '--env-file', '/etc/masarifi/migration.env', '-e', 'MASARIFI_PROCESS_KIND=migration',
            '-e', 'MASARIFI_RELEASE_VERSION=' + identity['sourceSha'],
            '-v', DATABASE_CA_BIND, IMAGE_PREFIX + identity['imageDigest'], '-e', DATABASE_IDLE]


def checked_database_runner(host, journal):
    runner = host.inspect(journal['id'] or journal['name'])
    require(isinstance(runner, dict) and all(isinstance(runner.get(key), dict)
            for key in ('Config', 'HostConfig', 'State')), 'DATABASE_RUNNER_INSPECTION_INVALID')
    require(valid_hash(runner.get('Id')) and (journal['id'] is None or runner['Id'] == journal['id']) and
            runner.get('Name') == '/' + journal['name'] and runner.get('Image') == journal['imageID'],
            'DATABASE_RUNNER_IDENTITY_CHANGED')
    config, isolation = runner['Config'], runner['HostConfig']
    require(isinstance(config.get('Labels'), dict) and isinstance(config.get('Env'), list) and
            all(isinstance(entry, str) and '=' in entry for entry in config['Env']),
            'DATABASE_RUNNER_INSPECTION_INVALID')
    require(config.get('Image') == journal['image'] and config.get('User') == '65532:65532' and
            config.get('Entrypoint') == ['/nodejs/bin/node'] and config.get('Cmd') == ['-e', DATABASE_IDLE] and
            config.get('Labels', {}).get('org.masarifi.scope') == journal['scope'] and
            config.get('Labels', {}).get('org.masarifi.database-role') == journal['role'],
            'DATABASE_RUNNER_CONFIGURATION_CHANGED')
    require(canonical_hash(environment(runner)) == journal['environmentHash'] and
            len(config['Env']) == len(environment(runner)), 'DATABASE_RUNNER_ENV_CHANGED')
    require(isolation.get('NetworkMode') == NETWORK and isolation.get('ReadonlyRootfs') is True and
            isolation.get('Privileged') is False and not isolation.get('CapAdd') and
            isolation.get('CapDrop') == ['ALL'] and isolation.get('SecurityOpt') == ['no-new-privileges'] and
            isolation.get('PidsLimit') == 128 and isolation.get('Memory') == 536870912 and
            isolation.get('NanoCpus') == 1000000000 and isolation.get('AutoRemove') is False and
            isolation.get('RestartPolicy') == {'Name': 'no', 'MaximumRetryCount': 0} and
            isolation.get('Binds') == [DATABASE_CA_BIND] and not isolation.get('Tmpfs') and
            isolation.get('IpcMode') == 'none' and not isolation.get('PidMode') and
            not any(isolation.get(key) for key in ('Devices', 'DeviceRequests', 'VolumesFrom', 'PortBindings')) and
            isolation.get('LogConfig') == {'Type': 'json-file', 'Config': {'max-size': '1m', 'max-file': '2'}},
            'DATABASE_RUNNER_ISOLATION_CHANGED')
    mounts = runner.get('Mounts', [])
    require(isinstance(mounts, list) and len(mounts) == 1 and isinstance(mounts[0], dict) and mounts[0].get('Type') == 'bind' and
            mounts[0].get('Source') == '/etc/masarifi/supabase-ca.crt' and
            mounts[0].get('Destination') == '/etc/ssl/certs/masarifi-database-ca.crt' and
            mounts[0].get('RW') is False, 'DATABASE_RUNNER_MOUNT_CHANGED')
    return runner


def retained_database_runner(host, identity, role):
    # A generation has one reusable control runner and one independent closure
    # runner. Never delete, replace, or create a new name on a polling failure.
    command = database_runner_command(identity, role)
    name = command[command.index('--name') + 1]
    image = IMAGE_PREFIX + identity['imageDigest']
    images = parse_json(host.run(['docker', 'image', 'inspect', image]))
    require(isinstance(images, list) and len(images) == 1 and
            isinstance(images[0], dict) and isinstance(images[0].get('Config'), dict) and
            isinstance(images[0]['Config'].get('Labels'), dict) and
            image in images[0].get('RepoDigests', []) and
            re.fullmatch(r'sha256:[a-f0-9]{64}', images[0].get('Id', '')) and
            images[0].get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') == identity['sourceSha'],
            'DATABASE_RUNNER_IMAGE_SOURCE_MISMATCH')
    expected_environment = host.database_environment(images[0], identity)
    expected = {'version': 1, 'name': name, 'scope': scope_name(identity), 'role': role,
                'image': image, 'imageID': images[0]['Id'], 'commandHash': canonical_hash(command),
                'environmentHash': canonical_hash(expected_environment)}
    journal = host.read_runner(role)
    present = host.run(['docker', 'ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'])
    if journal is None:
        require(not present, 'DATABASE_RUNNER_NAME_ALREADY_OWNED')
        journal = {**expected, 'id': None, 'phase': 'idle'}
        # Persist intent before create: a timeout can leave a container even if
        # Docker did not return its ID. Reconcile only this exact specification.
        host.write_runner(role, journal, initial=True)
        identity_id = host.run(command)
        require(valid_hash(identity_id), 'DATABASE_RUNNER_CREATE_UNCONFIRMED')
        present = name
    else:
        require(isinstance(journal, dict) and set(journal) == set(expected) | {'id', 'phase'} and
                all(journal.get(key) == value for key, value in expected.items()) and
                (journal['id'] is None or valid_hash(journal['id'])), 'DATABASE_RUNNER_JOURNAL_CHANGED')
        require(journal['phase'] == 'idle', 'DATABASE_RUNNER_EXECUTION_UNCONFIRMED')
        require(present == name, 'DATABASE_RUNNER_MISSING')
        identity_id = journal['id']
    runner = checked_database_runner(host, journal)
    require(identity_id is None or runner['Id'] == identity_id, 'DATABASE_RUNNER_CREATE_ID_CHANGED')
    if journal['id'] is None:
        journal['id'] = runner['Id']
        host.write_runner(role, journal)
    if runner['State']['Running'] is False:
        host.run(['docker', 'start', journal['id']])
        runner = checked_database_runner(host, journal)
    require(runner['State']['Running'] is True, 'DATABASE_RUNNER_NOT_RUNNING')
    return journal['id']


def parse_json(content):
    def unique(pairs):
        record = {}
        for key, value in pairs:
            require(key not in record, 'JSON_DUPLICATE_KEY')
            record[key] = value
        return record
    def invalid(_value):
        raise GuardError('JSON_NONFINITE_INVALID')
    try:
        return json.loads(content, object_pairs_hook=unique, parse_constant=invalid)
    except json.JSONDecodeError as error:
        raise GuardError('JSON_INVALID') from error


def root_guard(root, generation, hostname, uid, directory, control):
    require(hostname == 'srv2006836' and uid == 0 and UUID.fullmatch(generation) and
            root == '/opt/masarifi/customer-voice-operating-' + generation, 'ROOT_TARGET_REQUIRED')
    require(stat.S_ISDIR(directory.st_mode) and directory.st_uid == 0 and
            stat.S_IMODE(directory.st_mode) == 0o700, 'ROOT_DIRECTORY_700_REQUIRED')
    require(stat.S_ISREG(control.st_mode) and control.st_uid == 0 and
            stat.S_IMODE(control.st_mode) == 0o600, 'ROOT_CONTROL_600_REQUIRED')


class LocalHost:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.readiness_deadline = None
        self.closure_deadline = None
        self.closure_command_timeout = None

    def now(self):
        return time.time()

    def monotonic(self):
        return time.monotonic()

    def pause(self, seconds):
        time.sleep(seconds)

    def target(self, generation, incident=False):
        require(os.name == 'posix', 'ROOT_TARGET_REQUIRED')
        require(self.root.resolve() == self.root.absolute(), 'ROOT_SYMLINK_INVALID')
        control = self.root / ('runtime.json' if incident else 'packet.json')
        root_guard(str(self.root), generation, socket.gethostname(), os.getuid(), self.root.lstat(), control.lstat())
        if not incident:
            packet = self.read_json('packet.json')
            require(packet['generation'] == generation, 'ROOT_SCOPE_MISMATCH')
        else:
            require(self.read_json('runtime.json')['generation'] == generation, 'ROOT_SCOPE_MISMATCH')

    def pin(self, path, digest):
        target = pathlib.Path(path)
        require(not target.is_symlink() and target.resolve() == target.absolute() and
                target.is_file(), 'PIN_SYMLINK_INVALID')
        require(hashlib.sha256(target.read_bytes()).hexdigest() == digest, 'PIN_CHANGED')

    def read_json(self, name):
        require(pathlib.Path(name).name == name, 'CONTROL_PATH_INVALID')
        filename = self.root / name
        if name == 'runtime.json' and not filename.exists():
            return None
        require(not filename.is_symlink() and filename.resolve() == filename.absolute(), 'CONTROL_SYMLINK_INVALID')
        if name == 'runtime.json':
            metadata = filename.lstat()
            require(metadata.st_uid == 0 and stat.S_IMODE(metadata.st_mode) == 0o600, 'ROOT_CONTROL_600_REQUIRED')
        return parse_json(filename.read_text(encoding='utf-8'))

    def run(self, command, timeout=30, environment=None):
        if self.closure_deadline is not None:
            remaining = self.closure_deadline - self.monotonic()
            require(remaining > 0, 'OPERATING_CLOSURE_DEADLINE')
            timeout = min(timeout, remaining, self.closure_command_timeout or timeout)
        if self.readiness_deadline is not None:
            require(self.now() < self.readiness_deadline, 'OPERATING_READINESS_DEADLINE')
            timeout = min(timeout, self.readiness_deadline - self.now())
        guarded = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'DOCKER_HOST': 'unix:///var/run/docker.sock'}
        if command[:2] == ['docker', 'compose']:
            packet = self.read_json('packet.json')
            guarded.update(MASARIFI_BACKEND_REPOSITORY='ghcr.io/masarifiratibi-spec/masarifi-backend',
                           MASARIFI_BACKEND_DIGEST=packet['rollback']['imageDigest'],
                           MASARIFI_RELEASE_VERSION=packet['rollback']['sourceSha'])
        require(environment is None, 'UNCONTROLLED_COMMAND_ENVIRONMENT')
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, env=guarded)
        except subprocess.SubprocessError as error:
            raise GuardError('HOST_COMMAND_TIMEOUT') from error
        if completed.returncode != 0:
            try:
                diagnostic = parse_json(completed.stderr.strip())
                require(diagnostic.get('error') == 'OPERATING_DATABASE_FAILED' and
                        diagnostic.get('action') in ('status', 'prepare', 'activate', 'close', 'invalid') and
                        diagnostic.get('stage') in ('configuration', 'connection', 'transaction', 'migrations',
                                                  'ownership', 'admission', 'prepare', 'activate', 'close', 'status', 'commit') and
                        re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}|[0-9][A-Z0-9]{4}', diagnostic.get('code', '')),
                        'HOST_COMMAND_FAILED')
            except (GuardError, ValueError, TypeError, AttributeError):
                raise GuardError('HOST_COMMAND_FAILED') from None
            raise GuardError('_'.join(('OPERATING_DATABASE_FAILED', diagnostic['action'].upper(),
                                       diagnostic['stage'].upper(), diagnostic['code'])))
        return completed.stdout.strip()

    def inspect(self, identity):
        require(valid_hash(identity) or re.fullmatch(r'masarifi-staging-[a-z0-9-]+', identity), 'CONTAINER_ID_INVALID')
        containers = parse_json(self.run(['docker', 'inspect', identity]))
        require(isinstance(containers, list) and len(containers) == 1, 'CONTAINER_MISSING')
        return containers[0]

    def http(self, endpoint):
        paths = {'live': '/health/live', 'ready': '/health/ready', 'compatibility': '/health/compatibility'}
        require(endpoint in paths, 'HTTP_TARGET_INVALID')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        timeout = 3
        if self.readiness_deadline is not None:
            require(self.now() < self.readiness_deadline, 'OPERATING_READINESS_DEADLINE')
            timeout = min(timeout, self.readiness_deadline - self.now())
        with opener.open('http://127.0.0.1:3000' + paths[endpoint], timeout=timeout) as response:
            require(response.geturl() == 'http://127.0.0.1:3000' + paths[endpoint], 'HTTP_REDIRECT_INVALID')
            return parse_json(response.read(65537).decode('utf-8'))

    @contextlib.contextmanager
    def deployment_lock(self):
        import fcntl
        lock = os.open('/run/lock/masarifi-staging-deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            require(os.fstat(lock).st_uid == 0 and stat.S_ISREG(os.fstat(lock).st_mode), 'DEPLOYMENT_LOCK_INVALID')
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield
        finally:
            os.close(lock)

    def write_state(self, state, initial=False):
        self.target(state['generation'], incident=not initial)
        filename = self.root / 'runtime.json'
        encoded = (json.dumps(state, sort_keys=True) + '\n').encode('utf-8')
        if initial:
            descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
        else:
            import tempfile
            descriptor, temporary = tempfile.mkstemp(prefix='.runtime-', dir=self.root)
            try:
                os.fchmod(descriptor, 0o600)
                with os.fdopen(descriptor, 'wb') as output:
                    output.write(encoded)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, filename)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def write_unit(self, name, text):
        packet = self.read_json('packet.json')
        self.target(packet['generation'])
        require(name == unit_name(packet) and text == monitor_unit(packet, self), 'MONITOR_ARTIFACT_INVALID')
        filename = pathlib.Path('/etc/systemd/system') / name
        descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        return str(filename)

    def db(self, packet, action, state=None):
        if action == 'close':
            self.target(state['generation'], incident=True)
            require(self.read_json('runtime.json') == state, 'INCIDENT_JOURNAL_CHANGED')
            migration_hash, ca_hash = state['migrationEnvHash'], state['databaseCAHash']
        else:
            validate_packet(packet, self.now(), activation=action in ('prepare', 'activate'))
            self.target(packet['generation'])
            require(self.read_json('packet.json') == packet, 'PACKET_FILE_CHANGED')
            check_pins(packet, self)
            migration_hash, ca_hash = packet['rollback']['envHashes']['migration.env'], packet['rollback']['databaseCAHash']
        self.pin('/etc/masarifi/migration.env', migration_hash)
        self.pin('/etc/masarifi/supabase-ca.crt', ca_hash)
        role = 'close' if action == 'close' else 'control'
        with self.runner_lock(role):
            runner_id = retained_database_runner(self, state if action == 'close' else packet, role)
            self.pin('/etc/masarifi/migration.env', migration_hash)
            self.pin('/etc/masarifi/supabase-ca.crt', ca_hash)
            journal = self.read_runner(role)
            journal['phase'] = 'executing'
            self.write_runner(role, journal)
            try:
                result = parse_json(self.run(database_command(packet, action, state, runner_id), timeout=30))
                require(isinstance(result, dict), 'DATABASE_RECEIPT_INVALID')
            except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError):
                # A timed-out Docker client does not prove the exec process has
                # stopped. Preserve an uncertain journal and stop only the
                # already-checked exact runner ID. The separate close runner
                # and writer stop remain available without this lock/journal.
                previous_deadline = self.readiness_deadline
                self.readiness_deadline = None
                try:
                    self.run(['docker', 'stop', '--time', '1', runner_id], timeout=10)
                except (GuardError, RuntimeError, OSError):
                    pass
                finally:
                    self.readiness_deadline = previous_deadline
                raise
            journal['phase'] = 'idle'
            self.write_runner(role, journal)
        require(isinstance(result, dict), 'DATABASE_RECEIPT_INVALID')
        return result

    def database_environment(self, image, identity):
        values = dict(entry.split('=', 1) for entry in image.get('Config', {}).get('Env', []))
        content = pathlib.Path('/etc/masarifi/migration.env').read_bytes()
        pinned = identity['migrationEnvHash'] if 'migrationEnvHash' in identity else identity['rollback']['envHashes']['migration.env']
        require(hashlib.sha256(content).hexdigest() == pinned, 'DATABASE_ENV_PIN_CHANGED')
        entries = set()
        for line in content.decode('utf-8').splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            require('=' in line and not line.startswith((' ', '\t')), 'DATABASE_ENV_FILE_INVALID')
            key, value = line.split('=', 1)
            require(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) and key not in entries,
                    'DATABASE_ENV_FILE_INVALID')
            entries.add(key)
            values[key] = value
        values.update(MASARIFI_PROCESS_KIND='migration', MASARIFI_RELEASE_VERSION=identity['sourceSha'])
        require(not any(values.get(key) for key in ('NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH')) and
                not any(key in values for key in ('OPERATING_ACTION', 'OPERATING_CONTROL')),
                'DATABASE_ENV_UNSAFE')
        return values

    @contextlib.contextmanager
    def runner_lock(self, role):
        import fcntl
        require(role in ('control', 'close'), 'DATABASE_RUNNER_ROLE_INVALID')
        descriptor = os.open(self.root / ('.database-' + role + '.lock'),
                             os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            metadata = os.fstat(descriptor)
            require(metadata.st_uid == 0 and stat.S_ISREG(metadata.st_mode) and
                    stat.S_IMODE(metadata.st_mode) == 0o600, 'DATABASE_RUNNER_LOCK_INVALID')
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise GuardError('DATABASE_RUNNER_BUSY') from None
            yield
        finally:
            os.close(descriptor)

    def read_runner(self, role):
        require(role in ('control', 'close'), 'DATABASE_RUNNER_ROLE_INVALID')
        filename = self.root / ('database-' + role + '.json')
        if not filename.exists():
            require(not filename.is_symlink(), 'DATABASE_RUNNER_JOURNAL_INVALID')
            return None
        metadata = filename.lstat()
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0 and
                stat.S_IMODE(metadata.st_mode) == 0o600, 'DATABASE_RUNNER_JOURNAL_INVALID')
        return self.read_json(filename.name)

    def write_runner(self, role, journal, initial=False):
        import tempfile
        require(role in ('control', 'close'), 'DATABASE_RUNNER_ROLE_INVALID')
        filename = self.root / ('database-' + role + '.json')
        encoded = (json.dumps(journal, sort_keys=True) + '\n').encode('utf-8')
        if initial:
            descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
        else:
            require(self.read_runner(role) is not None, 'DATABASE_RUNNER_JOURNAL_MISSING')
            descriptor, temporary = tempfile.mkstemp(prefix='.database-' + role + '-', dir=self.root)
            try:
                os.fchmod(descriptor, 0o600)
                with os.fdopen(descriptor, 'wb') as output:
                    output.write(encoded)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, filename)
            finally:
                if os.path.exists(temporary): os.unlink(temporary)
        directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def stop_database_runners(self, state):
        failures = []
        for role in ('control', 'close'):
            try:
                journal = self.read_runner(role)
                if journal is None:
                    continue
                require(isinstance(journal, dict), 'DATABASE_RUNNER_JOURNAL_CHANGED')
                command = database_runner_command(state, role)
                require(journal.get('name') == command[command.index('--name') + 1] and
                        journal.get('scope') == scope_name(state) and journal.get('role') == role and
                        journal.get('image') == IMAGE_PREFIX + state['imageDigest'] and
                        journal.get('commandHash') == canonical_hash(command), 'DATABASE_RUNNER_JOURNAL_CHANGED')
                runner = checked_database_runner(self, journal)
                if runner['State']['Running']:
                    self.run(['docker', 'stop', '--time', '1', runner['Id']], timeout=10)
                require(self.inspect(runner['Id'])['State']['Running'] is False, 'DATABASE_RUNNER_STOP_UNCONFIRMED')
            except (GuardError, RuntimeError, OSError, KeyError, ValueError, TypeError):
                failures.append(role)
        require(not failures, 'DATABASE_RUNNER_STOP_UNCONFIRMED')


def main():
    arguments = sys.argv[1:]
    require(arguments, 'COMMAND_REQUIRED')
    action = arguments[0]
    if arguments == ['intent']:
        result = intent()
    elif action == 'validate' and len(arguments) == 2:
        packet = parse_json(pathlib.Path(arguments[1]).read_text(encoding='utf-8'))
        validate_packet(packet, time.time())
        result = {'status': 'packet-valid', 'packetHash': packet_hash(packet), 'hostVerified': False}
    else:
        require(len(arguments) == 1 and action in ('preflight', 'dry-run', 'apply', 'status', 'monitor', 'close',
                                                 'restoration-intent', 'restore'), 'COMMAND_INVALID')
        host = LocalHost(pathlib.Path(__file__).resolve().parent)
        if action == 'close':
            result = incident_close(host)
        elif action == 'monitor':
            result = resume_monitor(host)
        else:
            packet = host.read_json('packet.json')
            validate_packet(packet, host.now(), activation=action in ('apply', 'preflight', 'dry-run'))
            host.target(packet['generation'])
            if action in ('preflight', 'dry-run'):
                result = preflight(packet, host)
            elif action == 'apply':
                result = apply(packet, host)
            elif action == 'status':
                result = status(packet, host)
            elif action == 'restoration-intent':
                result = restoration_intent(packet, host.read_json('runtime.json'))
            else:
                result = restore(packet, host, host.read_json('restoration-approval.json'))
    print(json.dumps(result, sort_keys=True))
    return 1 if result.get('blockers') and action in ('close', 'monitor') else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (GuardError, OSError, KeyError, ValueError, TypeError) as error:
        print(json.dumps({'error': str(error) if isinstance(error, GuardError) else 'CONTROL_EXECUTION_FAILED'}))
        sys.exit(1)
