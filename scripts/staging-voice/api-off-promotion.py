"""Approval-bound API ingress promotion with retained-container rollback."""
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import stat
import sys

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('qualified_api', HERE / 'api-off-qualification.py')
api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(api)
op, off = api.op, api.off
require, GuardError = op.require, op.GuardError
SITE = pathlib.Path('/etc/nginx/sites-available/masarifi-staging')
PUBLIC = 'https://api.staging.masarifiratibi.com'


def promoted_config(before):
    old = b'proxy_pass http://127.0.0.1:3000;'
    require(before.count(old) == 2 and b'proxy_pass http://[::1]:3001;' in before,
            'EXACT_API_AND_ADMIN_ROUTES_REQUIRED')
    return before.replace(old, b'proxy_pass http://127.0.0.1:3001;')


def validate(packet, now):
    require(packet.get('version') == 1 and packet.get('kind') == 'posting-off-api-promotion' and
            packet.get('host') == 'srv2006836' and packet.get('project') == op.PROJECT and
            op.UUID.fullmatch(packet.get('generation', '')), 'STAGING_PROMOTION_REQUIRED')
    require(packet.get('financialAuthority') is None and packet.get('deviceAuthority') is None and
            packet.get('candidateRestartPolicy') == 'unless-stopped', 'OFF_ONLY_AUTHORITY_REQUIRED')
    require(op.SHA.fullmatch(packet.get('sourceSha', '')) and op.valid_hash(packet.get('imageDigest')) and
            op.valid_hash(packet.get('candidateID')), 'EXACT_CANDIDATE_REQUIRED')
    approval = packet.get('approval') or {}
    require(approval.get('kind') == 'direct-human-posting-off-promotion-approval' and
            approval.get('packetHash') == api.packet_hash(packet) and
            isinstance(approval.get('verbatimMessage'), str) and 1 <= len(approval['verbatimMessage'].strip()) <= 4096 and
            isinstance(approval.get('messageReference'), str) and 8 <= len(approval['messageReference']) <= 256,
            'DIRECT_PROMOTION_APPROVAL_REQUIRED')
    received, expires = op.instant(approval.get('receivedAt')), op.instant(packet.get('expiresAt'))
    require(received <= now < expires <= received + 3600, 'FRESH_PROMOTION_APPROVAL_REQUIRED')
    off.validate_cohort(packet['cohort'], now)
    off.checked_snapshot(packet['baseline'], packet)
    require(packet['requiredMigrations'] == op.MIGRATIONS, 'MIGRATION_PINS_REQUIRED')


def promote(packet, host):
    host.preflight(packet)
    host.prepare(packet)
    try:
        host.start(packet)
        host.ready(packet)
        host.switch(packet)
        host.verify(packet)
        host.commit(packet)
    except BaseException:
        host.rollback()
        raise
    return {'promoted': True, 'postingOff': True, 'originalApiRetainedRunning': True}


class Host(api.Host):
    def candidate(self, packet, policies):
        state = self.read_json('qualification-runtime.json')
        require(state['id'] == packet['candidateID'] and state['sourceSha'] == packet['sourceSha'] and
                state['imageDigest'] == packet['imageDigest'] and state['phase'] == 'closed', 'QUALIFIED_IDENTITY_REQUIRED')
        c = self.inspect(state['id'])
        policy = c['HostConfig']['RestartPolicy']
        require(policy in [{'Name': name, 'MaximumRetryCount': 0} for name in policies], 'CANDIDATE_RESTART_POLICY_CHANGED')
        normalized = copy.deepcopy(c)
        normalized['HostConfig']['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
        adapter = type('CandidateInspect', (), {'inspect': lambda _self, identity: normalized})()
        api.checked_candidate(adapter, state)
        return c

    def routing(self, packet, promoted=False):
        before = (self.root / 'nginx-original.conf').read_bytes()
        after = (self.root / 'nginx-promoted.conf').read_bytes()
        require(after == promoted_config(before), 'ROUTE_DIFF_CHANGED')
        require(SITE.is_file() and not SITE.is_symlink() and SITE.resolve() == SITE and
                SITE.stat().st_uid == 0 and SITE.stat().st_gid == 0 and SITE.stat().st_nlink == 1 and
                stat.S_IMODE(SITE.stat().st_mode) == 0o644, 'PROTECTED_ROUTE_REQUIRED')
        require(SITE.read_bytes() == (after if promoted else before), 'CURRENT_ROUTE_CHANGED')
        active = self.run(['nginx', '-T'])
        paths = [line[len('# configuration file '):].rstrip(':') for line in active.splitlines()
                 if line.startswith('# configuration file ')]
        require(set(paths) == {e['path'] for e in packet['routing']}, 'NGINX_INCLUDE_SET_CHANGED')
        for entry in packet['routing']:
            require(str(pathlib.Path(entry['path']).resolve()) == entry['resolved'], 'NGINX_LINK_CHANGED')
            if entry['resolved'] != str(SITE): self.pin(entry['resolved'], entry['sha256'])

    def pins(self, packet):
        validate(packet, self.now())
        self.target(packet['generation'])
        require(self.read_json('packet.json') == packet, 'PACKET_CHANGED')
        required = {'api-off-promotion.py', 'api-off-qualification.py', 'customer-operating-cohort.py',
                    'off-monitor-rehearsal.py', 'qualification-runtime.json', 'qualification-result.json',
                    'nginx-original.conf', 'nginx-promoted.conf', 'backup-restore.json'}
        require(required.issubset(packet['files']), 'PROMOTION_ARTIFACTS_REQUIRED')
        for name, digest in packet['files'].items():
            require(pathlib.Path(name).name == name, 'ARTIFACT_PATH_INVALID')
            self.pin(self.root / name, digest)
        receipt = self.read_json('qualification-result.json')
        require(receipt['result'] == 'PASS' and receipt['attempts'] == 1 and receipt['candidate']['id'] == packet['candidateID'] and
                receipt['candidateStopped'] and receipt['postingOff'] and receipt['financialAndHistoricalBaselineUnchanged'],
                'ACTUAL_QUALIFICATION_REQUIRED')
        for entry in packet['cohort']['composeFiles']: self.pin(entry['path'], entry['sha256'])
        for name, digest in packet['cohort']['envHashes'].items(): self.pin('/etc/masarifi/' + name, digest)
        self.pin('/etc/masarifi/supabase-ca.crt', packet['cohort']['databaseCAHash'])
        proof = self.read_json('backup-restore.json')
        require(packet['files']['backup-restore.json'] == packet['cohort']['backupRestoreReceiptHash'] and
                proof['restoreVerified'] and proof['backupDigest'] == packet['cohort']['backupDigest'] and
                proof['financialFingerprints'] == packet['baseline']['fingerprints'] and
                proof['requiredMigrations'] == packet['requiredMigrations'] and
                proof['cohortHash'] == op.canonical_hash({k: v for k, v in packet['cohort'].items()
                    if k not in ('backupDigest', 'backupRestoreReceiptHash')}) and
                0 <= self.now() - op.instant(proof['observedAt']) <= 900, 'FRESH_RESTORE_REQUIRED')

    def preserved(self, packet, running):
        for entry in packet['cohort']['services']:
            c = op.checked_cohort(self, entry['name'], entry['service'], entry['id'], entry['sourceSha'],
                                  op.IMAGE_PREFIX + entry['imageDigest'], off.SERVICES[entry['name']][1])
            require(off.configuration_hash(c) == entry['configurationHash'], 'ORIGINAL_SERVICE_CHANGED')
        for all_containers, key in [(True, 'containerIDs'), (False, 'runningIDs')]:
            actual = self.run(['docker', 'ps'] + (['-a'] if all_containers else []) + ['--no-trunc', '--format', '{{.ID}}']).splitlines()
            expected = set(packet['cohort'][key]) | ({packet['candidateID']} if running and not all_containers else set())
            require(set(actual) == expected, 'INVENTORY_CHANGED')

    def authorize(self, packet):
        require(self.read_json('packet.json') == packet and
                self.read_json('runtime.json')['packetHash'] == api.packet_hash(packet), 'APPROVAL_BINDING_CHANGED')
        validate(packet, self.now())

    def preflight(self, packet):
        self.pins(packet)
        require(self.read_json('runtime.json') is None, 'GENERATION_CONSUMED')
        require(self.candidate(packet, ['no'])['State']['Running'] is False, 'STOPPED_QUALIFIED_CANDIDATE_REQUIRED')
        self.preserved(packet, False); self.routing(packet); self.snapshot(packet)

    def prepare(self, packet):
        self.write_state({'version': 1, 'kind': 'posting-off-api-promotion', 'generation': packet['generation'],
                          'packetHash': api.packet_hash(packet), 'phase': 'prepared'}, initial=True)

    def phase(self, value):
        state = self.read_json('runtime.json'); state['phase'] = value; self.write_state(state)

    def start(self, packet):
        c = self.candidate(packet, ['no'])
        require(c['State']['Running'] is False, 'CANDIDATE_ALREADY_RUNNING')
        self.phase('starting'); self.authorize(packet)
        self.run(['docker', 'update', '--restart', 'unless-stopped', packet['candidateID']])
        self.candidate(packet, ['unless-stopped']); self.authorize(packet)
        self.run(['docker', 'start', packet['candidateID']])

    def ready(self, packet):
        host = self
        class Probe:
            def pins(self, value): host.pins(value)
            def read_json(self, name): return host.read_json('qualification-runtime.json')
            def inspect(self, identity):
                value = copy.deepcopy(host.candidate(packet, ['unless-stopped']))
                value['HostConfig']['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
                return value
            def pause(self, seconds): host.pause(seconds)
        api.Host.verify(Probe(), packet)

    def replace_route(self, desired, expected):
        require(SITE.read_bytes() == expected and not SITE.is_symlink(), 'ROUTE_OWNERSHIP_CHANGED')
        tmp = SITE.with_name('.masarifi-' + self.read_json('runtime.json')['generation'] + '.tmp')
        with tmp.open('xb') as stream:
            stream.write(desired); stream.flush(); os.fsync(stream.fileno())
        tmp.chmod(0o644)
        os.replace(tmp, SITE)

    def switch(self, packet):
        self.pins(packet); self.routing(packet); self.preserved(packet, True); self.snapshot(packet)
        self.phase('switching'); self.authorize(packet)
        self.replace_route((self.root / 'nginx-promoted.conf').read_bytes(), (self.root / 'nginx-original.conf').read_bytes())
        self.run(['nginx', '-t']); self.authorize(packet); self.run(['systemctl', 'reload', 'nginx'])

    def public_health(self, source):
        for endpoint in ['live', 'compatibility']:
            value = op.parse_json(self.run(['curl', '--noproxy', '*', '--fail', '--silent', '--show-error',
                                           '--max-time', '10', PUBLIC + '/health/' + endpoint]))
            require(value == {'schemaVersion': 1, 'contracts': op.CONTRACTS} if endpoint == 'compatibility' else
                    value.get('status') == 'ok' and value.get('version') == source, 'PUBLIC_API_CONTRACT_CHANGED')
        code = self.run(['curl', '--noproxy', '*', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}',
                         '--max-time', '10', PUBLIC + '/health/ready'])
        require(code == '404', 'READINESS_PRIVACY_CHANGED')

    def verify(self, packet):
        self.ready(packet); self.routing(packet, True); self.public_health(packet['sourceSha'])
        self.preserved(packet, True); self.snapshot(packet)

    def commit(self, packet):
        self.authorize(packet); self.phase('committed')

    def rollback(self):
        state = self.read_json('runtime.json')
        require(state and state['kind'] == 'posting-off-api-promotion', 'OWNED_PROMOTION_REQUIRED')
        self.target(state['generation'], incident=True)
        if state['phase'] == 'committed': return
        packet = self.read_json('packet.json')
        require(api.packet_hash(packet) == state['packetHash'], 'ROLLBACK_PACKET_CHANGED')
        for name in ['qualification-runtime.json', 'nginx-original.conf', 'nginx-promoted.conf']:
            self.pin(self.root / name, packet['files'][name])
        self.candidate(packet, ['no', 'unless-stopped'])
        before = (self.root / 'nginx-original.conf').read_bytes()
        after = (self.root / 'nginx-promoted.conf').read_bytes()
        require(after == promoted_config(before), 'ROLLBACK_ROUTE_DIFF_CHANGED')
        if SITE.read_bytes() == after: self.replace_route(before, after)
        require(SITE.read_bytes() == before, 'ROLLBACK_ROUTE_OWNERSHIP_UNCONFIRMED')
        self.run(['nginx', '-t']); self.run(['systemctl', 'reload', 'nginx'])
        original = next(e for e in packet['cohort']['services'] if e['service'] == 'api')
        self.public_health(original['sourceSha'])
        self.run(['docker', 'update', '--restart', 'no', packet['candidateID']])
        c = self.candidate(packet, ['no'])
        if c['State']['Running']: self.run(['docker', 'stop', '--time', '10', packet['candidateID']], timeout=25)
        require(self.candidate(packet, ['no'])['State']['Running'] is False, 'ROLLBACK_STOP_UNCONFIRMED')
        self.preserved(packet, False); self.snapshot(packet); self.phase('rolled-back')


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ('promote', 'rollback'), 'COMMAND_INVALID')
    host = Host(HERE)
    if sys.argv[1] == 'rollback': host.rollback(); return
    def interrupted(_signal, _frame): raise GuardError('PROMOTION_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    with host.deployment_lock(): result = promote(host.read_json('packet.json'), host)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try: main()
    except (RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        print(json.dumps({'error': op.safe_reason(error)})); sys.exit(1)
