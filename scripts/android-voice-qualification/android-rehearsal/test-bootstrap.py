"""Runtime startup-suppression test. Installs synthetic fixtures ONLY on a checked emulator."""
import argparse
import hashlib
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

TARGET = "com.masarifi.voicequalification.fixture"
PROBE = "com.masarifi.voicequalification.rehearsal/.BootstrapRehearsal"

class LocalTripwireListener(BaseHTTPRequestHandler):
    requests = 0
    lock = threading.Lock()
    def do_GET(self):
        with self.lock: type(self).requests += 1
        self.send_response(204)
        self.end_headers()
    def log_message(self,*arguments): pass

class Emulator:
    def __init__(self,arguments,log):
        if arguments.serial != "emulator-5580" or arguments.adb_port != 15040:
            raise RuntimeError("DEDICATED_EMULATOR_AND_SERVER_REQUIRED")
        self.arguments,self.log = arguments,log
        os.environ["ADB_SERVER_SOCKET"] = "tcp:localhost:15040"
        if self.command("shell","getprop","ro.kernel.qemu").strip() != "1":
            raise RuntimeError("NOT_A_DISPOSABLE_EMULATOR")
        if self.command("shell","getprop","ro.build.version.sdk").strip() != "35":
            raise RuntimeError("ANDROID15_REQUIRED")
    def command(self,*arguments,retain_output=True):
        timeout=45
        deadline=getattr(self,"command_deadline",None)
        if deadline is not None:
            remaining=deadline-time.monotonic()
            if remaining<=0:raise RuntimeError("FRAMEWORK_PRECONDITION_DEADLINE")
            timeout=min(timeout,remaining)
        completed = subprocess.run([str(self.arguments.adb),"-P","15040","-s",self.arguments.serial,*map(str,arguments)],
                                   capture_output=True,text=True,timeout=timeout)
        if deadline is not None and time.monotonic()>=deadline:
            raise RuntimeError("FRAMEWORK_PRECONDITION_DEADLINE")
        self.log.write("COMMAND "+" ".join(map(str,arguments))+"\n"+(completed.stdout+completed.stderr if retain_output else ""))
        self.log.flush()
        if completed.returncode: raise RuntimeError("EMULATOR_COMMAND_FAILED")
        return completed.stdout
    def fixture_log(self):
        return self.command("logcat","-d","-v","raw","-s","VQSFixture:I","*:S")
    def framework_diagnostics(self):
        output=self.command("logcat","-d","-t","10000","-v","threadtime","-s",
                            "ActivityTaskManager:I","ActivityManager:I","WindowManager:I","VQSFixture:I",
                            "ThemeOverlayController:D","OverlayManager:D","*:S",retain_output=False)
        # Input is bounded; raw unrelated framework/theme records are never retained.
        if len(output)>2*1024*1024:raise RuntimeError("FRAMEWORK_DIAGNOSTICS_TOO_LARGE")
        selected=[line for line in output.splitlines() if TARGET in line or "VQSFixture" in line]
        self.log.write("SYNTHETIC_LIFECYCLE_DIAGNOSTICS\n"+"\n".join(selected[-120:])[:32768]+"\n")
        self.log.write("SYNTHETIC_FRAMEWORK_EVENTS "+json.dumps({tag:sum(tag in line for line in output.splitlines())
                       for tag in ("ThemeOverlayController","OverlayManager")})+"\n")
        self.log.write("SYNTHETIC_FRAMEWORK_STATE "+json.dumps(framework_state(self),sort_keys=True)+"\n")
        self.log.flush()

def parse_receipt(output):
    pairs = re.findall(r"^INSTRUMENTATION_RESULT: ([A-Za-z0-9]+)=(.*)$",output,re.MULTILINE)
    return dict(pairs)

def require_process_survey(observed):
    if any(observed.get(field)!="PASS_ONLY_PRIVATE_PROCESS" for field in
           ("beforeApplicationProcessSurvey","afterApplicationProcessSurvey")):
        raise RuntimeError("PROCESS_SURVEY_RUNTIME_REJECTED")

def fixture_apks(arguments):
    receipt = json.loads((arguments.build / "build-receipt.json").read_text(encoding="utf-8"))
    apks = []
    certificates = []
    for kind in ("target","probe"):
        apk = (arguments.build / kind / "fixture.apk").resolve()
        if hashlib.sha256(apk.read_bytes()).hexdigest() != receipt[kind]["sha256"]:
            raise RuntimeError("FIXTURE_APK_IDENTITY_CHANGED")
        certificates.append(re.search(r"certificate SHA-256 digest: ([0-9a-f]+)",receipt[kind]["signature"]).group(1))
        apks.append(apk)
    if certificates[0] != certificates[1] or certificates[0] == "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c":
        raise RuntimeError("SYNTHETIC_SAME_SIGNATURE_REQUIRED")
    return apks

def install_fixtures(emulator,apks):
    # Fully copy/verify both public APKs before startup. Incremental asset updates
    # can relaunch an Activity with CONFIG_ASSETS_PATHS while it is the control.
    for apk in apks:
        output=emulator.command("install","--no-incremental","--no-streaming","-r",apk)
        if not re.search(r"^Success$",output,re.MULTILINE) or "Incremental Install" in output:
            raise RuntimeError("FIXTURE_INSTALL_FAILED")

def drain_framework(emulator):
    # Android15 shell returns zero even when the application barrier gives up.
    idle=emulator.command("shell","am","wait-for-broadcast-idle","--flush-broadcast-loopers",retain_output=False)
    if "All broadcast queues are idle!" not in idle or "Gave up" in idle:
        raise RuntimeError("FRAMEWORK_BARRIER_FAILED")
    application=emulator.command("shell","am","wait-for-application-barrier",retain_output=False)
    if "Finished application barriers!" not in application or "Gave up" in application:
        raise RuntimeError("FRAMEWORK_BARRIER_FAILED")

def configuration_identity(output):
    # Only the public global configuration is hashed; process records are discarded.
    values=re.findall(r"^\s*mGlobalConfiguration: ([^\r\n]+)$",output,re.MULTILINE)
    if len(values)!=1 or len(values[0])>4096 or not values[0].startswith("{") or not values[0].endswith("}"):
        raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
    value=values[0]
    # API35 Configuration.toString includes nested winConfig={...}. Sequence
    # counters belong to the outer configuration, never the nested window state.
    depth=0;top=[]
    for index,character in enumerate(value):
        if character=="{":
            depth+=1
            if depth>4:raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
            top.append(" ")
        elif character=="}":
            depth-=1
            if depth<0 or depth==0 and index!=len(value)-1:
                raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
            top.append(" ")
        elif depth==1:top.append(character)
    if depth!=0:raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
    def sequence(prefix):
        matches=[token for token in "".join(top).split() if token.startswith(prefix+".")]
        if len(matches)>1 or matches and not re.fullmatch(prefix+r"\.[0-9]+",matches[0]):
            raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
        result=int(matches[0].split(".")[1]) if matches else 0
        if result>2147483647:raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
        return result
    return {"configurationSha256":hashlib.sha256(value.encode("utf-8")).hexdigest(),
            "assetsSequence":sequence("as"),"configurationSequence":sequence("s")}

def framework_state(emulator):
    boot=emulator.command("shell","getprop","sys.boot_completed",retain_output=False).strip()
    animation=emulator.command("shell","getprop","init.svc.bootanim",retain_output=False).strip()
    unlocked=emulator.command("shell","am","get-started-user-state","0",retain_output=False).strip()
    configuration=emulator.command("shell","dumpsys","activity","processes",retain_output=False)
    if len(configuration)>16*1024*1024:raise RuntimeError("GLOBAL_CONFIGURATION_UNAVAILABLE")
    state=configuration_identity(configuration)
    overlays=emulator.command("shell","cmd","overlay","list","--user","0","android",retain_output=False)
    if len(overlays)>65536 or not re.search(r"^android\s*$",overlays,re.MULTILINE):
        raise RuntimeError("FRAMEWORK_OVERLAY_STATE_UNAVAILABLE")
    state.update({"bootCompleted":boot=="1","bootAnimationStopped":animation=="stopped","user0Unlocked":unlocked=="RUNNING_UNLOCKED",
                  "ready":boot=="1" and animation=="stopped" and unlocked=="RUNNING_UNLOCKED",
                  "overlaySha256":hashlib.sha256(overlays.encode("utf-8")).hexdigest()})
    return state

def await_framework_quiet(emulator,receipt):
    # Boot completion alone does not drain boot-theme/background overlay work.
    # Require five consecutive identical public observations after supported drains;
    # changing/missing state fails closed within 120 seconds / 60 observations.
    previous=None;stable=0
    observed={"samples":0,"stableSamples":0,"verdict":"FAIL_FRAMEWORK_PRECONDITION"}
    receipt["frameworkPrecondition"]=observed
    emulator.command_deadline=time.monotonic()+120
    try:
        for sample in range(60):
            if time.monotonic()>=emulator.command_deadline:raise RuntimeError("FRAMEWORK_PRECONDITION_DEADLINE")
            drain_framework(emulator)
            state=framework_state(emulator)
            stable=stable+1 if state.get("ready") and state==previous else 1 if state.get("ready") else 0
            observed.update({"samples":sample+1,"stableSamples":stable,"state":state})
            emulator.log.write("SYNTHETIC_FRAMEWORK_PRECONDITION "+json.dumps(observed,sort_keys=True)+"\n");emulator.log.flush()
            if time.monotonic()>=emulator.command_deadline:raise RuntimeError("FRAMEWORK_PRECONDITION_DEADLINE")
            if stable>=5:
                observed["verdict"]="PASS_FRAMEWORK_PRECONDITION"
                return
            previous=state
            if sample<59:
                remaining=emulator.command_deadline-time.monotonic()
                if remaining<=0:raise RuntimeError("FRAMEWORK_PRECONDITION_DEADLINE")
                time.sleep(min(1,remaining))
    finally:emulator.command_deadline=None
    raise RuntimeError("FRAMEWORK_NOT_QUIESCENT")

def positive_control(emulator,receipt):
    before = emulator.fixture_log()
    emulator.command("shell","am","force-stop",TARGET)
    emulator.command("shell","am","start","-W","-n",TARGET+"/.TargetActivity")
    time.sleep(2)
    after = emulator.fixture_log()
    delta = after[len(before):] if after.startswith(before) else ""
    marks = [int(number) for number in re.findall(r"MARK=(\d+)",delta)]
    receipt["positiveControlObserved"]={"componentWrites":len(marks),"localRequests":LocalTripwireListener.requests,
                                       "applicationConstructions":delta.count("TARGET_APPLICATION_CONSTRUCTED"),
                                       "activityCreates":len(re.findall(r"COMPONENT=ACTIVITY\b",delta))}
    if len(marks) != 6 or "TARGET_APPLICATION_CONSTRUCTED" not in delta or LocalTripwireListener.requests != 6:
        raise RuntimeError("APPLICATION_PROVIDER_ACTIVITY_NETWORK_POSITIVE_CONTROL_FAILED")
    return marks[-1]

def exercise(emulator,marks,receipt):
    baseline_log = emulator.fixture_log()
    baseline_requests = LocalTripwireListener.requests
    expected_hash = ""
    for iteration in range(3):
        command = ["shell","am","instrument","-w","-r","-e","expectedMarks",str(marks)]
        # adb shell concatenates arguments: an empty extra disappears on device.
        # Omit only the first hash extra; later runs pin the first observed bytes.
        if expected_hash: command.extend(["-e","expectedHash",expected_hash])
        output = emulator.command(*command,PROBE)
        time.sleep(1)
        observed = parse_receipt(output)
        observed["newNetworkRequests"] = LocalTripwireListener.requests - baseline_requests
        receipt["runs"].append(observed)
        require_process_survey(observed)
        if observed.get("verdict") != "PASS_DISPOSABLE_BOOTSTRAP" or observed["newNetworkRequests"] != 0:
            raise RuntimeError("BOOTSTRAP_SUPPRESSION_FAILED")
        if emulator.fixture_log() != baseline_log:
            raise RuntimeError("BOOTSTRAP_CLASS_OR_COMPONENT_TRIPWIRE_FIRED")
        expected_hash = observed["fixtureSha256"]

def require_upgrade_state(value,enabled,uid,sha):
    if (value.get("enabled")!=enabled or value.get("stopped") is not True or value.get("uid")!=uid
            or value.get("apkSha256")!=sha or value.get("quiet") is not True):
        raise RuntimeError("UPGRADE_STATE_REJECTED")

def upgrade_state(emulator):
    listing=emulator.command("shell","pm","list","packages","--user","0","-U",TARGET).strip()
    match=re.fullmatch(re.escape("package:"+TARGET)+r" uid:([1-9][0-9]+)",listing)
    if not match:raise RuntimeError("UPGRADE_UID_UNKNOWN")
    uid=int(match.group(1))
    dump=emulator.command("shell","dumpsys","package",TARGET)
    rows=re.findall(r"^\s*User 0: ([^\r\n]*)$",dump,re.M)
    if len(rows)!=1:raise RuntimeError("UPGRADE_USER_STATE_UNKNOWN")
    def field(name):
        values=re.findall(r"(?:^|\s)"+name+r"=([^\s]+)",rows[0])
        if len(values)!=1:raise RuntimeError("UPGRADE_USER_STATE_UNKNOWN")
        return values[0]
    if field("installed")!="true" or field("hidden")!="false" or field("suspended")!="false":raise RuntimeError("UPGRADE_USER_STATE_UNKNOWN")
    process=emulator.command("shell","ps","-A","-o","UID,PID,NAME").splitlines()
    if not process or process[0].split()!=["UID","PID","NAME"]:raise RuntimeError("UPGRADE_PROCESS_UNKNOWN")
    quiet=True
    for row in process[1:]:
        columns=row.split(maxsplit=2)
        if len(columns)!=3 or not columns[0].isdigit() or not columns[1].isdigit():raise RuntimeError("UPGRADE_PROCESS_UNKNOWN")
        if int(columns[0])==uid or columns[2]==TARGET or columns[2].startswith(TARGET+":"):quiet=False
    path=emulator.command("shell","pm","path",TARGET).strip()
    if not re.fullmatch(r"package:/data/app/[A-Za-z0-9._~+=/-]+/base\.apk",path):raise RuntimeError("UPGRADE_PATH_UNKNOWN")
    sha=emulator.command("shell","sha256sum",path[8:]).split()[0]
    return {"enabled":int(field("enabled")),"stopped":field("stopped")=="true","uid":uid,"quiet":quiet,"apkSha256":sha}

def install_disabled_replacement(emulator,apk):
    # Android15 normally re-enables an updated package. Preserve the disabled
    # barrier atomically in the install session, never by racing a second disable.
    output=emulator.command("install","-r","--no-incremental","--no-streaming","--user","0","--skip-enable",apk)
    if not re.search(r"^Success\s*$",output,re.M):raise RuntimeError("UPGRADE_INSTALL_FAILED")

def disabled_replacement(emulator,receipt,qualify,change):
    build=emulator.arguments.build
    inputs=json.loads((build/"build-receipt.json").read_text(encoding="utf-8"))
    apk=build/"replacement/fixture.apk"
    old,new=inputs["target"]["sha256"],inputs["replacement"]["sha256"]
    if old==new or hashlib.sha256(apk.read_bytes()).hexdigest()!=new:raise RuntimeError("UPGRADE_ARTIFACT_UNKNOWN")
    signatures=[re.findall(r"certificate SHA-256 digest: ([0-9a-f]+)",inputs[key]["signature"]) for key in ("target","replacement")]
    if len(signatures[0])!=1 or signatures[0]!=signatures[1] or signatures[0][0]=="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c":raise RuntimeError("UPGRADE_SYNTHETIC_SIGNATURE_REQUIRED")
    baseline_log=emulator.fixture_log();baseline_requests=LocalTripwireListener.requests
    emulator.command("shell","am","force-stop",TARGET)
    initial=upgrade_state(emulator);uid=initial["uid"]
    require_upgrade_state(initial,0,uid,old)
    observed=receipt["disabledReplacement"]={"verdict":"FAIL_DISABLED_REPLACEMENT","beforeApkSha256":old,"afterApkSha256":new}
    try:
        change(3);require_upgrade_state(upgrade_state(emulator),3,uid,old)
        qualify("preReplacementRuns",3)
        # The private diagnostic is explicitly stopped before replacement.
        emulator.command("shell","am","force-stop",TARGET)
        emulator.command("shell","am","force-stop","com.masarifi.voicequalification.rehearsal")
        require_upgrade_state(upgrade_state(emulator),3,uid,old)
        install_disabled_replacement(emulator,apk)
        drain_framework(emulator)
        require_upgrade_state(upgrade_state(emulator),3,uid,new)
        qualify("postReplacementRuns",3)
    finally:
        emulator.command("shell","am","force-stop",TARGET)
        emulator.command("shell","am","force-stop","com.masarifi.voicequalification.rehearsal")
        current=upgrade_state(emulator)
        if current["apkSha256"] not in (old,new):raise RuntimeError("UPGRADE_CLEANUP_IDENTITY_UNKNOWN")
        require_upgrade_state(current,3,uid,current["apkSha256"])
        change(0);drain_framework(emulator)
        require_upgrade_state(upgrade_state(emulator),0,uid,current["apkSha256"])
    if emulator.fixture_log()!=baseline_log or LocalTripwireListener.requests!=baseline_requests:raise RuntimeError("UPGRADE_STARTUP_EFFECT")
    observed.update(verdict="PASS_DISABLED_REPLACEMENT",uidUnchanged=True,exactPackageStateRestored=True,
                    journalFingerprintUnchanged=True,newNetworkRequests=0,startupTripwireUnchanged=True)

def encrypted_journals(emulator, receipt, replacement=True):
    probe = "com.masarifi.voicequalification.rehearsal/com.masarifi.voicequalification.EncryptedJournalRehearsal"
    baseline_log = emulator.fixture_log()
    baseline_requests = LocalTripwireListener.requests
    seeded = parse_receipt(emulator.command("shell", "am", "instrument", "-w", "-r", "-e", "mode", "seed", probe))
    receipt["encryptedJournals"] = {"seed": seeded, "runs": []}
    if (seeded.get("verdict") != "SEEDED_PUBLIC_SYNTHETIC_FIXTURES" or seeded.get("missingExistingAliasesFailClosed") != "true"
            or seeded.get("androidRollbackJournalCases") != "4" or seeded.get("packageState") != "0" or seeded.get("applicationEnabled") != "true"):
        raise RuntimeError("SYNTHETIC_JOURNAL_SEED_FAILED")
    fingerprint = None
    def qualify(destination, state):
        nonlocal fingerprint
        observed = parse_receipt(emulator.command("shell", "am", "instrument", "-w", "-r", "-e", "mode", "qualify", probe))
        receipt["encryptedJournals"].setdefault(destination, []).append(observed)
        if observed.get("packageState") != str(state) or observed.get("applicationEnabled") != str(state != 3).lower():
            raise RuntimeError("SYNTHETIC_PACKAGE_STATE_CHANGED")
        if observed.get("launchAdmissionCases") != "38" or observed.get("launchAdmissionVersion") != "3" or observed.get("admissionCases") != "38" or observed.get("readerStageCases") != "25" or observed.get("qualificationStageCases") != "19" or observed.get("workSummaryCases") != "38": raise RuntimeError("READER_STAGE_REPORTING_FAILED")
        if observed.get("verdict") != "PASS_DISPOSABLE_ENCRYPTED_JOURNALS" or observed.get("cases") != "57":
            raise RuntimeError("ENCRYPTED_JOURNAL_QUALIFICATION_FAILED")
        if not re.fullmatch("[0-9a-f]{64}", observed.get("fixtureFingerprint", "")):
            raise RuntimeError("SYNTHETIC_FINGERPRINT_MISSING")
        if fingerprint and fingerprint != observed["fixtureFingerprint"]: raise RuntimeError("SYNTHETIC_FILES_CHANGED")
        fingerprint = observed["fixtureFingerprint"]
        if emulator.fixture_log() != baseline_log or LocalTripwireListener.requests != baseline_requests:
            raise RuntimeError("ENCRYPTED_DIAGNOSTIC_STARTUP_EFFECT")
    for iteration in range(3):
        qualify("runs", 0)
    # Reuse the exact disposable recovery-window implementation, with this
    # independently seeded encrypted target. No physical-device entry point.
    spec = importlib.util.spec_from_file_location("broadcast_window", Path(__file__).resolve().parent.parent / "android-process-lab/test-broadcast-lab.py")
    window = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(window)
    def change(state):
        command, expected = {0: ("default-state", "default"), 3: ("disable-user", "disabled-user")}[state]
        response = emulator.command("shell", "pm", command, "--user", "0", TARGET)
        if response.strip() != "Package " + TARGET + " new state: " + expected:
            raise RuntimeError("SYNTHETIC_PACKAGE_STATE_CHANGED")
    def disabled_runs():
        for iteration in range(3): qualify("disabledRuns", 3)
    window.package_window(0, change, lambda: emulator.command("shell", "am", "force-stop", TARGET), disabled_runs)
    qualify("restoredRuns", 0)
    if replacement:
        disabled_replacement(emulator,receipt,qualify,change)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adb",type=Path,required=True)
    parser.add_argument("--adb-port",type=int,required=True)
    parser.add_argument("--serial",required=True)
    parser.add_argument("--build",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--encrypted-journals",action="store_true")
    arguments = parser.parse_args()
    arguments.output.mkdir(parents=True,exist_ok=False)
    receipt = {"realRedmiQualification":False,"fixtureOnly":True,"runs":[],"result":"FAIL"}
    emulator=None
    with (arguments.output / "runtime.log").open("w",encoding="utf-8") as log:
        try:
            emulator = Emulator(arguments,log)
            apks = fixture_apks(arguments)
            with ThreadingHTTPServer(("127.0.0.1",34861),LocalTripwireListener) as listener:
                threading.Thread(target=listener.serve_forever,daemon=True).start()
                install_fixtures(emulator,apks)
                await_framework_quiet(emulator,receipt)
                marks = positive_control(emulator,receipt)
                receipt["positiveControl"] = {"componentWrites":6,"localRequests":6,"nonDebuggableTarget":True}
                exercise(emulator,marks,receipt)
                if arguments.encrypted_journals:
                    encrypted_journals(emulator,receipt)
                receipt["result"] = "PASS_DISPOSABLE_ANDROID15_BOOTSTRAP"
                listener.shutdown()
        except Exception:
            if emulator is not None:
                try: emulator.framework_diagnostics()
                except Exception: log.write("SYNTHETIC_FRAMEWORK_DIAGNOSTICS_UNAVAILABLE\n")
            raise
        finally:
            (arguments.output / "runtime-receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    print(json.dumps(receipt))

if __name__ == "__main__": main()
