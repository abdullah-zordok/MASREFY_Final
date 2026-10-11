"""Real pinned migrations through the production RAM-only SQLCipher reader.

Only fresh public synthetic databases are created. No application path/key is
accepted; every read must leave the fixture bytes and directory unchanged.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys


def helper(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expected_rows(path):
    return [[None if value == "-" else base64.b64decode(value, validate=True).decode("utf-8")
             for value in line.split("\t")] for line in path.read_text(encoding="utf-8").splitlines()]


def retained_hashes(root):
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.iterdir() if path.is_file()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reader-library", required=True)
    parser.add_argument("--sqlcipher-library", required=True)
    parser.add_argument("--classes", required=True)
    parser.add_argument("--java", default="java")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    schemas = helper("schema_fixtures", "schema-fixtures.py")
    native = helper("memory_fixture", "memory-vfs-fixtures.py")
    cipher_fixture = helper("cipher_fixture", "real-wal-fixtures.py")
    reference = args.output / "reference"
    subprocess.run([sys.executable, str(Path(__file__).with_name("schema-fixtures.py")),
                    "--output", str(reference)], check=True)
    source = schemas.pinned_source()
    migrations = schemas.migration_sql(source)
    history, marker = schemas.schema_parts(source)
    reader_library = native.ReaderLibrary(args.reader_library)
    cipher_library = cipher_fixture.library_api(args.sqlcipher_library)
    checks = 0

    def check(condition, reason):
        nonlocal checks
        if not condition: raise AssertionError(reason)
        checks += 1

    for engine in ("plain", "cipher"):
        root = args.output / engine
        root.mkdir()
        key = bytes.fromhex("01" * 32) if engine == "cipher" else b""

        def write(path, statements):
            connection = cipher_fixture.CipherConnection(cipher_library, path) if key else sqlite3.connect(path)
            try:
                for statement in statements:
                    if key: connection.execute(statement)
                    else: connection.executescript(statement)
                if not key: connection.commit()
            finally:
                connection.close()

        def qualify(path, name, versions, async_storage=False):
            baseline = retained_hashes(root)
            snapshot = path.read_bytes()
            if key: check(not snapshot.startswith(b"SQLite format 3"), "encrypted schema fixture required")
            with reader_library.open(snapshot, key) as reader:
                status, rows = reader.rows(0)
                check(status == 0 and rows == expected_rows(reference / (name + ".rows")),
                      "production reader schema differs from real migration fixture")
                # Enum 5 must read the header version through the authorizer;
                # no dynamic SQL or writable PRAGMA is exposed to callers.
                status, header = reader.rows(5)
                check(status == 0 and header == [[1 if async_storage else 0]],
                      "production user_version query missing or incorrect")
                if not async_storage:
                    status, actual_versions = reader.rows(1)
                    check(status == 0 and actual_versions == [[version] for version in versions],
                          "production reader migration history incomplete")
                    for query, minimum in ((2, 15), (3, 14)):
                        status, pending = reader.rows(query)
                        check((status == 0 and pending == []) if len(versions) >= minimum else status != 0,
                              "missing Voice table must not be reported empty")
                else:
                    status, legacy = reader.rows(4)
                    check(status == 0 and legacy == [], "known empty legacy store must be read")
            check(retained_hashes(root) == baseline, "reader modified or added fixture files")
            schemas.retain_rows(root / name, rows, versions)

        # Same real migrations, all prefixes and optional Android/legacy objects.
        for version in range(1, 16):
            path = root / ("prefix-" + str(version) + ".db")
            statements = [history]
            for applied in range(1, version + 1):
                statements += [migrations[applied], "INSERT INTO schema_migrations VALUES(" + str(applied) + ",0)"]
            write(path, statements)
            versions = list(range(1, version + 1))
            qualify(path, "prefix-" + str(version), versions)
            write(path, [marker])
            qualify(path, "marked-" + str(version), versions)
            write(path, ["CREATE TABLE android_metadata (locale TEXT)"])
            qualify(path, "metadata-" + str(version), versions)
        for metadata in (False, True):
            name = "async-meta" if metadata else "async"
            path = root / (name + ".db")
            statements = ["CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                          "PRAGMA user_version=1"]
            if metadata: statements += ["CREATE TABLE android_metadata (locale TEXT)"]
            write(path, statements)
            qualify(path, name, [1], True)
        subprocess.run([args.java, "-cp", args.classes,
                        "com.masarifi.voicequalification.VoiceDatabaseSchemaTest", str(root)], check=True)
    print(json.dumps({"result": "PASS", "checks": checks, "engines": ["SQLite", "pinned Expo SQLCipher"],
                      "retainedSyntheticFixtures": str(args.output), "applicationDataAccessed": False}))


if __name__ == "__main__": main()
