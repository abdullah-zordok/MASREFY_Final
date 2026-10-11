"""Closed disposable evidence only; no ADB calls in these tests."""
import importlib.util
from pathlib import Path
import unittest
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
                'normalGone':'true','isolatedBound':'true','isolatedActualUidMatches':'false',
                'isolatedFrameworkVisible':'false','isolatedFrameworkUidMatches':'false',
                'isolatedGuard':'PASS_ONLY_PRIVATE_PROCESS','isolatedGone':'true','isolatedOtherSameUidPeers':'0'}
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

if __name__=='__main__':unittest.main()
