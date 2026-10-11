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
COMPONENT = TARGET + '/' + TARGET + '.BootReceiver'
PROBE = 'com.masarifi.voicequalification.processlab/.BroadcastSurvey'
PASS = 'PASS_ONLY_PRIVATE_PROCESS'
MAIN = 'PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=TARGET_MAIN'

def receiver_window(original, change, operation):
    if type(original) is not int or original not in (0, 1, 2):
        raise RuntimeError('RECEIVER_PRIOR_STATE_UNKNOWN')
    try:
        change(2)
        return operation()
    finally:
        change(original)

def validate(value, protected):
    require(set(value) == {'initialSurvey', 'finalSurvey', 'peerSamples', 'componentState', 'verdict'})
    require(value['verdict'] == 'PASS_BROADCAST_OBSERVATION')
    require(value['initialSurvey'] in (PASS, MAIN) and value['finalSurvey'] in (PASS, MAIN))
    require(re.fullmatch(r'0|[1-9]|1[0-9]|2[0-6]', value['peerSamples']) is not None)
    if protected:
        require(value['componentState'] == '2' and value['initialSurvey'] == PASS and
                value['finalSurvey'] == PASS and value['peerSamples'] == '0')
    else:
        require(value['componentState'] == '1' and value['finalSurvey'] == MAIN and int(value['peerSamples']) > 0)
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

def change_receiver(emulator, state):
    command, expected = {0: ('default-state', 'default'), 1: ('enable', 'enabled'), 2: ('disable', 'disabled')}[state]
    response = emulator.command('shell', 'pm', command, '--user', '0', COMPONENT)
    require(response.strip() == 'Component {' + COMPONENT + '} new state: ' + expected)

def boot_count(emulator):
    output = emulator.command('logcat', '-d', '-v', 'raw', '-s', 'VQSBroadcastLab:I', '*:S')
    require(len(output.encode()) <= 16384 and 'UNEXPECTED_ACTION' not in output)
    return output.count('BOOT_RECEIVER_DELIVERED')

def observe(emulator, protected):
    before = boot_count(emulator)
    emulator.command('shell', 'am', 'force-stop', TARGET)
    result = validate(parse(emulator.command('shell', 'am', 'instrument', '-w', '-r', PROBE)), protected)
    delta = boot_count(emulator) - before
    require(delta == (0 if protected else 1))
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
            for iteration in range(3):
                change_receiver(emulator, 1)
                before = observe(emulator, protected=False)
                fixed = receiver_window(int(before['componentState']), lambda state: change_receiver(emulator, state),
                                        lambda: observe(emulator, protected=True))
                restored = observe(emulator, protected=False)
                receipt['runs'].append({'enabled': before, 'protected': fixed, 'restored': restored})
            receipt['result'] = 'PASS_DISPOSABLE_BROADCAST_WINDOW'
        finally:
            try:
                emulator.command('shell', 'am', 'force-stop', TARGET)
                change_receiver(emulator, 0)
            except Exception:
                receipt['result'] = 'FAIL_FIXTURE_CLEANUP'
                raise
            finally:
                (args.output / 'runtime-receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))

if __name__ == '__main__': main()
