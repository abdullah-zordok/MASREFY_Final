"""Synthetic admission query regressions using real pinned application migrations.

The local SQL mode verifies the exact closed query statements, not the native
engine. memory-vfs-fixtures calls qualify with the production RAM reader in CI.
No application files, credentials, or physical devices are inputs.
"""
import hashlib
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import tempfile


QUERIES = ((7, "SYNC_MUTATIONS"), (8, "SMS_IMPORT"), (9, "SYNC_STATE"))


def load_helper(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def qualify(library, root, checked):
    schemas = load_helper("admission_schema", "schema-fixtures.py")
    migrations = schemas.migration_sql(schemas.pinned_source())
    path = root / "admission.db"
    with closing(sqlite3.connect(path)) as connection, connection:
        for version in sorted(migrations):
            connection.executescript(migrations[version])
        # Unknown/terminal states must be visible; filtering to ready rows could
        # incorrectly grant admission in the presence of malformed work.
        for number, status in enumerate(("pending", "sending", "conflict", "acked", "unexpected")):
            connection.execute("""INSERT INTO sync_mutation_queue
                (operation_id,domain,resource_type,operation,payload,status,created_at,updated_at)
                VALUES(?, 'transactions','transaction','create','{}',?,0,0)""", (str(number), status))
        connection.execute("INSERT INTO sms_import_queue VALUES('singleton',?)",
                           ('{"version":1,"pending":[],"label":"قهوة"}',))
        connection.execute("INSERT INTO sync_state VALUES('transactions','cursor',NULL,123)")
    baseline = hashlib.sha256(path.read_bytes()).hexdigest()
    before = set(root.iterdir())
    with library.open(path.read_bytes()) as reader:
        checked(reader.rows(7) == (0, [[str(number), "transactions", state] for number, state in
                enumerate(("pending", "sending", "conflict", "acked", "unexpected"))]),
                "admission exposes every mutation status without filtering")
        checked(reader.rows(8) == (0, [["singleton", '{"version":1,"pending":[],"label":"قهوة"}']]),
                "admission retains full SMS payload and UTF8")
        checked(reader.rows(9) == (0, [["transactions", "cursor", None, 123]]),
                "admission retains nullable mutation ID and integer timestamp")
    checked(hashlib.sha256(path.read_bytes()).hexdigest() == baseline and set(root.iterdir()) == before,
            "admission reads preserve fixture bytes and create no sidecars")
    # SQLite's TEXT affinity still allows BLOBs. They must reach strict decoding
    # as unsupported types rather than being coerced to harmless-looking text.
    for table, column, query in (("sync_mutation_queue", "status", 7),
                                 ("sms_import_queue", "payload", 8),
                                 ("sync_state", "cursor", 9)):
        with closing(sqlite3.connect(path)) as connection, connection:
            connection.execute(f"UPDATE {table} SET {column}=?", (sqlite3.Binary(b"pending"),))
        with library.open(path.read_bytes()) as reader:
            checked(reader.rows(query)[0] != 0, "BLOB admission cell rejected by strict decoding: " + table)
        with closing(sqlite3.connect(path)) as connection, connection:
            connection.execute(f"DELETE FROM {table}")
        with library.open(path.read_bytes()) as reader:
            checked(reader.rows(query) == (0, []), "real empty admission table remains distinguishable: " + table)
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute("DROP TABLE sms_import_queue")
    with library.open(path.read_bytes()) as reader:
        checked(reader.rows(8)[0] != 0, "missing admission table fails closed")


class SqlStatements:
    """Explicit SQL-only local check; production memory reader is tested by CI."""
    def __init__(self):
        source = (Path(__file__).resolve().parents[1] / "native/voice_memory_reader.c").read_text()
        self.queries = {}
        for ordinal, name in QUERIES:
            found = re.search(r'case VQS_' + name + r': return "([^"]+)";', source)
            if not found:
                raise AssertionError("Missing closed admission query: " + name)
            self.queries[ordinal] = found.group(1)

    def open(self, snapshot):
        connection = sqlite3.connect(":memory:")
        connection.deserialize(snapshot)
        connection.execute("PRAGMA query_only=ON")
        queries = self.queries
        class Reader:
            def __enter__(self): return self
            def __exit__(self, *unused): connection.close()
            def rows(self, query):
                try:
                    rows = [list(row) for row in connection.execute(queries[query])]
                    if any(not isinstance(value, (str, int, type(None))) for row in rows for value in row):
                        return 1, []
                    return 0, rows
                except (sqlite3.DatabaseError, KeyError): return 1, []
        return Reader()


if __name__ == "__main__":
    checks = []
    def checked(condition, label):
        if not condition: raise AssertionError(label)
        checks.append(label)
    with tempfile.TemporaryDirectory(prefix="synthetic-admission-sql-") as directory:
        qualify(SqlStatements(), Path(directory), checked)
    print(json.dumps({"result": "PASS", "checks": len(checks), "mode": "SQL_STATEMENTS_ONLY",
                      "nativeRuntimeQualified": False, "physicalDeviceQualified": False}))
