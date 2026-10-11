"""Offline production-probe compilation/signing. Contains no device/ADB operations."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
CERT="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"
TARGET_SHA="0c0dd12035bd22eeb6f45b1597731462b967533cb394a23d3f9430a0d7a78685"
ANDROID="{http://schemas.android.com/apk/res/android}"
ANDROID35_JAR_SHA="4566663c3876e022b4fa4ced8c8697c4ab1688267f090114fd92d027b32e619b"

def gate(condition):
    if not condition:raise RuntimeError("PROBE_BUILD_GATE")

def digest(path):
    value=hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda:source.read(65536),b""):value.update(chunk)
    return value.hexdigest()

def source_hashes():
    return {path.relative_to(ROOT).as_posix():digest(path) for path in sorted((ROOT/"src").rglob("*.java"))}

def rehearsal_hashes():
    rehearsal=ROOT/"android-rehearsal"
    return {path.relative_to(rehearsal).as_posix():digest(path) for path in sorted(rehearsal.rglob("*")) if path.is_file() and path.suffix in (".java",".xml",".py")}

def native_contract(abi):
    gate(abi in ("arm64-v8a","x86_64"))
    spec=importlib.util.spec_from_file_location("pinned_native_builder",ROOT/"android-rehearsal/build-native.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.native_contract(abi)

def validate_native_metadata(native):
    gate(isinstance(native,dict))
    contract=native_contract(native.get("abi"))
    gate(set(native)==set(contract)|{"libraries"})
    for name,value in contract.items():gate(native.get(name)==value)
    gate(isinstance(native.get("libraries"),dict) and set(native["libraries"])=={"libcrypto.so","libvoice_private_reader.so"})
    gate(all(isinstance(sha,str) and re.fullmatch("[0-9a-f]{64}",sha) for sha in native["libraries"].values()))

def validate_provenance(native,runtime_build):
    validate_native_metadata(native)
    gate(isinstance(runtime_build,dict) and runtime_build.get("sourceHashes")==rehearsal_hashes() and runtime_build.get("diagnosticSourceHashes")==source_hashes())
    gate(runtime_build.get("runtimeAndroidJarSha256")==ANDROID35_JAR_SHA and
         runtime_build.get("platformDescriptorCheckerSha256")==digest(ROOT/"tests/test-android-buffer-descriptors.py"))
    validate_native_metadata(runtime_build.get("nativeBuild"))

def validate_manifest(path):
    root=ET.parse(path).getroot()
    gate(root.tag=="manifest" and root.attrib=={"package":"com.masarifi.voicequalification.diagnostic",ANDROID+"versionCode":"1",ANDROID+"versionName":"1.0"})
    expected={"uses-sdk":{ANDROID+"minSdkVersion":"35",ANDROID+"targetSdkVersion":"35"},
              "application":{ANDROID+"name":"android.app.Application",ANDROID+"debuggable":"false",ANDROID+"allowBackup":"false",ANDROID+"extractNativeLibs":"true",ANDROID+"hasCode":"true"},
              "instrumentation":{ANDROID+"name":"com.masarifi.voicequalification.PrivateJournalDiagnostic",ANDROID+"targetPackage":"com.masarifi.mobile",ANDROID+"targetProcesses":"com.masarifi.mobile:voicequalify",ANDROID+"functionalTest":"false",ANDROID+"handleProfiling":"false"}}
    gate(len(root)==3 and set(child.tag for child in root)==set(expected))
    for child in root:gate(child.attrib==expected[child.tag] and len(child)==0)

def validate_runtime(runtime):
    gate(runtime.get("result")=="PASS_DISPOSABLE_ANDROID15_BOOTSTRAP" and runtime.get("fixtureOnly") is True and runtime.get("realRedmiQualification") is False)
    gate(runtime.get("positiveControl")=={"componentWrites":6,"localRequests":6,"nonDebuggableTarget":True})
    runs=runtime.get("runs",[])
    gate(len(runs)==3 and all(run.get("verdict")=="PASS_DISPOSABLE_BOOTSTRAP" and run.get("newNetworkRequests")==0 for run in runs))
    encrypted=runtime.get("encryptedJournals",{})
    gate(encrypted.get("seed",{}).get("verdict")=="SEEDED_PUBLIC_SYNTHETIC_FIXTURES" and encrypted.get("seed",{}).get("missingExistingAliasesFailClosed")=="true")
    runs=encrypted.get("runs",[])
    gate(len(runs)==3 and all(run.get("verdict")=="PASS_DISPOSABLE_ENCRYPTED_JOURNALS" and run.get("cases")=="42" and re.fullmatch("[0-9a-f]{64}",run.get("fixtureFingerprint","")) for run in runs))
    gate(len(set(run["fixtureFingerprint"] for run in runs))==1)

def checked(command,log):
    result=subprocess.run(list(map(str,command)),capture_output=True,text=True,timeout=180)
    log.write(result.stdout+result.stderr);log.flush()
    gate(result.returncode==0)
    return result.stdout+result.stderr

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--sdk",type=Path,required=True)
    parser.add_argument("--java",type=Path,required=True)
    parser.add_argument("--native",type=Path,required=True)
    parser.add_argument("--runtime-android-jar",type=Path,required=True)
    parser.add_argument("--sign",action="store_true")
    parser.add_argument("--historical-target-apk",type=Path)
    parser.add_argument("--keystore",type=Path)
    parser.add_argument("--password-env")
    parser.add_argument("--runtime-directory",type=Path)
    args=parser.parse_args()
    gate(digest(args.runtime_android_jar)==ANDROID35_JAR_SHA)
    validate_manifest(HERE/"AndroidManifest.xml")
    native=json.loads((args.native/"build-receipt.json").read_text(encoding="utf-8"))
    validate_native_metadata(native)
    for name,sha in native["sources"].items():gate(digest(ROOT/"native"/name)==sha)
    for name,sha in native["libraries"].items():gate(digest(args.native/name)==sha)
    if args.sign:
        gate(native["abi"]=="arm64-v8a" and args.historical_target_apk and args.keystore and args.password_env and args.runtime_directory)
        gate(args.password_env in os.environ and digest(args.historical_target_apk)==TARGET_SHA)
        validate_runtime(json.loads((args.runtime_directory/"runtime/runtime-receipt.json").read_text(encoding="utf-8")))
        runtime_build=json.loads((args.runtime_directory/"build/build-receipt.json").read_text(encoding="utf-8"))
        validate_provenance(native,runtime_build)
    args.output.mkdir(parents=True,exist_ok=False)
    os.environ["TEMP"]=str(args.output);os.environ["TMP"]=str(args.output)
    tools=args.sdk/"build-tools/35.0.0";android_jar=args.sdk/"platforms/android-36/android.jar"
    suffix=".exe" if os.name=="nt" else ""
    java=args.java/"bin"/("java"+suffix)
    classes=args.output/"classes";classes.mkdir()
    dex=args.output/"dex";dex.mkdir()
    sources=sorted((ROOT/"src").rglob("*.java"))+[HERE/"PrivateJournalDiagnostic.java"]
    with (args.output/"build.log").open("w",encoding="utf-8") as log:
        checked([args.java/"bin"/("javac"+suffix),"-encoding","UTF-8","-source","17","-target","17","-classpath",android_jar,"-d",classes,*sources],log)
        checked([sys.executable,ROOT/"tests/test-android-buffer-descriptors.py","--android-jar",args.runtime_android_jar,"--classes",classes],log)
        checked([java,"-Djava.io.tmpdir="+str(args.output),"-cp",tools/"lib/d8.jar","com.android.tools.r8.D8","--min-api","35","--lib",android_jar,"--output",dex,*sorted(classes.rglob("*.class"))],log)
        for entry in sorted(dex.glob("*.dex")):
            checked([sys.executable,ROOT/"tests/test-android-buffer-descriptors.py","--android-jar",args.runtime_android_jar,"--dex",entry],log)
        unsigned=args.output/"unsigned-probe.apk"
        checked([tools/("aapt2"+suffix),"link","-I",android_jar,"--manifest",HERE/"AndroidManifest.xml","-o",unsigned],log)
        with zipfile.ZipFile(unsigned,"a",compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(dex.glob("*.dex")):archive.write(path,path.name)
            for name in native["libraries"]:archive.write(args.native/name,"lib/"+native["abi"]+"/"+name)
        aligned=args.output/"aligned-probe.apk"
        checked([tools/("zipalign"+suffix),"-p","4",unsigned,aligned],log)
        apk=aligned;signature=None
        if args.sign:
            signer=[java,"-Djava.io.tmpdir="+str(args.output),"-jar",tools/"lib/apksigner.jar"]
            target_signature=checked([*signer,"verify","--verbose","--print-certs",args.historical_target_apk],log)
            gate(re.findall(r"certificate SHA-256 digest: ([0-9a-f]+)",target_signature)==[CERT])
            apk=args.output/"private-journal-diagnostic.apk"
            checked([*signer,"sign","--ks",args.keystore,"--ks-key-alias","androiddebugkey","--ks-pass","env:"+args.password_env,"--key-pass","env:"+args.password_env,"--out",apk,aligned],log)
            signature=checked([*signer,"verify","--verbose","--print-certs",apk],log)
            gate(re.findall(r"certificate SHA-256 digest: ([0-9a-f]+)",signature)==[CERT])
        manifest=checked([tools/("aapt2"+suffix),"dump","xmltree",apk,"--file","AndroidManifest.xml"],log)
        gate(set(re.findall(r"E: ([a-zA-Z-]+)",manifest))=={"manifest","uses-sdk","application","instrumentation"})
        (args.output/"manifest.txt").write_text(manifest,encoding="utf-8")
        with zipfile.ZipFile(apk) as archive:
            gate(all(name=="AndroidManifest.xml" or name=="resources.arsc" or re.fullmatch("classes[0-9]*\\.dex",name) or name in {"lib/"+native["abi"]+"/"+lib for lib in native["libraries"]} or name.startswith("META-INF/") for name in archive.namelist()))
        receipt={"qualification":"OFFLINE_PROBE_REVIEW_ONLY","installed":False,"executed":False,"realTargetRuntimeAcceptance":False,"signed":args.sign,
                 "runtimeAndroidJarSha256":digest(args.runtime_android_jar),"platformDescriptorCheckerSha256":digest(ROOT/"tests/test-android-buffer-descriptors.py"),
                 "apk":str(apk),"apkSha256":digest(apk),"signature":signature,"targetPackage":"com.masarifi.mobile","process":"com.masarifi.mobile:voicequalify",
                 "historicalTargetApkSha256":TARGET_SHA,"certificateSha256":CERT,"diagnosticSourceHashes":source_hashes(),
                 "probeSourceHashes":{path.name:digest(path) for path in (HERE/"PrivateJournalDiagnostic.java",HERE/"AndroidManifest.xml",Path(__file__))},"nativeBuild":native}
        (args.output/"build-receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    print(json.dumps({"result":"OFFLINE_SIGNED_PROBE_REVIEW_ONLY" if args.sign else "OFFLINE_UNSIGNED_PROBE_COMPILED","apkSha256":receipt["apkSha256"],"installed":False,"executed":False}))

if __name__=="__main__":main()
