"""Build two synthetic same-signature APKs. Never use the Masarifi signing key."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

SOURCE = Path(__file__).resolve().parent
EXECUTABLE_SUFFIX = ".exe" if os.name == "nt" else ""
ANDROID35_JAR_SHA="4566663c3876e022b4fa4ced8c8697c4ab1688267f090114fd92d027b32e619b"

def executable(directory, name):
    return directory / (name + EXECUTABLE_SUFFIX)

def checked(command, log):
    completed = subprocess.run([str(argument) for argument in command],capture_output=True,text=True,timeout=120)
    log.write(completed.stdout + completed.stderr)
    log.flush()
    if completed.returncode:
        raise RuntimeError("FIXTURE_BUILD_FAILED")
    return completed.stdout + completed.stderr

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def core_factory(aar, output):
    with zipfile.ZipFile(aar) as archive:
        jar_bytes = archive.read("classes.jar")
    source_jar = output / "core-original-classes.jar"
    source_jar.write_bytes(jar_bytes)
    trimmed = output / "core-factory-only.jar"
    with zipfile.ZipFile(source_jar) as archive, zipfile.ZipFile(trimmed,"w") as fixture:
        for name in ("androidx/core/app/CoreComponentFactory.class","androidx/core/app/CoreComponentFactory$CompatWrapped.class"):
            fixture.writestr(name,archive.read(name))
    return trimmed

def build_apk(kind, arguments, factory, log):
    output = arguments.output / kind
    output.mkdir()
    classes = output / "classes"
    classes.mkdir()
    source_directory = SOURCE.parent / "android-process-lab" / kind if arguments.process_lab else SOURCE / kind
    sources = sorted(source_directory.glob("*.java"))
    if kind == "probe":
        sources += [SOURCE.parent/"android-probe/AndroidProcessSurvey.java",
                    SOURCE.parent/"src/com/masarifi/voicequalification/PrivateProbeFailure.java",
                    SOURCE.parent/"src/com/masarifi/voicequalification/PrivateProbeProcessPolicy.java"]
    if kind == "probe" and arguments.journal_fixtures:
        sources += sorted((SOURCE / "journal").glob("*.java"))
        sources += sorted((SOURCE.parent / "src").rglob("*.java"))
    sources=sorted(set(sources))
    android_jar = arguments.sdk / "platforms/android-36/android.jar"
    tools = arguments.sdk / "build-tools/35.0.0"
    checked([executable(arguments.java / "bin","javac"),"-encoding","UTF-8","-source","17","-target","17",
             "-classpath",android_jar,"-d",classes,*sources],log)
    if kind == "probe" and arguments.journal_fixtures:
        checked([sys.executable,SOURCE.parent / "tests/test-android-buffer-descriptors.py",
                 "--android-jar",arguments.runtime_android_jar,"--classes",classes],log)
    dex = output / "dex"
    dex.mkdir()
    dex_inputs = sorted(classes.rglob("*.class"))
    if kind == "target": dex_inputs.append(factory)
    checked([executable(arguments.java / "bin","java"),"-cp",tools / "lib/d8.jar","com.android.tools.r8.D8",
             "--min-api","35","--lib",android_jar,"--output",dex,*dex_inputs],log)
    if kind == "probe" and arguments.journal_fixtures:
        for entry in sorted(dex.glob("*.dex")):
            checked([sys.executable,SOURCE.parent / "tests/test-android-buffer-descriptors.py",
                     "--android-jar",arguments.runtime_android_jar,"--dex",entry],log)
    unsigned = output / "unsigned.apk"
    manifest_source = SOURCE / "journal/AndroidManifest.xml" if kind == "probe" and arguments.journal_fixtures else source_directory / "AndroidManifest.xml"
    checked([executable(tools,"aapt2"),"link","-I",android_jar,"--manifest",manifest_source,
             "-o",unsigned],log)
    with zipfile.ZipFile(unsigned,"a",compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in sorted(dex.glob("*.dex")): archive.write(entry,entry.name)
        if kind == "probe" and arguments.journal_fixtures:
            for entry in sorted(arguments.journal_fixtures.rglob("*")):
                if entry.is_file(): archive.write(entry,"assets/journals/" + entry.relative_to(arguments.journal_fixtures).as_posix())
            for name in ("libcrypto.so", "libvoice_private_reader.so"):
                archive.write(arguments.journal_native / name,"lib/" + arguments.journal_abi + "/" + name)
    aligned = output / "aligned.apk"
    checked([executable(tools,"zipalign"),"-p","4",unsigned,aligned],log)
    apk = output / "fixture.apk"
    signer = [executable(arguments.java / "bin","java"),"-jar",tools / "lib/apksigner.jar"]
    checked([*signer,"sign","--ks",arguments.output / "disposable-fixture.keystore","--ks-pass",
             "pass:public-synthetic-fixture","--out",apk,aligned],log)
    signature = checked([*signer,"verify","--verbose","--print-certs",apk],log)
    manifest = checked([executable(tools,"aapt2"),"dump","xmltree",apk,"--file","AndroidManifest.xml"],log)
    (output / "manifest.txt").write_text(manifest,encoding="utf-8")
    return {"apk":str(apk),"sha256":digest(apk),"signature":signature}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--sdk",type=Path,required=True)
    parser.add_argument("--java",type=Path,required=True)
    parser.add_argument("--core-aar",type=Path,required=True)
    parser.add_argument("--fixture-keystore",type=Path)
    parser.add_argument("--journal-fixtures",type=Path)
    parser.add_argument("--journal-native",type=Path)
    parser.add_argument("--journal-abi",choices=["arm64-v8a","x86_64"])
    parser.add_argument("--runtime-android-jar",type=Path)
    parser.add_argument("--process-lab",action="store_true")
    arguments = parser.parse_args()
    if arguments.process_lab and any((arguments.journal_fixtures,arguments.journal_native,arguments.journal_abi)):
        raise RuntimeError("PROCESS_LAB_MUST_NOT_INCLUDE_JOURNAL_OR_NATIVE_CODE")
    if any((arguments.journal_fixtures, arguments.journal_native, arguments.journal_abi)):
        if not arguments.runtime_android_jar or digest(arguments.runtime_android_jar)!=ANDROID35_JAR_SHA:
            raise RuntimeError("PINNED_ANDROID35_RUNTIME_STUB_REQUIRED")
        if not all((arguments.journal_fixtures, arguments.journal_native, arguments.journal_abi)):
            raise RuntimeError("COMPLETE_JOURNAL_BUILD_INPUTS_REQUIRED")
        if len(list(arguments.journal_fixtures.glob("*/fixture.json"))) < 30:
            raise RuntimeError("FULL_SYNTHETIC_JOURNAL_FIXTURES_REQUIRED")
        native = json.loads((arguments.journal_native / "build-receipt.json").read_text(encoding="utf-8"))
        if native["abi"] != arguments.journal_abi:
            raise RuntimeError("NATIVE_ABI_MISMATCH")
        for name, expected in native["sources"].items():
            if digest(SOURCE.parent / "native" / name) != expected:
                raise RuntimeError("NATIVE_SOURCE_CHANGED_AFTER_COMPILE")
        for name, expected in native["libraries"].items():
            if digest(arguments.journal_native / name) != expected:
                raise RuntimeError("NATIVE_LIBRARY_CHANGED_AFTER_COMPILE")
    for required in (arguments.sdk / "platforms/android-36/android.jar",executable(arguments.sdk / "build-tools/35.0.0","aapt2"),arguments.core_aar):
        if not required.is_file(): raise RuntimeError("REQUIRED_EXISTING_BUILD_INPUT_MISSING")
    # Existing artifacts are evidence; every build gets a fresh owned directory.
    arguments.output.mkdir(parents=True,exist_ok=False)
    os.environ["TEMP"] = str(arguments.output)
    os.environ["TMP"] = str(arguments.output)
    with (arguments.output / "build.log").open("w",encoding="utf-8") as log:
        if arguments.fixture_keystore:
            (arguments.output / "disposable-fixture.keystore").write_bytes(arguments.fixture_keystore.read_bytes())
        else:
            checked([executable(arguments.java / "bin","keytool"),"-genkeypair","-keystore",arguments.output / "disposable-fixture.keystore",
                     "-storepass","public-synthetic-fixture","-keypass","public-synthetic-fixture","-alias","fixture",
                     "-keyalg","RSA","-keysize","2048","-validity","30","-dname","CN=Disposable Synthetic Bootstrap Fixture"],log)
        factory = core_factory(arguments.core_aar,arguments.output)
        receipt = {"realDeviceOrMasarifiArtifact":False,"coreAarSha256":digest(arguments.core_aar),
                   "sourceHashes":{str(path.relative_to(SOURCE)):digest(path) for path in sorted(SOURCE.rglob("*"))
                                   if path.is_file() and path.suffix in (".java",".xml",".py")}}
        if arguments.process_lab:
            receipt["sharedGuardSourceHashes"]={name:digest(SOURCE.parent/name) for name in (
                "android-probe/AndroidProcessSurvey.java","src/com/masarifi/voicequalification/PrivateProbeFailure.java",
                "src/com/masarifi/voicequalification/PrivateProbeProcessPolicy.java")}
            receipt["processLabSourceHashes"]={str(path.relative_to(SOURCE.parent/"android-process-lab")):digest(path)
                for path in sorted((SOURCE.parent/"android-process-lab").rglob("*")) if path.is_file() and path.suffix in (".java",".xml",".py")}
        receipt["target"] = build_apk("target",arguments,factory,log)
        receipt["probe"] = build_apk("probe",arguments,factory,log)
        if arguments.journal_fixtures:
            receipt["runtimeAndroidJarSha256"]=digest(arguments.runtime_android_jar)
            receipt["platformDescriptorCheckerSha256"]=digest(SOURCE.parent/"tests/test-android-buffer-descriptors.py")
            receipt["diagnosticSourceHashes"] = {str(path.relative_to(SOURCE.parent)):digest(path)
                                                 for path in sorted((SOURCE.parent / "src").rglob("*.java"))+
                                                 sorted((SOURCE.parent / "android-probe").glob("*.java"))}
            receipt["journalFixtureHashes"] = {str(path.relative_to(arguments.journal_fixtures)):digest(path)
                                               for path in sorted(arguments.journal_fixtures.rglob("*")) if path.is_file()}
            receipt["nativeBuild"] = json.loads((arguments.journal_native / "build-receipt.json").read_text(encoding="utf-8"))
        (arguments.output / "build-receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    print(json.dumps({"result":"BUILT_SYNTHETIC_FIXTURES","receipt":str(arguments.output / "build-receipt.json")}))

if __name__ == "__main__": main()
