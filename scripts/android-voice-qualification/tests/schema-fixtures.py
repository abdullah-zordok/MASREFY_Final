"""Actual disposable SQLite schemas from the pinned application migration source."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import struct
import subprocess

SOURCE_SHA = "e932c00613e54ac45c59ad2f2b79f27c9090e1c0fec78a69334ee4f91f0a2b36"
SOURCE_PATH = "apps/mobile/src/storage/database.ts"

def pinned_source():
    source = subprocess.check_output(["git","show","HEAD:"+SOURCE_PATH])
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise AssertionError("APPLICATION_SCHEMA_SOURCE_PIN_CHANGED")
    return source.decode("utf-8")

def migration_sql(source):
    match = re.search(r"const migrations = parseMigrations\(`(.*?)`\);",source,re.S)
    if not match: raise AssertionError("MIGRATION_TEMPLATE_MISSING")
    parts = re.split(r"-- migration:(\d+)",match.group(1))
    migrations = {int(parts[index]):parts[index+1].strip() for index in range(1,len(parts),2)}
    if set(migrations) != set(range(1,16)): raise AssertionError("MIGRATION_PREFIX_CHANGED")
    return migrations

def signature(rows):
    digest = hashlib.sha256(b"VQS_SCHEMA_V1\0")
    for row in rows:
        for field in row:
            encoded = field.encode("utf-8") if field is not None else None
            digest.update(struct.pack(">i",len(encoded) if encoded is not None else -1))
            if encoded is not None: digest.update(encoded)
    return digest.hexdigest()

def schema_parts(source):
    history = re.search(r"CREATE TABLE IF NOT EXISTS schema_migrations \(.*?\);",source,re.S)
    marker = re.search(r"CREATE TABLE IF NOT EXISTS \$\{LEGACY_MIGRATION_TABLE\} \(.*?\);",source,re.S)
    if not history or not marker: raise AssertionError("SCHEMA_TEMPLATE_MISSING")
    return history.group(0),marker.group(0).replace("${LEGACY_MIGRATION_TABLE}","_masarifi_migration_state")

def retain_rows(output, rows, versions):
    output.with_suffix(".rows").write_text("\n".join("\t".join(
        base64.b64encode(field.encode()).decode() if field is not None else "-" for field in row
    ) for row in rows)+"\n",encoding="utf-8")
    output.with_suffix(".versions").write_text(",".join(map(str,versions)),encoding="ascii")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--classes")
    parser.add_argument("--java",default="java")
    arguments = parser.parse_args()
    arguments.output.mkdir(parents=True,exist_ok=False)
    source = pinned_source()
    migrations = migration_sql(source)
    history,marker = schema_parts(source)
    catalog = {"sourceSha256":SOURCE_SHA,"prefixes":{}}
    for version in range(1,16):
        path = arguments.output / ("prefix-"+str(version)+".db")
        with sqlite3.connect(path) as connection:
            connection.executescript(history)
            for applied in range(1,version+1):
                connection.executescript(migrations[applied])
                connection.execute("INSERT INTO schema_migrations VALUES(?,0)",(applied,))
            connection.commit()
            rows = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
            catalog["prefixes"][str(version)] = signature(rows)
            retain_rows(arguments.output / ("prefix-"+str(version)),rows,range(1,version+1))
            connection.executescript(marker)
            marked = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
            retain_rows(arguments.output / ("marked-"+str(version)),marked,range(1,version+1))
            connection.execute("CREATE TABLE android_metadata (locale TEXT)")
            metadata = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
            retain_rows(arguments.output / ("metadata-"+str(version)),metadata,range(1,version+1))
            if version == 15:
                catalog["migrationMarker"] = [row for row in marked if row[2] == "_masarifi_migration_state"]
    for metadata in (False,True):
        path = arguments.output / ("async-meta.db" if metadata else "async.db")
        with sqlite3.connect(path) as connection:
            connection.execute("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("PRAGMA user_version=1")
            if metadata: connection.execute("CREATE TABLE android_metadata (locale TEXT)")
            rows = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
            retain_rows(path.with_suffix(""),rows,[1])
            if not metadata: catalog["async"] = signature(rows)
    (arguments.output / "catalog.json").write_text(json.dumps(catalog,indent=2),encoding="utf-8")
    if arguments.classes:
        subprocess.run([arguments.java,"-cp",arguments.classes,
                        "com.masarifi.voicequalification.VoiceDatabaseSchemaTest",str(arguments.output)],check=True)
    print(json.dumps({"result":"SYNTHETIC_SCHEMAS_RETAINED","directory":str(arguments.output),"prefixes":15}))

if __name__ == "__main__": main()
