"""Disposable process-API experiment. No real client, private data or signing key."""
import argparse,importlib.util,json,re,shlex,time
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('bootstrap',HERE.parent/'android-rehearsal/test-bootstrap.py')
bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
TARGET='com.masarifi.voicequalification.processfixture'
PROBE='com.masarifi.voicequalification.processlab/.ProcessLab'
LISTENER=TARGET+'/'+TARGET+'.Peers$Listener'
REJECTION=r'PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=(TARGET_MAIN|PRIVATE_PROCESS_NAME|TARGET_AUXILIARY|OTHER|UNKNOWN_NAME|INVALID_PID)'
FIELDS={'verdict','initialSurvey','isolatedOtherSameUidPeers','listenerAccessGranted'}|{kind+suffix for kind in ('normal','isolated')
    for suffix in ('Bound','ActualUidMatches','FrameworkVisible','FrameworkUidMatches','Guard','Gone','CachedAliveBeforePing','StopAlreadyDead')}

def reject(condition):
    if not condition:raise RuntimeError('PROCESS_LAB_EVIDENCE_INVALID')

def is_rejection(value):return re.fullmatch(REJECTION,value) is not None

def validate(value):
    reject(set(value)==FIELDS and value['verdict']=='PASS_DISPOSABLE_PROCESS_LAB')
    reject(value['listenerAccessGranted'] in ('true','false'))
    reject(value['initialSurvey']=='PASS_ONLY_PRIVATE_PROCESS' or is_rejection(value['initialSurvey']))
    for kind in ('normal','isolated'):
        reject(value[kind+'Bound']=='true' and value[kind+'Gone']=='true')
        reject(all(value[kind+suffix] in ('true','false') for suffix in ('ActualUidMatches','FrameworkVisible','FrameworkUidMatches','CachedAliveBeforePing','StopAlreadyDead')))
    reject(value['normalActualUidMatches']=='true' and value['normalFrameworkVisible']=='true' and value['normalFrameworkUidMatches']=='true' and is_rejection(value['normalGuard']))
    reject(value['isolatedActualUidMatches']=='false')
    reject(re.fullmatch(r'0|[1-9][0-9]{0,3}',value['isolatedOtherSameUidPeers']) is not None)
    visible=value['isolatedFrameworkVisible']=='true';logical=value['isolatedFrameworkUidMatches']=='true'
    reject(visible or not logical)
    competing=logical or int(value['isolatedOtherSameUidPeers'])>0
    reject(is_rejection(value['isolatedGuard']) if competing else value['isolatedGuard']=='PASS_ONLY_PRIVATE_PROCESS')
    return value

def parse(output):
    reject(len(output.encode())<=16384)
    pairs=[];codes=[]
    for line in output.splitlines():
        if not line.strip():continue
        result=re.fullmatch(r'INSTRUMENTATION_RESULT: ([A-Za-z][A-Za-z0-9]*)=(.*)',line)
        code=re.fullmatch(r'INSTRUMENTATION_CODE: (-?\d+)\s*',line)
        if result:pairs.append(result.groups())
        elif code:codes.append(code.group(1))
        else:reject(False)
    reject(len(pairs)==len(dict(pairs)))
    reject(codes==['-1'])
    return validate(dict(pairs))

def listener_connections(emulator):
    output=emulator.command('logcat','-d','-v','raw','-s','VQSProcessLab:I','*:S',retain_output=False)
    reject(len(output.encode())<=16384)
    return output.count('LISTENER_CONNECTED')

def configure_listener(emulator,enabled):
    # adb shell rejoins argv into remote shell text; preserve the literal '$'.
    emulator.command('shell','cmd','notification','allow_listener' if enabled else 'disallow_listener',shlex.quote(LISTENER),'0')

def wait_listener(emulator,before):
    previous=getattr(emulator,'command_deadline',None)
    deadline=time.monotonic()+15
    emulator.command_deadline=min(previous,deadline) if previous is not None else deadline
    try:
        for _ in range(75):
            if time.monotonic()>=emulator.command_deadline:break
            if listener_connections(emulator)>before:return
            remaining=emulator.command_deadline-time.monotonic()
            if remaining<=0:break
            time.sleep(min(0.2,remaining))
        raise RuntimeError('SYNTHETIC_LISTENER_CONNECTION_UNPROVEN')
    finally:emulator.command_deadline=previous

def main():
    parser=argparse.ArgumentParser()
    for name in ('adb','build','output'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--adb-port',type=int,required=True);parser.add_argument('--serial',required=True)
    args=parser.parse_args();args.output.mkdir(exist_ok=False,parents=True)
    build=json.loads((args.build/'build-receipt.json').read_text())
    expected={str(path.relative_to(HERE)):bootstrap.hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(HERE.rglob('*')) if path.is_file() and path.suffix in ('.java','.xml','.py')}
    reject(build.get('processLabSourceHashes')==expected)
    shared=('android-probe/AndroidProcessSurvey.java','src/com/masarifi/voicequalification/PrivateProbeFailure.java',
            'src/com/masarifi/voicequalification/PrivateProbeProcessPolicy.java')
    reject(build.get('sharedGuardSourceHashes')=={name:bootstrap.hashlib.sha256((HERE.parent/name).read_bytes()).hexdigest() for name in shared})
    receipt={'fixtureOnly':True,'realRedmiQualification':False,'noJournalOrKeyAccess':True,'runs':[],'result':'FAIL'}
    with (args.output/'runtime.log').open('w',encoding='utf-8') as log:
        emulator=bootstrap.Emulator(args,log)
        try:
            bootstrap.install_fixtures(emulator,bootstrap.fixture_apks(args))
            for listener_enabled in (False,True):
                for iteration in range(3):
                    configure_listener(emulator,False)
                    emulator.command('shell','am','force-stop',TARGET)
                    before=listener_connections(emulator)
                    connected=False
                    if listener_enabled:
                        configure_listener(emulator,True)
                    if listener_enabled:wait_listener(emulator,before);connected=True
                    emulator.command('shell','am','force-stop',TARGET)
                    observed=parse(emulator.command('shell','am','instrument','-w','-r',PROBE))
                    reject(observed['listenerAccessGranted']==str(listener_enabled).lower())
                    receipt['runs'].append({'listenerEnabled':listener_enabled,'listenerBoundBeforeControlledForceStop':connected,**observed})
                    if not listener_enabled:reject(observed['initialSurvey']=='PASS_ONLY_PRIVATE_PROCESS')
            receipt['result']='PASS_DISPOSABLE_PROCESS_LAB'
        finally:
            try:
                try:configure_listener(emulator,False)
                finally:emulator.command('shell','am','force-stop',TARGET)
            except Exception:
                receipt['result']='FAIL_FIXTURE_CLEANUP'
                raise
            finally:(args.output/'runtime-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps(receipt))

if __name__=='__main__':main()
