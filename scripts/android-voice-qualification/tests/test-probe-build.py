"""Offline build gates only. No signing key, real private data or device calls."""
import copy
import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("private_probe_build",Path(__file__).resolve().parents[1]/"android-probe/build-probe.py")
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

class ProbeBuildGates(unittest.TestCase):
    def test_runtime_provenance_binds_the_actual_target_wrapper(self):
        wrapper="android-probe/PrivateJournalDiagnostic.java"
        self.assertIn(wrapper,build.source_hashes())
        native=build.native_contract("arm64-v8a")
        native["libraries"]={"libcrypto.so":"a"*64,"libvoice_private_reader.so":"b"*64}
        runtime_native=build.native_contract("x86_64")
        runtime_native["libraries"]=dict(native["libraries"])
        evidence={"sourceHashes":build.rehearsal_hashes(),"diagnosticSourceHashes":build.source_hashes(),"nativeBuild":runtime_native,
                  "runtimeAndroidJarSha256":build.ANDROID35_JAR_SHA,"platformDescriptorCheckerSha256":build.digest(build.ROOT/"tests/test-android-buffer-descriptors.py")}
        evidence["diagnosticSourceHashes"][wrapper]="0"*64
        with self.assertRaisesRegex(RuntimeError,"PROBE_BUILD_GATE"):
            build.validate_provenance(native,evidence)

    def test_exact_native_and_rehearsal_provenance_is_required(self):
        native=build.native_contract("arm64-v8a")
        native["libraries"]={"libcrypto.so":"a"*64,"libvoice_private_reader.so":"b"*64}
        runtime_native=build.native_contract("x86_64")
        runtime_native["libraries"]=dict(native["libraries"])
        rehearsal={"sourceHashes":build.rehearsal_hashes(),"diagnosticSourceHashes":build.source_hashes(),"nativeBuild":runtime_native,
                   "runtimeAndroidJarSha256":build.ANDROID35_JAR_SHA,"platformDescriptorCheckerSha256":build.digest(build.ROOT/"tests/test-android-buffer-descriptors.py")}
        build.validate_provenance(native,rehearsal)
        bad=[]
        for key in ("builderSha256","configuration","sqlcipherSources","opensslAarSha256","sources"):
            altered=copy.deepcopy(native);altered[key]={} if isinstance(altered[key],dict) else "changed";bad.append((altered,rehearsal))
        altered=copy.deepcopy(native);altered["configuration"]["compileFlags"].append("-DVQS_TEST=1");bad.append((altered,rehearsal))
        altered=copy.deepcopy(native);altered["sources"].pop("voice_memory_jni.c");bad.append((altered,rehearsal))
        altered=copy.deepcopy(native);altered["sources"]["unexpected.c"]="a"*64;bad.append((altered,rehearsal))
        for key in ("sourceHashes","diagnosticSourceHashes","nativeBuild","runtimeAndroidJarSha256","platformDescriptorCheckerSha256"):
            altered=copy.deepcopy(rehearsal);altered[key]={};bad.append((native,altered))
        altered=copy.deepcopy(rehearsal);altered["sourceHashes"]["journal/EncryptedJournalRehearsal.java"]="a"*64;bad.append((native,altered))
        altered=copy.deepcopy(rehearsal);altered["nativeBuild"]["configuration"]["linkFlags"].append("-lunsafe");bad.append((native,altered))
        for index,(library,evidence) in enumerate(bad):
            with self.subTest(case=index),self.assertRaisesRegex(RuntimeError,"PROBE_BUILD_GATE"):
                build.validate_provenance(library,evidence)
    def test_real_manifest_is_exact_and_has_no_permission_or_extra_component(self):
        build.validate_manifest(build.HERE/"AndroidManifest.xml")

    def test_missing_incomplete_or_false_runtime_evidence_cannot_qualify_packaging(self):
        seed={"androidRollbackJournalCases":"4","verdict":"SEEDED_PUBLIC_SYNTHETIC_FIXTURES","missingExistingAliasesFailClosed":"true"}
        run={"verdict":"PASS_DISPOSABLE_ENCRYPTED_JOURNALS","cases":"57","readerStageCases":"25","qualificationStageCases":"19","workSummaryCases":"38","admissionCases":"38","launchAdmissionCases":"38","launchAdmissionVersion":"3","fixtureFingerprint":"a"*64}
        runtime={"result":"PASS_DISPOSABLE_ANDROID15_BOOTSTRAP","fixtureOnly":True,"realRedmiQualification":False,
                 "positiveControl":{"componentWrites":6,"localRequests":6,"nonDebuggableTarget":True},
                 "runs":[{"verdict":"PASS_DISPOSABLE_BOOTSTRAP","newNetworkRequests":0,
                          "beforeApplicationProcessSurvey":"PASS_ONLY_PRIVATE_PROCESS",
                          "afterApplicationProcessSurvey":"PASS_ONLY_PRIVATE_PROCESS"} for _ in range(3)],
                 "encryptedJournals":{"seed":seed,"runs":[dict(run) for _ in range(3)]}}
        runtime["disabledReplacement"]={"verdict":"PASS_DISABLED_REPLACEMENT","beforeApkSha256":"a"*64,"afterApkSha256":"b"*64,
            "uidUnchanged":True,"exactPackageStateRestored":True,"journalFingerprintUnchanged":True,"newNetworkRequests":0,"startupTripwireUnchanged":True}
        for phase,count in (("disabledRuns",3),("restoredRuns",1),("preReplacementRuns",1),("postReplacementRuns",1)):
            runtime["encryptedJournals"][phase]=[dict(run) for _ in range(count)]
        build.validate_runtime(runtime)
        bad=[{},dict(runtime,result="FAIL"),dict(runtime,realRedmiQualification=True),dict(runtime,fixtureOnly=False),
             dict(runtime,runs=[]),dict(runtime,positiveControl={}),dict(runtime,encryptedJournals={})]
        for key,value in (("launchAdmissionCases","0"),("launchAdmissionVersion","2"),("admissionCases","0"),("workSummaryCases","0"),("qualificationStageCases","0"),("readerStageCases","0"),("cases","42"),("qualificationStageCases","16"),("verdict","INDETERMINATE_SYNTHETIC_JOURNALS"),("fixtureFingerprint","unknown")):
            case=copy.deepcopy(runtime);case["encryptedJournals"]["runs"][0][key]=value;bad.append(case)
        for phase in ("runs","disabledRuns","restoredRuns","preReplacementRuns","postReplacementRuns"):
            for field in ("launchAdmissionCases","launchAdmissionVersion"):
                case=copy.deepcopy(runtime);del case["encryptedJournals"][phase][0][field];bad.append(case)
        case=copy.deepcopy(runtime);case["encryptedJournals"]["runs"][0]["fixtureFingerprint"]="b"*64;bad.append(case)
        case=copy.deepcopy(runtime);case["encryptedJournals"]["seed"]["missingExistingAliasesFailClosed"]="false";bad.append(case)
        case=copy.deepcopy(runtime);case["encryptedJournals"]["seed"].pop("androidRollbackJournalCases");bad.append(case)
        case=copy.deepcopy(runtime);case["runs"][1]["newNetworkRequests"]=1;bad.append(case)
        for index in range(3):
            for field in ("beforeApplicationProcessSurvey","afterApplicationProcessSurvey"):
                case=copy.deepcopy(runtime);case["runs"][index].pop(field);bad.append(case)
                case=copy.deepcopy(runtime);case["runs"][index][field]="PROCESS_SELF_MISSING";bad.append(case)
        for evidence in bad:
            with self.subTest(evidence_number=bad.index(evidence)),self.assertRaisesRegex(RuntimeError,"PROBE_BUILD_GATE"):
                build.validate_runtime(evidence)

if __name__=="__main__":unittest.main()
