"""Disposable database behavior tests for the independent RAM-only reader.

Never accepts an app data directory or a real key. Only the pinned fixture engine
may write newly created synthetic databases; the reader receives byte arrays.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import ctypes as c
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile


class Input(c.Structure):
    _fields_ = [("bytes", c.POINTER(c.c_ubyte)), ("length", c.c_size_t),
                ("key", c.POINTER(c.c_ubyte)), ("key_length", c.c_size_t)]


class Cell(c.Structure):
    _fields_ = [("kind", c.c_int), ("length", c.c_size_t),
                ("text", c.POINTER(c.c_ubyte)), ("integer", c.c_int64)]


class Row(c.Structure):
    _fields_ = [("count", c.c_size_t), ("cells", c.POINTER(Cell))]


class Stats(c.Structure):
    _fields_ = [("reads", c.c_uint64), ("bytes_read", c.c_uint64),
                ("denied_writes", c.c_uint64), ("denied_opens", c.c_uint64),
                ("denied_deletes", c.c_uint64)]


VISITOR = c.CFUNCTYPE(c.c_int, c.c_void_p, c.POINTER(Row))
WIPE_OBSERVER = c.CFUNCTYPE(None, c.POINTER(c.c_ubyte), c.c_size_t)


class ReaderLibrary:
    def __init__(self, path, test_hooks=False):
        if not Path(path).is_file():
            raise AssertionError("native in-memory reader is not built; retained fixtures cannot be qualified")
        self.library = c.CDLL(str(Path(path).resolve()))
        api = self.library
        api.vqs_open.argtypes = [c.POINTER(Input), c.POINTER(c.c_void_p)]
        api.vqs_close.argtypes = [c.c_void_p]
        api.vqs_visit.argtypes = [c.c_void_p, c.c_int, VISITOR, c.c_void_p]
        api.vqs_stats.argtypes = [c.c_void_p, c.POINTER(Stats)]
        api.vqs_error_name.argtypes = [c.c_int]
        api.vqs_error_name.restype = c.c_char_p
        if test_hooks:
            api.vqs_test_sql.argtypes = [c.c_void_p, c.c_char_p]
            api.vqs_test_read.argtypes = [c.c_void_p, c.POINTER(c.c_ubyte), c.c_int, c.c_int64]
            api.vqs_test_write.argtypes = [c.c_void_p]
            api.vqs_test_external_open.argtypes = [c.c_void_p]
            api.vqs_test_delete.argtypes = [c.c_void_p]
            api.vqs_test_before_free.argtypes = [WIPE_OBSERVER]

    def open_status(self, snapshot, key=b""):
        original = (c.c_ubyte * len(snapshot)).from_buffer_copy(snapshot)
        key_bytes = (c.c_ubyte * len(key)).from_buffer_copy(key) if key else None
        request = Input(original, len(snapshot), key_bytes, len(key))
        handle = c.c_void_p()
        status = self.library.vqs_open(c.byref(request), c.byref(handle))
        return status, handle, original

    def open(self, snapshot, key=b""):
        status, handle, original = self.open_status(snapshot, key)
        if status:
            raise AssertionError("native open failed: " + self.library.vqs_error_name(status).decode())
        return Reader(self.library, handle, original)


class Reader:
    def __init__(self, library, handle, original):
        self.library, self.handle, self.original = library, handle, original

    def rows(self, query):
        collected = []
        @VISITOR
        def receive(unused, pointer):
            try:
                values = []
                for number in range(pointer.contents.count):
                    cell = pointer.contents.cells[number]
                    values.append(cell.integer if cell.kind == 1 else
                                  c.string_at(cell.text, cell.length).decode("utf-8") if cell.kind == 3 else None)
                collected.append(values)
                return 0
            except Exception:
                # ctypes otherwise prints/ignores a callback exception and may
                # pass an undefined return value back to C. Abort explicitly.
                return 1
        status = self.library.vqs_visit(self.handle, query, receive, None)
        return status, collected

    def close(self):
        status = self.library.vqs_close(self.handle)
        if status:
            raise AssertionError("native close failed: " + self.library.vqs_error_name(status).decode())
        self.handle = None

    def __enter__(self): return self
    def __exit__(self, *unused): self.close()


def check(condition, label):
    if not condition: raise AssertionError(label)


def make_plain(path, count=2, payload=None):
    with sqlite3.connect(path) as connection:
        connection.executescript("""
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
            INSERT INTO schema_migrations VALUES(14),(15);
            CREATE TABLE voice_batch_operations(id TEXT PRIMARY KEY, revision INTEGER, payload TEXT);
            CREATE TABLE voice_operation_journal(id TEXT PRIMARY KEY, attempt_id TEXT, revision INTEGER, payload TEXT);
            CREATE TABLE catalystLocalStorage(key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE auxiliary(contents BLOB);
            INSERT INTO auxiliary VALUES(zeroblob(16000));
        """)
        connection.executemany("INSERT INTO voice_batch_operations VALUES (?,1,?)",
                               [(f"synthetic-{number}", payload or '{"phase":"processing"}') for number in range(count)])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reader-library", required=True)
    parser.add_argument("--test-reader-library", required=True)
    parser.add_argument("--sqlcipher-library", required=True)
    parser.add_argument("--classes", required=True)
    parser.add_argument("--java", default="java")
    args = parser.parse_args()
    # Availability is a failing prerequisite of the real fixture behavior, not a success fallback.
    production = ReaderLibrary(args.reader_library)
    test_reader = ReaderLibrary(args.test_reader_library, True)
    spec = importlib.util.spec_from_file_location("disposable_cipher", Path(__file__).with_name("real-wal-fixtures.py"))
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    cipher = fixture.library_api(args.sqlcipher_library)
    root = Path(tempfile.mkdtemp(prefix="voice-memory-native-synthetic-"))
    (root / "fixture-marker").write_text("synthetic-wal-test-v1")
    source = root / "plain.db"
    make_plain(source)
    plain = source.read_bytes()
    other = root/'other.db'
    make_plain(other,3,'{"phase":"processing","label":"قهوة"}')
    other_snapshot = other.read_bytes()
    checks = 0
    def checked(condition, label):
        nonlocal checks
        check(condition, label)
        checks += 1
    # Every handle has one owner; independent readers must safely share the engine.
    # Run this before any open to exercise concurrent initialisation as well.
    def independent_reads(number):
        snapshot, expected = (plain, 2) if number % 2 == 0 else (other_snapshot, 3)
        for unused in range(12):
            with production.open(snapshot) as reader:
                status, rows = reader.rows(2)
                check(status == 0 and len(rows) == expected, "parallel owner isolation")
        return True
    with ThreadPoolExecutor(max_workers=8) as threads:
        checked(all(threads.map(independent_reads, range(8))), "96 independent reads across eight threads")
    with production.open(plain) as reader:
        status, rows = reader.rows(2)
        checked(status == 0 and len(rows) == 2 and rows[0][2] == '{"phase":"processing"}', "actual SQLite rows from owned RAM")
        status, migrations = reader.rows(1)
        checked(status == 0 and migrations == [[14], [15]], "integer schema versions retained")
        reader.original[0] ^= 0xff
        checked(reader.rows(2)[0] == 0, "owned snapshot independent of caller mutation")
        counters = Stats()
        checked(production.library.vqs_stats(reader.handle, c.byref(counters)) == 0 and counters.reads > 0 and
                counters.denied_writes == counters.denied_opens == counters.denied_deletes == 0, "normal reads have no write or other-open attempts")
        checked(reader.rows(99)[0] != 0, "unknown query cannot become empty success")
        @VISITOR
        def stop(unused, pointer): return 1
        checked(production.library.vqs_visit(reader.handle, 2, stop, None) != 0, "aborted visitor remains indeterminate")
        attempted_close = []
        @VISITOR
        def busy_close(unused, pointer):
            attempted_close.append(production.library.vqs_close(reader.handle))
            return 1
        checked(production.library.vqs_visit(reader.handle, 2, busy_close, None) != 0 and attempted_close[0] != 0 and reader.rows(2)[0] == 0,
                "busy close leaves reader safely usable")
    with production.open(plain) as first, production.open(other.read_bytes()) as second:
        checked(len(first.rows(2)[1]) == 2 and len(second.rows(2)[1]) == 3 and 'قهوة' in second.rows(2)[1][0][2],
                "simultaneous owner snapshots remain independent with Arabic UTF8")
    for symbol in ["exsqlite3_open_v2", "exsqlite3_exec", "exsqlite3_vfs_find", "vqs_test_sql", "vqs_test_before_free"]:
        try: getattr(production.library, symbol)
        except AttributeError: checked(True, "production omits dangerous/test export " + symbol)
        else: raise AssertionError("production exported forbidden symbol")
    observed_wipes = []
    @WIPE_OBSERVER
    def wiped(pointer, length): observed_wipes.append(set(c.string_at(pointer, length)) <= {0})
    test_reader.library.vqs_test_before_free(wiped)
    with test_reader.open(plain) as reader:
        for offset, expected in [(0, plain[:16]), (len(plain)-16, plain[-16:])]:
            output = (c.c_ubyte * 16)()
            checked(test_reader.library.vqs_test_read(reader.handle, output, 16, offset) == 0 and bytes(output) == expected,
                    "exact first/last RAM page bytes")
        output = (c.c_ubyte * 16)(*([255]*16))
        checked(test_reader.library.vqs_test_read(reader.handle, output, 16, len(plain)-4) != 0 and
                bytes(output) == plain[-4:] + b"\0"*12, "partial short read zero-fills")
        for offset in [len(plain), 2**63-1, -1]:
            checked(test_reader.library.vqs_test_read(reader.handle, output, 16, offset) != 0 and bytes(output) == b"\0"*16,
                    "out-of-bounds read rejected and zero-filled")
        blocked_sql = ["INSERT INTO voice_batch_operations VALUES('forbidden',1,'{}')", "DELETE FROM voice_batch_operations",
                       "CREATE TEMP TABLE forbidden(x)", "ATTACH ':memory:' AS other", "VACUUM",
                       "PRAGMA journal_mode=WAL", "PRAGMA cipher_use_hmac=OFF", "PRAGMA cipher_log='" + str(root/'forbidden.log') + "'",
                       "SELECT load_extension('forbidden')", "SELECT sqlcipher_export('other')"]
        for sql in blocked_sql:
            checked(test_reader.library.vqs_test_sql(reader.handle, sql.encode()) != 0, "mutating/unsafe SQL rejected")
        checked(test_reader.library.vqs_test_write(reader.handle) != 0, "VFS write always rejected")
        checked(test_reader.library.vqs_test_external_open(reader.handle) != 0, "VFS external path rejected")
        checked(test_reader.library.vqs_test_delete(reader.handle) != 0, "VFS deletion rejected")
        checked(reader.rows(2)[0] == 0 and len(reader.rows(2)[1]) == 2, "failed writes leave actual data unchanged")
        checked(not (root/'forbidden.log').exists(), "SQLCipher log cannot create file")
    checked(observed_wipes and all(observed_wipes), "owned bytes zeroed before freeing")
    for snapshot, key in [(b"",b""), (plain[:-1],b""), (plain[:-4096],b""), (plain+b"\0"*4096,b""),
                          (plain,b"x"*32), (plain,b"x"*31), (b"\0"*4096,b""), (b"\0"*4096,b"x"*32)]:
        status, handle, unused = production.open_status(snapshot,key)
        checked(status != 0 and not handle.value, "bad snapshot/key does not return a reader")
    for label, count, payload in [("rows",1025,None),("column",1,"x"*98305)]:
        path=root/(label+'.db');make_plain(path,count,payload)
        with production.open(path.read_bytes()) as reader:
            checked(reader.rows(2)[0] != 0, "reader bounds reject excessive " + label)
    encrypted_source = root/'cipher-source.db'
    writer = fixture.CipherConnection(cipher, encrypted_source)
    try:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("CREATE TABLE voice_batch_operations(id TEXT PRIMARY KEY, revision INTEGER, payload TEXT)")
        writer.execute("CREATE TABLE auxiliary(contents BLOB)")
        writer.execute("INSERT INTO auxiliary VALUES(zeroblob(16000))")
        writer.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        writer.execute("INSERT INTO voice_batch_operations VALUES('synthetic-operation',1,'{\"phase\":\"processing\"}')")
        (root/'captured.db').write_bytes(encrypted_source.read_bytes())
        (root/'captured.wal').write_bytes(Path(str(encrypted_source)+'-wal').read_bytes())
        originals = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()}
        before = set(originals)
        subprocess.run([args.java,'-cp',args.classes,'com.masarifi.voicequalification.WalFixtureReconstruction',str(root)],check=True)
        raw_key=b"\x01"*32
        with production.open((root/'captured.db').read_bytes(),raw_key) as reader:
            checked(reader.rows(2) == (0,[]), "encrypted base-only fixture is empty before WAL reconstruction")
        with production.open((root/'reconstructed.db').read_bytes(),raw_key) as reader:
            checked(reader.rows(2)[0] == 0 and len(reader.rows(2)[1]) == 1, "encrypted committed WAL row read entirely from RAM")
        for key in [b"", b"\x02"*32]:
            status,handle,unused=production.open_status((root/'reconstructed.db').read_bytes(),key)
            checked(status != 0 and not handle.value, "missing/wrong encrypted key is indeterminate")
        tampered=bytearray((root/'reconstructed.db').read_bytes());tampered[-4096+100]^=1
        status,handle,unused=production.open_status(tampered,raw_key)
        checked(status != 0 and not handle.value, "HMAC corruption in unrelated page cannot masquerade as empty journal")
        checked(all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in originals.items()),
                "all original synthetic database/sidecar bytes unchanged")
        checked({p.name for p in root.iterdir() if p.is_file()} == before|{'reconstructed.db'}, "no native reader sidecars or logging files created")
    finally:
        writer.close()
    print(json.dumps({'result':'PASS','checks':checks,'reader':'owned RAM-only Expo SQLCipher snapshots',
                      'fixture':str(root),'realAndroidOrRedmiQualification':False}))


if __name__ == '__main__': main()
