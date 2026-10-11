"""Build two synthetic same-signature APKs. Never use the Masarifi signing key."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

SOURCE = Path(__file__).resolve().parent
EXECUTABLE_SUFFIX = ".exe" if os.name == "nt" else ""

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
    sources = sorted((SOURCE / kind).glob("*.java"))
    android_jar = arguments.sdk / "platforms/android-36/android.jar"
    tools = arguments.sdk / "build-tools/35.0.0"
    checked([executable(arguments.java / "bin","javac"),"-encoding","UTF-8","-source","17","-target","17",
             "-classpath",android_jar,"-d",classes,*sources],log)
    dex = output / "dex"
    dex.mkdir()
    dex_inputs = sorted(classes.rglob("*.class"))
    if kind == "target": dex_inputs.append(factory)
    checked([executable(arguments.java / "bin","java"),"-cp",tools / "lib/d8.jar","com.android.tools.r8.D8",
             "--min-api","35","--lib",android_jar,"--output",dex,*dex_inputs],log)
    unsigned = output / "unsigned.apk"
    checked([executable(tools,"aapt2"),"link","-I",android_jar,"--manifest",SOURCE / kind / "AndroidManifest.xml",
             "-o",unsigned],log)
    with zipfile.ZipFile(unsigned,"a",compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in sorted(dex.glob("*.dex")): archive.write(entry,entry.name)
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
    arguments = parser.parse_args()
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
        receipt["target"] = build_apk("target",arguments,factory,log)
        receipt["probe"] = build_apk("probe",arguments,factory,log)
        (arguments.output / "build-receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    print(json.dumps({"result":"BUILT_SYNTHETIC_FIXTURES","receipt":str(arguments.output / "build-receipt.json")}))

if __name__ == "__main__": main()
