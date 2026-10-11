"""Runtime startup-suppression test. Installs synthetic fixtures ONLY on a checked emulator."""
import argparse
import hashlib
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
        completed = subprocess.run([str(self.arguments.adb),"-P","15040","-s",self.arguments.serial,*map(str,arguments)],
                                   capture_output=True,text=True,timeout=45)
        self.log.write("COMMAND "+" ".join(map(str,arguments))+"\n"+(completed.stdout+completed.stderr if retain_output else ""))
        self.log.flush()
        if completed.returncode: raise RuntimeError("EMULATOR_COMMAND_FAILED")
        return completed.stdout
    def fixture_log(self):
        return self.command("logcat","-d","-v","raw","-s","VQSFixture:I","*:S")
    def framework_diagnostics(self):
        output=self.command("logcat","-d","-t","400","-v","threadtime","-s",
                            "ActivityTaskManager:I","ActivityManager:I","WindowManager:I","VQSFixture:I","*:S",retain_output=False)
        # Public synthetic package only. No unrelated framework records or Bundle/configuration contents.
        selected=[line for line in output.splitlines() if TARGET in line or "VQSFixture" in line]
        self.log.write("SYNTHETIC_LIFECYCLE_DIAGNOSTICS\n"+"\n".join(selected[-120:])[:32768]+"\n")
        self.log.flush()

def parse_receipt(output):
    pairs = re.findall(r"^INSTRUMENTATION_RESULT: ([A-Za-z0-9]+)=(.*)$",output,re.MULTILINE)
    return dict(pairs)

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
        if observed.get("verdict") != "PASS_DISPOSABLE_BOOTSTRAP" or observed["newNetworkRequests"] != 0:
            raise RuntimeError("BOOTSTRAP_SUPPRESSION_FAILED")
        if emulator.fixture_log() != baseline_log:
            raise RuntimeError("BOOTSTRAP_CLASS_OR_COMPONENT_TRIPWIRE_FIRED")
        expected_hash = observed["fixtureSha256"]

def encrypted_journals(emulator, receipt):
    probe = "com.masarifi.voicequalification.rehearsal/com.masarifi.voicequalification.EncryptedJournalRehearsal"
    baseline_log = emulator.fixture_log()
    baseline_requests = LocalTripwireListener.requests
    seeded = parse_receipt(emulator.command("shell", "am", "instrument", "-w", "-r", "-e", "mode", "seed", probe))
    receipt["encryptedJournals"] = {"seed": seeded, "runs": []}
    if seeded.get("verdict") != "SEEDED_PUBLIC_SYNTHETIC_FIXTURES" or seeded.get("missingExistingAliasesFailClosed") != "true":
        raise RuntimeError("SYNTHETIC_JOURNAL_SEED_FAILED")
    fingerprint = None
    for iteration in range(3):
        observed = parse_receipt(emulator.command("shell", "am", "instrument", "-w", "-r", "-e", "mode", "qualify", probe))
        receipt["encryptedJournals"]["runs"].append(observed)
        if observed.get("verdict") != "PASS_DISPOSABLE_ENCRYPTED_JOURNALS" or int(observed.get("cases", "0")) < 30:
            raise RuntimeError("ENCRYPTED_JOURNAL_QUALIFICATION_FAILED")
        if not re.fullmatch("[0-9a-f]{64}", observed.get("fixtureFingerprint", "")):
            raise RuntimeError("SYNTHETIC_FINGERPRINT_MISSING")
        if fingerprint and fingerprint != observed["fixtureFingerprint"]: raise RuntimeError("SYNTHETIC_FILES_CHANGED")
        fingerprint = observed["fixtureFingerprint"]
        if emulator.fixture_log() != baseline_log or LocalTripwireListener.requests != baseline_requests:
            raise RuntimeError("ENCRYPTED_DIAGNOSTIC_STARTUP_EFFECT")

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
