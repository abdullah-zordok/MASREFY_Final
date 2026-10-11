"""Closed disposable evidence only; no ADB calls in these tests."""
import importlib.util
from pathlib import Path
import unittest
import shlex
import hashlib,json,os,subprocess,tempfile
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'android-process-lab/test-process-lab.py'

class ProcessLabEvidenceTests(unittest.TestCase):
    def validate(self,value):
        spec=importlib.util.spec_from_file_location('process_lab',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.validate(value)
    def parse(self,value):
        spec=importlib.util.spec_from_file_location('process_lab_parser',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.parse(value)
    def evidence(self):
        return {'verdict':'PASS_DISPOSABLE_PROCESS_LAB','initialSurvey':'PASS_ONLY_PRIVATE_PROCESS',
                'normalBound':'true','normalActualUidMatches':'true','normalFrameworkVisible':'true',
                'normalFrameworkUidMatches':'true','normalGuard':'PROBE_IDENTITY_INDETERMINATE:PROCESS_SAME_UID_PEER:PEER_ROLE=TARGET_AUXILIARY',
                'normalGone':'true','normalCachedAliveBeforePing':'true','isolatedBound':'true','isolatedActualUidMatches':'false',
                'isolatedFrameworkVisible':'false','isolatedFrameworkUidMatches':'false',
                'isolatedGuard':'PASS_ONLY_PRIVATE_PROCESS','isolatedGone':'true','isolatedCachedAliveBeforePing':'true','isolatedOtherSameUidPeers':'0'}
    def test_actual_normal_peer_must_reject(self):
        self.validate(self.evidence())
        for field,value in (('normalGuard','PASS_ONLY_PRIVATE_PROCESS'),('normalActualUidMatches','false'),('normalFrameworkVisible','false')):
            bad=dict(self.evidence(),**{field:value})
            with self.subTest(field=field),self.assertRaises(RuntimeError):self.validate(bad)
    def test_peer_evidence_cannot_be_omitted_or_export_raw_ids(self):
        for field in self.evidence():
            bad=self.evidence();bad.pop(field)
            with self.subTest(field=field),self.assertRaises(RuntimeError):self.validate(bad)
        for field in ('pid','uid','processName','cause'):
            with self.subTest(field=field),self.assertRaises(RuntimeError):self.validate(dict(self.evidence(),**{field:'PRIVATE'}))
    def test_unknown_or_contradictory_isolated_metadata_rejects(self):
        for field,value in (('isolatedActualUidMatches','true'),('isolatedGone','false'),('initialSurvey','UNKNOWN'),('isolatedFrameworkUidMatches','true')):
            with self.subTest(field=field),self.assertRaises(RuntimeError):self.validate(dict(self.evidence(),**{field:value}))

    def test_malformed_duplicate_or_extra_envelope_lines_reject(self):
        valid=''.join('INSTRUMENTATION_RESULT: '+key+'='+value+'\n' for key,value in self.evidence().items())+'INSTRUMENTATION_CODE: -1\n'
        self.parse(valid)
        for extra in ('INSTRUMENTATION_RESULT: =junk','INSTRUMENTATION_CODE: bogus','INSTRUMENTATION_CODE: -1',
                      'INSTRUMENTATION_RESULT: normalBound=true','UNKNOWN_FRAMEWORK_DATA'):
            with self.subTest(extra=extra),self.assertRaises(RuntimeError):self.parse(valid+extra+'\n')

    def test_listener_deadline_and_prior_deadline_restore(self):
        spec=importlib.util.spec_from_file_location('process_lab_deadline',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        for previous in (None,104.0):
            now=[100.0];observed=[]
            class FakeEmulator:
                command_deadline=previous
                def command(self,*args,**kwargs):
                    observed.append(self.command_deadline)
                    now[0]=min(now[0]+2,self.command_deadline)
                    return ''
            emulator=FakeEmulator()
            def sleep(seconds):now[0]+=seconds
            with patch.object(module.time,'monotonic',side_effect=lambda:now[0]),patch.object(module.time,'sleep',side_effect=sleep):
                with self.assertRaises(RuntimeError):module.wait_listener(emulator,0)
            self.assertTrue(observed)
            self.assertTrue(all(value==min(previous or 115.0,115.0) for value in observed))
            self.assertLessEqual(now[0],min(previous or 115.0,115.0))
            self.assertEqual(emulator.command_deadline,previous)

    def test_listener_output_cap_and_success_restore(self):
        spec=importlib.util.spec_from_file_location('process_lab_listener',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        class FakeEmulator:
            command_deadline=None
            def command(self,*args,**kwargs):return self.output
        emulator=FakeEmulator();emulator.output='LISTENER_CONNECTED\n'
        module.wait_listener(emulator,0)
        self.assertIsNone(emulator.command_deadline)
        emulator.output='X'*16385
        with self.assertRaises(RuntimeError):module.wait_listener(emulator,0)
        self.assertIsNone(emulator.command_deadline)

    def test_listener_component_survives_remote_shell_join(self):
        spec=importlib.util.spec_from_file_location('process_lab_shell',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        commands=[]
        class FakeEmulator:
            def command(self,*args,**kwargs):commands.append(args)
        module.configure_listener(FakeEmulator(),True)
        module.configure_listener(FakeEmulator(),False)
        shell=Path('C:/Program Files/Git/bin/bash.exe') if os.name=='nt' else Path('/bin/sh')
        self.assertTrue(shell.is_file(),'Local shell required for remote-quoting regression')
        for args,verb in zip(commands,('allow_listener','disallow_listener')):
            self.assertEqual(shlex.split(' '.join(args[1:])),['cmd','notification',verb,module.LISTENER,'0'])
            for value in (None,'HARMLESS_EXPANSION_SENTINEL'):
                environment=dict(os.environ);environment.pop('Listener',None)
                if value is not None:environment['Listener']=value
                def expand(argument):
                    return subprocess.run([str(shell),'-c',"printf '%s' "+argument],env=environment,
                        capture_output=True,text=True,timeout=5,check=True).stdout
                self.assertNotEqual(expand(module.LISTENER),module.LISTENER)
                self.assertEqual(expand(args[-2]),module.LISTENER)

    def test_all_listener_setup_and_cleanup_commands_preserve_component(self):
        spec=importlib.util.spec_from_file_location('process_lab_commands',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        commands=[];state={'enabled':False,'connections':0}
        valid=''.join('INSTRUMENTATION_RESULT: '+key+'='+value+'\n' for key,value in self.evidence().items())+'INSTRUMENTATION_CODE: -1\n'
        class FakeEmulator:
            def __init__(self,*args):pass
            def command(self,*args,**kwargs):
                commands.append(args)
                if args[:3]==('shell','cmd','notification'):
                    self_value=shlex.split(' '.join(args[1:]))
                    if self_value[3]!=module.LISTENER:raise RuntimeError('SYNTHETIC_COMPONENT_CHANGED')
                    state['enabled']=args[3]=='allow_listener'
                    if state['enabled']:state['connections']+=1
                if args[0]=='logcat':return 'LISTENER_CONNECTED\n'*state['connections']
                if args[:2]==('shell','settings'):return module.LISTENER if state['enabled'] else 'null'
                if args[:3]==('shell','am','instrument'):return valid
                return ''
        with tempfile.TemporaryDirectory(prefix='vqs-public-host-test-') as temporary:
            root=Path(temporary);build=root/'build';build.mkdir()
            lab=module.HERE
            shared=('android-probe/AndroidProcessSurvey.java','src/com/masarifi/voicequalification/PrivateProbeFailure.java',
                    'src/com/masarifi/voicequalification/PrivateProbeProcessPolicy.java')
            receipt={'processLabSourceHashes':{str(item.relative_to(lab)):hashlib.sha256(item.read_bytes()).hexdigest()
                for item in sorted(lab.rglob('*')) if item.is_file() and item.suffix in ('.java','.xml','.py')},
                'sharedGuardSourceHashes':{name:hashlib.sha256((lab.parent/name).read_bytes()).hexdigest() for name in shared}}
            (build/'build-receipt.json').write_text(json.dumps(receipt))
            argv=['process-lab','--adb','PUBLIC_FAKE_ADB','--adb-port','15040','--serial','emulator-5580',
                  '--build',str(build),'--output',str(root/'output')]
            with patch('sys.argv',argv),patch.object(module.bootstrap,'Emulator',FakeEmulator),\
                    patch.object(module.bootstrap,'fixture_apks',return_value=[]),patch.object(module.bootstrap,'install_fixtures'),patch('builtins.print'):
                module.main()
            self.assertEqual(json.loads((root/'output/runtime-receipt.json').read_text())['result'],'PASS_DISPOSABLE_PROCESS_LAB')
        notifications=[args for args in commands if args[:3]==('shell','cmd','notification')]
        self.assertEqual(len(notifications),10)
        self.assertEqual(sum(args[3]=='allow_listener' for args in notifications),3)
        self.assertTrue(all(args[-2]==shlex.quote(module.LISTENER) for args in notifications))
        self.assertFalse(state['enabled'])

if __name__=='__main__':unittest.main()
