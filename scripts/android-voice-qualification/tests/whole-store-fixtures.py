"""Pinned full schemas + encrypted committed WAL + all phases through real JNI.

Only a fresh synthetic output is accepted. No private application directory,
real owner/key or device is an input. Retain every fixture and its expected result.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess

A, B = "a" * 64, "b" * 64
ID = "11111111-1111-4111-8111-111111111111"

def helper(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def quote(value):
    return "'" + value.replace("'", "''") + "'"

def batch(phase, audio=None):
    return dict(id=ID, revision=2, phase=phase, audioReference=audio, locale="ar", durationMs=1000,
                recordedAt=0, timezoneOffsetMinutes=0, createBody=None, sessionId=None, version=None, processBody=None)

def singleton(phase, audio=None, confirmation=None):
    return dict(attemptId=ID, revision=2, phase=phase, createKey=ID, processKey=ID, cancelKey=ID,
                createBody=None, sessionId=None, sessionVersion=None, processBody=None, proposalId=None,
                proposalVersion=None, confirmationKey=None, confirmationBody=confirmation,
                transactionId=ID if phase == "saved" else None, audioReference=audio, createdAt=0)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sqlcipher-library", required=True)
    parser.add_argument("--jni-library")
    parser.add_argument("--classes")
    parser.add_argument("--java", default="java")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    schemas = helper("whole_schema", "schema-fixtures.py")
    cipher = helper("whole_cipher", "real-wal-fixtures.py")
    library = cipher.library_api(args.sqlcipher_library)
    source = schemas.pinned_source()
    migrations = schemas.migration_sql(source)
    history, marker = schemas.schema_parts(source)
    cases = []

    def case(name, verdict="CLEAR", pending=0, terminal=0, audio=0, confirmation=0, owners=(A,), claim=None, key="valid"):
        root = args.output / name
        root.mkdir()
        (root / "input/files/SQLite").mkdir(parents=True)
        expected = dict(verdict=verdict, pending=pending, terminal=terminal, audioOwned=audio,
                        confirmationOwned=confirmation, owners=list(owners), claim=claim, keyMode=key, wal=False)
        cases.append((root, expected))
        return root, expected

    def database(root, owner=A, statements=(), version=15, wal=False, legacy=False, marked=False):
        path = root / "input/files/SQLite" / ("masarifi.db" if legacy else "masarifi-" + owner[:24] + ".db")
        writer = sqlite3.connect(path) if legacy else cipher.CipherConnection(library, path)
        def execute(sql):
            if legacy: writer.executescript(sql)
            else: writer.execute(sql)
        try:
            execute(history)
            for applied in range(1, version + 1):
                execute(migrations[applied])
                execute("INSERT INTO schema_migrations VALUES(" + str(applied) + ",0)")
            if marked:
                execute(marker)
                execute("INSERT INTO _masarifi_migration_state VALUES('legacy-export-owner'," + quote(owner) + ")")
            if wal:
                execute("PRAGMA journal_mode=WAL")
                execute("PRAGMA wal_autocheckpoint=0")
                execute("PRAGMA wal_checkpoint(TRUNCATE)")
            for statement in statements: execute(statement)
            if legacy: writer.commit()
            if wal:
                # Copy while writer is open; close would checkpoint the fixture.
                captured = path.read_bytes()
                committed = Path(str(path) + "-wal").read_bytes()
        finally:
            writer.close()
        if wal:
            path.write_bytes(captured)
            Path(str(path) + "-wal").write_bytes(committed)

    def batch_sql(payload):
        return "INSERT INTO voice_batch_operations(id,revision,payload) VALUES(" + quote(ID) + ",2," + quote(json.dumps(payload, ensure_ascii=False)) + ")"

    def single_sql(payload):
        return "INSERT INTO voice_operation_journal(id,attempt_id,revision,payload) VALUES('singleton'," + quote(ID) + ",2," + quote(json.dumps(payload, ensure_ascii=False)) + ")"

    root, want = case("empty-two-owners", owners=(A, B)); database(root); database(root, B)
    for phase in ("captured", "created", "uploaded", "processing", "cancel_requested", "completed", "cancelled", "failed"):
        terminal = phase in ("completed", "cancelled", "failed")
        root, want = case("batch-" + phase, "CLEAR" if terminal else "BLOCKED", pending=int(not terminal), terminal=int(terminal))
        database(root, statements=[batch_sql(batch(phase))])
    for phase in ("captured", "creating", "created", "uploaded", "processing", "reviewing", "confirming", "confirmation_unknown", "saved", "cancel_requested", "cancelled", "terminal"):
        terminal = phase in ("saved", "cancelled", "terminal")
        confirmation = phase in ("confirming", "confirmation_unknown")
        root, want = case("singleton-" + phase, "CLEAR" if terminal else "BLOCKED", pending=int(not terminal), terminal=int(terminal), confirmation=int(confirmation))
        database(root, statements=[single_sql(singleton(phase))])
    root, want = case("retained-confirmation-audio", "BLOCKED", terminal=1, audio=1, confirmation=1)
    database(root, statements=[single_sql(singleton("saved", "private-fixture-audio", {}))])
    root, want = case("second-owner-committed-wal", "BLOCKED", pending=1, owners=(A, B)); database(root)
    database(root, B, [batch_sql(batch("processing"))], wal=True); want["wal"] = True
    root, want = case("legacy-committed-wal", "BLOCKED", pending=1, claim=A)
    database(root, marked=True); database(root, statements=[batch_sql(batch("processing"))], wal=True, legacy=True); want["wal"] = True
    root, want = case("legacy-empty-bound", claim=A); database(root, marked=True); database(root, legacy=True)
    for name, statements in (("unknown-schema", ["CREATE TABLE unknown_private_state(value TEXT)"]),
                             ("invalid-history", ["DELETE FROM schema_migrations WHERE version=4"]),
                             ("wrong-marker-owner", [marker, "INSERT INTO _masarifi_migration_state VALUES('legacy-export-owner'," + quote(B) + ")"]),
                             ("empty-marker", [marker]),
                             ("unknown-marker-row", [marker, "INSERT INTO _masarifi_migration_state VALUES('unknown'," + quote(A) + ")"]),
                             ("unknown-phase", [batch_sql(batch("private-unknown"))]),
                             ("bad-row-payload", [batch_sql({})])):
        root, want = case(name, "INDETERMINATE"); database(root, statements=statements)
    for mode in ("missing", "wrong"):
        root, want = case("key-" + mode, "INDETERMINATE", key=mode); database(root)
    root, want = case("rollback-journal", "INDETERMINATE"); database(root)
    (root / ("input/files/SQLite/masarifi-" + A[:24] + ".db-journal")).write_bytes(b"\0" * 512)
    root, want = case("hmac-corrupt-unrelated-page", "INDETERMINATE"); database(root)
    path = root / ("input/files/SQLite/masarifi-" + A[:24] + ".db")
    data = bytearray(path.read_bytes()); data[-4096 + 100] ^= 1; path.write_bytes(data)
    root, want = case("truncated-wal", "INDETERMINATE"); database(root, statements=[batch_sql(batch("processing"))], wal=True)
    wal = root / ("input/files/SQLite/masarifi-" + A[:24] + ".db-wal"); wal.write_bytes(wal.read_bytes()[:-1])
    root, want = case("unbound-legacy", "INDETERMINATE"); database(root); database(root, legacy=True)
    root, want = case("uppercase-legacy-claim", "INDETERMINATE", claim=A, key="uppercase-claim"); database(root, marked=True); database(root, legacy=True)
    root, want = case("async-only-missing-owner", "INDETERMINATE", owners=())
    (root / "input/databases").mkdir()
    with sqlite3.connect(root / "input/databases/RKStorage") as writer:
        writer.executescript("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;")
    for malformed in (False, True):
        root, want = case("legacy-key-malformed" if malformed else "legacy-rk-pending", "INDETERMINATE" if malformed else "BLOCKED", pending=0 if malformed else 1)
        database(root)
        (root / "input/databases").mkdir()
        with sqlite3.connect(root / "input/databases/RKStorage") as writer:
            writer.executescript("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;")
            payload = dict(sessionId=ID, sessionVersion=1, recordedAt=0, timezoneOffsetMinutes=0, createdAt=0)
            writer.execute("INSERT INTO catalystLocalStorage VALUES(?,?)", ("masarifi.voice.pending" if malformed else "masarifi.voice.pending." + B[:24], json.dumps(payload)))
    qualification_stages = {'unknown-schema': 'MOBILE_SCHEMA', 'invalid-history': 'MOBILE_SCHEMA', 'wrong-marker-owner': 'MOBILE_MIGRATION_MARKER', 'empty-marker': 'MOBILE_MIGRATION_MARKER', 'unknown-marker-row': 'MOBILE_MIGRATION_MARKER', 'unknown-phase': 'MOBILE_BATCH_ROWS', 'bad-row-payload': 'MOBILE_BATCH_ROWS', 'key-missing': 'OWNER_KEY_DECRYPT', 'key-wrong': 'OWNER_DATABASE_OPEN', 'rollback-journal': 'OWNER_ROLLBACK_CHECK', 'hmac-corrupt-unrelated-page': 'OWNER_DATABASE_OPEN', 'truncated-wal': 'OWNER_WAL_RECONSTRUCT', 'unbound-legacy': 'LEGACY_DATABASE_BINDING', 'uppercase-legacy-claim': 'LEGACY_CLAIM', 'async-only-missing-owner': 'OWNER_DATABASE_REQUIRED', 'legacy-key-malformed': 'ASYNC_ROWS'}
    for root, want in cases:
        if want["verdict"] == "INDETERMINATE": want["qualificationStage"] = qualification_stages[root.name]
        (root / "fixture.json").write_text(json.dumps(want, indent=2), encoding="utf-8")
    if args.jni_library:
        if not args.classes: raise AssertionError("JNI_CLASSES_REQUIRED")
        subprocess.run([args.java, "-cp", args.classes, "com.masarifi.voicequalification.NativeWholeStoreTest", args.jni_library, str(args.output)], check=True)
    print(json.dumps(dict(result="SYNTHETIC_WHOLE_STORE_FIXTURES_RETAINED", cases=len(cases), androidRuntimeQualified=False, applicationDataAccessed=False)))

if __name__ == "__main__": main()
