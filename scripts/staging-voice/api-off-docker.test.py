"""Disposable GitHub Linux runner only; synthetic API configuration."""
import copy
import importlib.util
import json
import os
import pathlib
import shutil
import socket
import subprocess
import unittest
import uuid

SPEC = importlib.util.spec_from_file_location('isolated_api', pathlib.Path(__file__).with_name('api-off-qualification.py'))
api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(api)
IMAGE = 'ghcr.io/masarifiratibi-spec/masarifi-backend@sha256:8ee5100f2f9de7b5930867eb7cf901c94344452ba8a3ed62954223bbc8fb2bab'
SOURCE = '093b5d0c42f3d68eb2de619aff94b44fbf088a02'


class DockerQualification(unittest.TestCase):
    def docker(self, *args):
        r = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, 'Synthetic Docker operation failed: ' + args[0])
        return r.stdout.strip()

    def test_actual_creation_guards_tampering_and_terminal_cleanup(self):
        self.docker('pull', IMAGE)
        image = json.loads(self.docker('image', 'inspect', IMAGE))[0]
        self.assertEqual(image['Config']['Labels']['org.opencontainers.image.revision'], SOURCE)
        generation = str(uuid.uuid4())
        root = pathlib.Path('/opt/masarifi/customer-voice-operating-' + generation)
        root.mkdir(parents=True, mode=0o700, exist_ok=False)
        self.addCleanup(lambda: shutil.rmtree(root))
        ca = pathlib.Path('/etc/masarifi/supabase-ca.crt')
        self.assertFalse(ca.exists())
        ca.parent.mkdir(exist_ok=True)
        ca.write_text('synthetic certificate fixture; never connects to a database\n')
        self.addCleanup(ca.unlink)
        network = self.docker('network', 'create', api.op.NETWORK)
        self.addCleanup(lambda: self.docker('network', 'rm', network))
        values = dict(v.split('=', 1) for v in image['Config'].get('Env', []))
        values.update(MASARIFI_PROCESS_KIND='api', MASARIFI_RELEASE_VERSION=SOURCE,
                      MASARIFI_VOICE_ANALYSIS_ONLY='true', SUPABASE_URL='https://' + api.op.PROJECT + '.supabase.co')
        (root/'database-control.env').write_bytes(api.op.database_environment_bytes(values))
        (root/'database-control.env').chmod(0o600)
        packet = {'generation': generation, 'sourceSha': SOURCE, 'imageDigest': IMAGE.split('@sha256:')[1]}
        (root/'packet.json').write_text(json.dumps(packet)); (root/'packet.json').chmod(0o600)
        identity = self.docker(*api.create_command(packet)[1:])
        self.addCleanup(lambda: self.docker('rm', '-f', identity))
        state = {**packet, 'version': 1, 'kind': 'posting-off-isolated-api', 'imageID': image['Id'],
                 'environmentHash': api.op.canonical_hash(values), 'id': identity, 'phase': 'created'}
        (root/'runtime.json').write_text(json.dumps(state)); (root/'runtime.json').chmod(0o600)
        host = api.Host(root)
        # Only the physical-host gate is substituted; Docker, state and file I/O are real.
        def target(found, incident=False):
            self.assertEqual(found, generation)
            self.assertEqual(root.stat().st_uid, 0)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
        host.target = target
        # Authorization is tested separately; this fixture tests actual Docker identity and cleanup.
        host.authorize_mutation = lambda packet: None
        original = api.checked_candidate(host, state)
        self.assertEqual(original['State']['Status'], 'created')
        for change in ['environment', 'port', 'alias', 'identity', 'mount']:
            altered = copy.deepcopy(original)
            if change == 'environment': altered['Config']['Env'].append(altered['Config']['Env'][0])
            if change == 'port': altered['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp'] = '0.0.0.0'
            if change == 'alias': altered['NetworkSettings']['Networks'][api.op.NETWORK]['Aliases'] = ['api']
            if change == 'identity': altered['Id'] = 'a' * 64
            if change == 'mount': altered['Mounts'].append({'Type': 'volume', 'Destination': '/other'})
            with self.subTest(change=change), self.assertRaises(api.GuardError):
                api.checked_candidate(type('InspectOnly', (), {'inspect': lambda self, identity: altered})(), state)
        # Missing synthetic configuration must fail closed; no real credentials exist.
        host.start()
        try:
            with self.assertRaises(api.GuardError): host.start()
        finally:
            host.cleanup()
        self.assertFalse(api.checked_candidate(host, host.read_json('runtime.json'))['State']['Running'])
        self.assertEqual(host.read_json('runtime.json')['phase'], 'closed')
        host.cleanup()
        self.assertEqual(host.read_json('runtime.json')['id'], identity)


if __name__ == '__main__':
    if os.name != 'posix' or os.getuid() != 0 or os.environ.get('GITHUB_ACTIONS') != 'true' or socket.gethostname() == 'srv2006836':
        raise SystemExit('Disposable GitHub Linux runner required; never run against Staging.')
    unittest.main()
