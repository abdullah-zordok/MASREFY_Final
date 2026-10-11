"""Fresh disposable-only WAL tests. Never accept an application data directory.

The optional shared library must be the pinned Expo SQLCipher amalgamation built
for this test, not an application JNI library with bootstrap side effects.
"""
import argparse
import ctypes
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile


class CipherConnection:
    def __init__(self, library, path, readonly=False):
        self.library = library
        self.connection = ctypes.c_void_p()
        flags = (1 | 0x40) if readonly else (2 | 4)
        filename = path.resolve().as_uri() + "?immutable=1" if readonly else str(path)
        self.check(library.exsqlite3_open_v2(filename.encode(), ctypes.byref(self.connection), flags, None))
        # Public fixture-only raw key; no real key is accessed or accepted.
        self.execute('PRAGMA key = "x\'' + "01" * 32 + '\'"')

    def check(self, status):
        if status != 0:
            raise AssertionError(f"synthetic SQLCipher operation failed: code={status}")

    def execute(self, sql):
        self.check(self.library.exsqlite3_exec(self.connection, sql.encode(), None, None, None))

    def count(self):
        statement = ctypes.c_void_p()
        self.check(self.library.exsqlite3_prepare_v2(self.connection,
                   b"SELECT count(*) FROM voice_batch_operations WHERE payload LIKE '%processing%'",
                   -1, ctypes.byref(statement), None))
        try:
            assert self.library.exsqlite3_step(statement) == 100
            return self.library.exsqlite3_column_int(statement, 0)
        finally:
            self.check(self.library.exsqlite3_finalize(statement))

    def close(self):
        self.check(self.library.exsqlite3_close(self.connection))


def library_api(path):
    library = ctypes.CDLL(str(Path(path).resolve()))
    library.exsqlite3_open_v2.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p), ctypes.c_int, ctypes.c_char_p]
    library.exsqlite3_exec.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    library.exsqlite3_prepare_v2.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    library.exsqlite3_step.argtypes = [ctypes.c_void_p]
    library.exsqlite3_column_int.argtypes = [ctypes.c_void_p, ctypes.c_int]
    library.exsqlite3_finalize.argtypes = [ctypes.c_void_p]
    library.exsqlite3_close.argtypes = [ctypes.c_void_p]
    return library


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--classes", required=True)
    parser.add_argument("--java", default="java")
    parser.add_argument("--sqlcipher-library")
    args = parser.parse_args()
    cipher = library_api(args.sqlcipher_library) if args.sqlcipher_library else None
    root = Path(tempfile.mkdtemp(prefix="voice-wal-real-synthetic-"))
    source = root / "source.db"
    (root / "fixture-marker").write_text("synthetic-wal-test-v1")
    connection = CipherConnection(cipher, source) if cipher else sqlite3.connect(source)
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA wal_autocheckpoint=0")
        connection.execute("CREATE TABLE voice_batch_operations(id TEXT PRIMARY KEY, revision INTEGER, payload TEXT)")
        if not cipher:
            connection.commit()
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        connection.execute("INSERT INTO voice_batch_operations VALUES ('synthetic-operation', 1, '{\"phase\":\"processing\"}')")
        if not cipher:
            connection.commit()
        # Keep the writer open: committed recovery-owned data exists only in WAL.
        (root / "captured.db").write_bytes(source.read_bytes())
        (root / "captured.wal").write_bytes(Path(str(source) + "-wal").read_bytes())
        originals = {path.name: digest(path) for path in root.glob("*") if path.is_file()}
        base = CipherConnection(cipher, root / "captured.db", True) if cipher else sqlite3.connect(
            (root / "captured.db").as_uri() + "?immutable=1", uri=True)
        try:
            base_count = base.count() if cipher else base.execute("SELECT count(*) FROM voice_batch_operations").fetchone()[0]
            assert base_count == 0, "fixture must prove main-file-only false-empty failure"
        finally:
            base.close()
        subprocess.run([args.java, "-cp", args.classes, "com.masarifi.voicequalification.WalFixtureReconstruction", str(root)], check=True)
        reader = CipherConnection(cipher, root / "reconstructed.db", True) if cipher else sqlite3.connect(
            (root / "reconstructed.db").as_uri() + "?immutable=1", uri=True)
        try:
            reconstructed_count = reader.count() if cipher else reader.execute(
                "SELECT count(*) FROM voice_batch_operations WHERE payload LIKE '%processing%'").fetchone()[0]
            assert reconstructed_count == 1, "committed recovery-owned row must be recovered"
        finally:
            reader.close()
        assert all(digest(root / name) == expected for name, expected in originals.items()), "original fixture bytes changed"
        assert {path.name for path in root.glob("*") if path.is_file()} == set(originals) | {"reconstructed.db"}, "reader created unexpected sidecars"
        if cipher:
            assert not (root / "captured.db").read_bytes().startswith(b"SQLite format 3"), "encrypted fixture required"
            try:
                plain = sqlite3.connect((root / "reconstructed.db").as_uri() + "?immutable=1", uri=True)
                try:
                    plain.execute("SELECT count(*) FROM voice_batch_operations").fetchone()
                finally:
                    plain.close()
                raise AssertionError("unencrypted engine must reject encrypted fixture")
            except sqlite3.DatabaseError:
                pass
        print(json.dumps({"result": "PASS", "engine": "Expo SQLCipher" if cipher else "SQLite",
                          "baseOnlyPendingRows": 0, "reconstructedPendingRows": 1,
                          "unchangedOriginalFixtures": True, "retainedSyntheticFixture": str(root)}))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
