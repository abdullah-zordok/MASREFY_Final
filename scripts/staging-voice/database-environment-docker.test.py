"""Disposable Linux Docker qualification; synthetic credentials, no network or starts."""
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest
import uuid
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('operating', pathlib.Path(__file__).with_name('customer-operating-cohort.py'))
operating = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operating)


class PrivateEnvironment(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='masarifi-synthetic-env-')
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.host = operating.LocalHost(self.root)
        self.identity = {'generation': str(uuid.uuid4()), 'sourceSha': 'a' * 40, 'imageDigest': 'b' * 64}
        self.values = {'MASARIFI_PROCESS_KIND': 'migration', 'MASARIFI_RELEASE_VERSION': 'a' * 40,
                       'DATABASE_URL': 'synthetic://not-a-database/a=b', 'PATH': '/bin'}
        # Replace only the live-host gate, retaining real Linux file operations.
        self.target = patch.object(self.host, 'target')
        self.target.start()
        self.addCleanup(self.target.stop)

    def prepare(self):
        self.host.prepare_database_environment(self.identity, 'control', self.values)
        return self.root / 'database-control.env'

    def test_private_file_is_exact_and_reuse_does_not_rewrite(self):
        path = self.prepare()
        metadata = path.stat()
        self.assertEqual(stat.S_IMODE(metadata.st_mode), 0o600)
        self.assertEqual(metadata.st_uid, 0)
        self.assertEqual(path.read_bytes(), operating.database_environment_bytes(self.values))
        self.prepare()
        self.assertEqual(path.stat().st_mtime_ns, metadata.st_mtime_ns)
        self.assertEqual(path.stat().st_ino, metadata.st_ino)

    def test_changed_or_partial_file_is_preserved_and_refused(self):
        path = self.prepare()
        for content in (b'', b'DATABASE_URL=foreign\n'):
            path.write_bytes(content)
            with self.assertRaisesRegex(operating.GuardError, '^DATABASE_DERIVED_ENV_CHANGED$'):
                self.prepare()
            self.assertEqual(path.read_bytes(), content)

    def test_symlink_hardlink_wrong_mode_and_fifo_are_refused(self):
        path = self.root / 'database-control.env'
        other = self.root / 'other'
        other.write_bytes(operating.database_environment_bytes(self.values))
        other.chmod(0o600)
        path.symlink_to(other)
        with self.assertRaises(OSError): self.prepare()
        path.unlink()
        os.link(other, path)
        with self.assertRaisesRegex(operating.GuardError, '^DATABASE_DERIVED_ENV_INVALID$'): self.prepare()
        path.unlink()
        path.write_bytes(other.read_bytes())
        path.chmod(0o644)
        with self.assertRaisesRegex(operating.GuardError, '^DATABASE_DERIVED_ENV_INVALID$'): self.prepare()
        path.unlink()
        os.mkfifo(path, 0o600)
        with self.assertRaisesRegex(operating.GuardError, '^DATABASE_DERIVED_ENV_INVALID$'): self.prepare()
        self.assertEqual(other.read_bytes(), operating.database_environment_bytes(self.values))

    def test_real_docker_preserves_old_duplicates_and_accepts_unique_construction(self):
        def docker(*args):
            result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, 'Disposable Docker operation failed: ' + args[0])
            return result.stdout.strip()
        tag = 'masarifi-synthetic-env:' + uuid.uuid4().hex
        (self.root / 'Dockerfile').write_text('FROM scratch\nENV PATH=/bin MASARIFI_PROCESS_KIND=api MASARIFI_RELEASE_VERSION=old\n')
        docker('build', '--network=none', '-t', tag, str(self.root))
        self.addCleanup(lambda: docker('image', 'rm', tag))
        original = self.root / 'migration.env'
        original.write_text('MASARIFI_PROCESS_KIND=migration\nMASARIFI_RELEASE_VERSION=old\nDATABASE_URL=synthetic://not-a-database/a=b\n')
        original.chmod(0o600)
        original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
        old_id = docker('create', '--network=none', '--env-file', str(original),
                        '-e', 'MASARIFI_PROCESS_KIND=migration', '-e', 'MASARIFI_RELEASE_VERSION=' + 'a' * 40, tag, '/never-start')
        self.addCleanup(lambda: docker('rm', old_id))
        old = json.loads(docker('inspect', old_id))[0]
        self.assertGreater(len(old['Config']['Env']), len(operating.environment(old)))
        self.assertEqual(old['State']['Status'], 'created')
        derived = self.prepare()
        command = operating.database_runner_command(self.identity, 'control')
        args = command[:command.index(operating.IMAGE_PREFIX + self.identity['imageDigest'])]
        env_args = []
        for index, arg in enumerate(args):
            if arg in ('--env-file', '-e'):
                env_args.extend([arg, str(derived) if arg == '--env-file' else args[index + 1]])
        new_id = docker('create', '--network=none', *env_args, tag, '/never-start')
        self.addCleanup(lambda: docker('rm', new_id))
        new = json.loads(docker('inspect', new_id))[0]
        self.assertEqual(len(new['Config']['Env']), len(operating.environment(new)))
        self.assertEqual(operating.environment(new), self.values)
        self.assertEqual(new['State']['Status'], 'created')
        self.assertFalse(new['State']['Running'])
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), original_hash)


if __name__ == '__main__':
    if os.name != 'posix' or os.getuid() != 0 or not shutil.which('docker'):
        raise SystemExit('Requires disposable Linux CI as root with Docker; never run on Staging.')
    unittest.main()
