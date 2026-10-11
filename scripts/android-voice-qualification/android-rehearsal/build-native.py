"""Offline Android JNI build for disposable fixtures; no device/ADB calls."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
PINS = {"sqlite3.c": "8fdf08e15777a45386fe4b2fc7604f125eb9ec57d0aaa8bde11ec8d8115ed915",
        "sqlite3.h": "3c6356d8cf67ed92522114559cdcba1b38b39eab05e9f5989c1758b8eacef5b9"}
OPENSSL_SHA = "bdd7fdc6d5534b0c3d1d1b233de4c7a688086aa8b13dcee70699a178a89ee298"

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ndk", type=Path, required=True)
    parser.add_argument("--openssl-aar", type=Path, required=True)
    parser.add_argument("--vendor", type=Path, required=True)
    parser.add_argument("--abi", choices=["arm64-v8a", "x86_64"], required=True)
    args = parser.parse_args()
    if digest(args.openssl_aar) != OPENSSL_SHA: raise AssertionError("OPENSSL_AAR_PIN_CHANGED")
    sources = {name:(args.vendor / name).read_bytes() for name in PINS}
    for name, expected in PINS.items():
        if hashlib.sha256(sources[name]).hexdigest() != expected: raise AssertionError("EXPO_SQLCIPHER_PIN_CHANGED")
    args.output.mkdir(parents=True, exist_ok=False)
    args.vendor = args.output / "vendor"
    args.vendor.mkdir()
    for name, contents in sources.items(): (args.vendor / name).write_bytes(contents)
    args.vendor = args.vendor.resolve()
    include = args.output / "include"
    include.mkdir()
    crypto = args.output / "libcrypto.so"
    with zipfile.ZipFile(args.openssl_aar) as archive:
        for name in archive.namelist():
            prefix = "prefab/modules/crypto/include/"
            if name.startswith(prefix) and not name.endswith("/"):
                relative = Path(name[len(prefix):])
                if relative.is_absolute() or ".." in relative.parts: raise AssertionError("AAR_PATH_INVALID")
                output = include / relative; output.parent.mkdir(parents=True, exist_ok=True); output.write_bytes(archive.read(name))
        crypto.write_bytes(archive.read("prefab/modules/crypto/libs/android." + args.abi + "/libcrypto.so"))
    host = "windows-x86_64" if os.name == "nt" else "linux-x86_64"
    toolchain = args.ndk / "toolchains/llvm/prebuilt" / host
    compiler = toolchain / "bin" / ("clang.exe" if os.name == "nt" else "clang")
    triplet = "aarch64-linux-android" if args.abi == "arm64-v8a" else "x86_64-linux-android"
    flags = [str(compiler), "--target=" + triplet + "35", "--sysroot=" + str(toolchain / "sysroot"),
             "-std=c11", "-fPIC", "-O2", "-fvisibility=hidden", "-D_GNU_SOURCE", "-include", "stdint.h",
             "-include", "unistd.h", "-include", "sys/mman.h", "-include", "errno.h",
             "-DSQLITE_THREADSAFE=1", "-DSQLITE_TEMP_STORE=2", "-DSQLITE_ENABLE_BYTECODE_VTAB=1",
             "-DSQLITE_ENABLE_SESSION=1", "-DSQLITE_ENABLE_PREUPDATE_HOOK=1", "-DSQLITE_ENABLE_MATH_FUNCTIONS=1",
             "-DSQLITE_ENABLE_FTS4=1", "-DSQLITE_ENABLE_FTS3_PARENTHESIS=1", "-DSQLITE_ENABLE_FTS5=1",
             "-DSQLITE_HAS_CODEC=1", "-DSQLITE_EXTRA_INIT=sqlcipher_extra_init", "-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown",
             "-DSQLCIPHER_CRYPTO_OPENSSL", "-DSQLITE_OS_OTHER=1", "-DSQLITE_OMIT_LOAD_EXTENSION=1",
             "-DSQLITE_OMIT_DESERIALIZE=1", "-DSQLCIPHER_OMIT_DEFAULT_LOGGING=1", "-I", str(args.vendor), "-I", str(include)]
    objects = []
    with (args.output / "build.log").open("w", encoding="utf-8") as log:
        for name, source in (("cipher", args.vendor / "sqlite3.c"), ("reader", HERE.parent / "native/voice_memory_reader.c"),
                             ("jni", HERE.parent / "native/voice_memory_jni.c")):
            output = args.output / (name + ".o"); objects.append(output)
            command = flags + ([] if name == "cipher" else ["-Wall", "-Wextra", "-Werror"]) + ["-c", str(source), "-o", str(output)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=300)
            log.write(result.stdout + result.stderr); log.flush()
            if result.returncode: raise AssertionError("ANDROID_NATIVE_COMPILE_FAILED")
        shared = args.output / "libvoice_private_reader.so"
        command = flags + ["-shared", "-Wl,-Bsymbolic", "-Wl,-z,defs", "-Wl,-soname,libvoice_private_reader.so", *map(str, objects),
                           "-L", str(args.output), "-lcrypto", "-llog", "-lm", "-o", str(shared)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        log.write(result.stdout + result.stderr)
        if result.returncode: raise AssertionError("ANDROID_NATIVE_LINK_FAILED")
    receipt = dict(qualification="OFFLINE_COMPILE_AND_LINK_ONLY", runtimeAcceptance=False, abi=args.abi,
                   opensslAarSha256=OPENSSL_SHA, sqlcipherSources=PINS,
                   sources={source.name:digest(source) for source in (HERE.parent / "native").glob("*.[ch]")},
                   libraries={path.name:digest(path) for path in (crypto, shared)})
    (args.output / "build-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(dict(result="BUILT_DISPOSABLE_ANDROID_JNI", abi=args.abi, androidRuntimeQualified=False)))

if __name__ == "__main__": main()
