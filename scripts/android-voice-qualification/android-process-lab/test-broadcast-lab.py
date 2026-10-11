"""Disposable broadcast-start investigation, never a physical-device runner."""
import argparse
import importlib.util
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('process_lab', HERE / 'test-process-lab.py')
process_lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(process_lab)
bootstrap = process_lab.bootstrap
TARGET = process_lab.TARGET
PROBE = 'com.masarifi.voicequalification.processlab/.BroadcastSurvey'
PASS = 'PASS_ONLY_PRIVATE_PROCESS'
MAIN = 'PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=TARGET_MAIN'

def package_window(original, change, stop, operation):
    if type(original) is not int or original not in (0, 1):
        raise RuntimeError('PACKAGE_PRIOR_STATE_UNKNOWN')
    try:
        change(3)
        return operation()
    finally:
        # Never re-enable components if stopping the synthetic package failed.
        stop()
        change(original)

def validate(value, protected):
    require(set(value) == {'initialSurvey', 'finalSurvey', 'peerSamples', 'packageState', 'applicationEnabled', 'verdict'})
    require(value['verdict'] == 'PASS_BROADCAST_OBSERVATION')
    require(value['initialSurvey'] in (PASS, MAIN) and value['finalSurvey'] in (PASS, MAIN))
    require(re.fullmatch(r'0|[1-9]|1[0-9]|2[0-6]', value['peerSamples']) is not None)
    if protected:
        require(value['packageState'] == '3' and value['applicationEnabled'] == 'false' and value['initialSurvey'] == PASS and
                value['finalSurvey'] == PASS and value['peerSamples'] == '0')
    else:
        require(value['packageState'] in ('0', '1') and value['applicationEnabled'] == 'true' and
                value['finalSurvey'] == MAIN and int(value['peerSamples']) > 0)
    return value

def require(condition):
    if not condition:
        raise RuntimeError('BROADCAST_EVIDENCE_INVALID')

def parse(output):
    require(len(output.encode()) <= 16384)
    pairs = []; codes = []
    for line in output.splitlines():
        if not line.strip(): continue
        pair = re.fullmatch(r'INSTRUMENTATION_RESULT: ([A-Za-z]+)=(.*)', line)
        code = re.fullmatch(r'INSTRUMENTATION_CODE: (-?\d+)\s*', line)
        if pair: pairs.append(pair.groups())
        elif code: codes.append(code[1])
        else: require(False)
    require(len(pairs) == len(dict(pairs)) and codes == ['-1'])
    return dict(pairs)

def change_package(emulator, state):
    command, expected = {0: ('default-state', 'default'), 1: ('enable', 'enabled'), 3: ('disable-user', 'disabled-user')}[state]
    response = emulator.command('shell', 'pm', command, '--user', '0', TARGET)
    require(response.strip() == 'Package ' + TARGET + ' new state: ' + expected)

def boot_count(emulator):
    output = emulator.command('logcat', '-d', '-v', 'raw', '-s', 'VQSBroadcastLab:I', '*:S')
    require(len(output.encode()) <= 16384 and 'UNEXPECTED_ACTION' not in output)
    return output.count('BOOT_RECEIVER_DELIVERED')

def observe(emulator, protected):
    before = boot_count(emulator)
    emulator.command('shell', 'am', 'force-stop', TARGET)
    result = validate(parse(emulator.command('shell', 'am', 'instrument', '-w', '-r', PROBE)), protected)
    delta = boot_count(emulator) - before
    require(delta == (0 if protected else 2))
    return {**result, 'bootDeliveries': delta}

def main():
    parser = argparse.ArgumentParser()
    for name in ('adb', 'build', 'output'): parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--adb-port', type=int, required=True)
    parser.add_argument('--serial', required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {'fixtureOnly': True, 'realRedmiQualification': False, 'noJournalOrKeyAccess': True,
               'runs': [], 'result': 'FAIL'}
    build = json.loads((args.build / 'build-receipt.json').read_text())
    require(build.get('broadcastLab') is True)
    expected = {str(p.relative_to(HERE)): bootstrap.hashlib.sha256(p.read_bytes()).hexdigest()
                for p in HERE.rglob('*') if p.is_file() and p.suffix in ('.py', '.java', '.xml')}
    require(build['processLabSourceHashes'] == expected)
    shared = ('android-probe/AndroidProcessSurvey.java', 'src/com/masarifi/voicequalification/PrivateProbeFailure.java',
              'src/com/masarifi/voicequalification/PrivateProbeProcessPolicy.java')
    require(build['sharedGuardSourceHashes'] == {name: bootstrap.hashlib.sha256((HERE.parent / name).read_bytes()).hexdigest()
                                               for name in shared})
    with (args.output / 'runtime.log').open('w', encoding='utf-8') as log:
        emulator = bootstrap.Emulator(args, log)
        try:
            bootstrap.install_fixtures(emulator, bootstrap.fixture_apks(args))
            for original in (0, 1, 0):
                change_package(emulator, original)
                before = observe(emulator, protected=False)
                require(before['packageState'] == str(original))
                fixed = package_window(original, lambda state: change_package(emulator, state),
                                       lambda: emulator.command('shell', 'am', 'force-stop', TARGET),
                                       lambda: observe(emulator, protected=True))
                restored = observe(emulator, protected=False)
                require(restored['packageState'] == str(original))
                receipt['runs'].append({'enabled': before, 'protected': fixed, 'restored': restored})
            receipt['result'] = 'PASS_DISPOSABLE_BROADCAST_WINDOW'
        finally:
            try:
                emulator.command('shell', 'am', 'force-stop', TARGET)
                change_package(emulator, 0)
            except Exception:
                receipt['result'] = 'FAIL_FIXTURE_CLEANUP'
                raise
            finally:
                (args.output / 'runtime-receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))

if __name__ == '__main__': main()
