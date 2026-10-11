import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('receipt', Path(__file__).resolve().parents[1]/'parse-private-probe-receipt.py')
receipt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receipt)

class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.expected = {'targetUid':10304, 'targetApkSha256':'a'*64, 'probeApkSha256':'b'*64, 'certificateSha256':'c'*64}
        self.values = {key:'0' for key in receipt.COUNTS}
        self.values.update({key:'true' for key in receipt.BOOLEANS})
        self.values.update({key:str(value) for key,value in self.expected.items()})
        self.values.update(verdict='CLEAR', fingerprint='d'*64, workSummary='')
    def parse(self, values=None, code='-1', exit_code=0):
        values = self.values if values is None else values
        output = '\n'.join('INSTRUMENTATION_RESULT: '+key+'='+value for key,value in values.items())
        return receipt.parse(output+'\nINSTRUMENTATION_CODE: '+code,exit_code,self.expected)
    def test_complete_clear(self):
        self.assertEqual(self.parse()['verdict'],'CLEAR')
        self.assertEqual(self.parse()['targetUid'],10304)
    def test_blocked_retains_counts(self):
        self.values.update(verdict='BLOCKED',rows='2',pending='2',audioOwned='1',workSummary='OWNER_BATCH:processing:1:0:0=1;OWNER_SINGLETON:captured:0:1:0=1')
        self.assertEqual(self.parse()['pending'],2)
    def test_work_summary_rejects_untrusted_or_inconsistent_groups(self):
        for summary in ('private-recording-path','OWNER_BATCH:secret:0:0:0=1',
                        'OWNER_BATCH:completed:0:0:0=0','OWNER_BATCH:completed:0:0:0=01',
                        'OWNER_BATCH:completed:0:0:0=524289','ASYNC:pending:0:0:0=1',
                        'OWNER_SINGLETON:confirming:0:0:0=1',
                        'OWNER_BATCH:completed:0:0:0=1;OWNER_BATCH:completed:0:0:0=1',
                        'OWNER_SINGLETON:saved:0:0:0=1;OWNER_BATCH:completed:0:0:0=1'):
            with self.subTest(summary=summary):
                self.values['workSummary']=summary
                self.assertEqual(self.parse(),{'verdict':'INDETERMINATE','failureCategory':'INVALID_WORK_SUMMARY'})
    def test_work_summary_reconciles_each_count(self):
        self.values.update(verdict='BLOCKED',rows='2',pending='1',terminal='1',audioOwned='1',confirmationOwned='1',
                           workSummary='ASYNC:pending:1:0:0=1;OWNER_SINGLETON:saved:1:1:1=1')
        self.assertEqual(self.parse()['workSummary'],self.values['workSummary'])
        for key in ('rows','pending','terminal','audioOwned','confirmationOwned'):
            values=dict(self.values);values[key]=str(int(values[key])+1)
            self.assertEqual(self.parse(values)['failureCategory'],'INVALID_WORK_SUMMARY')
    def test_missing_every_field_fails_closed(self):
        for key in self.values:
            values=dict(self.values);values.pop(key)
            self.assertEqual(self.parse(values)['verdict'],'INDETERMINATE')
    def test_inconsistent_classification(self):
        self.values['pending']='1'
        self.assertEqual(self.parse()['failureCategory'],'INCONSISTENT_VERDICT')
        self.values.update(pending='0',verdict='BLOCKED')
        self.assertEqual(self.parse()['failureCategory'],'INCONSISTENT_VERDICT')
    def test_each_identity_mismatch(self):
        for key in self.expected:
            values=dict(self.values);values[key]='10305' if key=='targetUid' else 'e'*64
            self.assertEqual(self.parse(values)['failureCategory'],'IDENTITY_CHANGED')
    def test_false_unchanged_checks(self):
        for key in receipt.BOOLEANS:
            values=dict(self.values);values[key]='false'
            self.assertEqual(self.parse(values)['failureCategory'],'UNCHANGED_PROOF_MISSING')
    def test_bad_counts(self):
        for value in ('-1','01','2147483648','1.0','1\nCLEAR','999999999999'):
            values=dict(self.values);values['pending']=value
            self.assertEqual(self.parse(values)['verdict'],'INDETERMINATE')
    def test_unknown_field(self):
        self.values['privatePayload']='sensitive'
        self.assertEqual(self.parse()['verdict'],'INDETERMINATE')
        self.assertNotIn('sensitive',str(self.parse()))
    def test_closed_stage_failure_only(self):
        for stage in receipt.STAGES:
            result=self.parse({'shortMsg':'java.lang.ClassNotFoundException: PROBE_IDENTITY_INDETERMINATE:'+stage},code='0')
            self.assertEqual(result['bootstrapStage'],stage)
            self.assertEqual(result['verdict'],'INDETERMINATE')
    def test_private_exception_is_discarded(self):
        for value in ('private-token-path','PROBE_IDENTITY_INDETERMINATE:SECRET','PROBE_IDENTITY_INDETERMINATE:DATA_ROOT\nprivate-owner','PROBE_IDENTITY_INDETERMINATE:DATA_ROOT private-key'):
            result=self.parse({'shortMsg':value},code='0')
            self.assertNotIn('bootstrapStage',result)
            self.assertNotIn('private',str(result))
    def test_framework_failure_cannot_clear(self):
        self.values['shortMsg']='PROBE_IDENTITY_INDETERMINATE:DATA_ROOT'
        self.assertEqual(self.parse()['verdict'],'INDETERMINATE')
    def test_reader_indeterminate_has_no_fabricated_counts(self):
        result=self.parse({'verdict':'INDETERMINATE'},code='0')
        self.assertEqual(result['failureCategory'],'READER_INDETERMINATE')
        self.assertFalse(set(result)&receipt.COUNTS)
    def test_duplicate_envelope_and_failed_exit(self):
        for output in ('INSTRUMENTATION_RESULT: verdict=CLEAR\nINSTRUMENTATION_RESULT: verdict=CLEAR\nINSTRUMENTATION_CODE: -1','INSTRUMENTATION_CODE: -1\nINSTRUMENTATION_CODE: -1','INSTRUMENTATION_RESULT: =invalid\nINSTRUMENTATION_CODE: -1'):
            self.assertEqual(receipt.parse(output,0,self.expected)['failureCategory'],'INVALID_ENVELOPE')
        self.assertEqual(self.parse(exit_code=1)['verdict'],'INDETERMINATE')
    def test_bound(self):
        self.assertEqual(receipt.parse('x'*65537,0,self.expected)['failureCategory'],'OUTPUT_BOUND_EXCEEDED')

class ReaderStageTests(unittest.TestCase):
    setUp = ReceiptTests.setUp
    parse = ReceiptTests.parse
    def test_android_and_host_stage_protocol_agree(self):
        import re
        source=(Path(__file__).resolve().parents[1]/'src/com/masarifi/voicequalification/PrivateReaderFailure.java').read_text()
        enum=re.search(r'enum Stage \{([^}]+)\}',source).group(1)
        self.assertEqual(set(re.findall(r'[A-Z][A-Z_]+',enum)),receipt.READER_STAGES)
        source=(Path(__file__).resolve().parents[1]/'src/com/masarifi/voicequalification/VoiceStoreQualification.java').read_text()
        enum=re.search(r'enum Stage \{([^}]+)\}',source).group(1)
        self.assertEqual(set(re.findall(r'[A-Z][A-Z_]+',enum)),receipt.QUALIFICATION_STAGES)

    def test_all_closed_stages_round_trip(self):
        for stage in receipt.READER_STAGES:
            self.assertEqual(self.parse({'verdict':'INDETERMINATE','readerStage':stage},code='0'),
                {'verdict':'INDETERMINATE','failureCategory':'READER_INDETERMINATE','readerStage':stage})
    def test_untrusted_stage_and_extra_fields_are_discarded(self):
        for stage in ('private/path/token','QUALIFICATION\\nSECRET','', 'qualification'):
            result=self.parse({'verdict':'INDETERMINATE','readerStage':stage},code='0')
            self.assertEqual(result['verdict'],'INDETERMINATE');self.assertNotIn('readerStage',result)
        for extra in ('fingerprint','privateValue'):
            result=self.parse({'verdict':'INDETERMINATE','readerStage':'QUALIFICATION',extra:'SECRET'},code='0')
            self.assertNotIn('readerStage',result);self.assertNotIn('SECRET',str(result))
    def test_stage_cannot_override_envelope_or_success(self):
        for code,exit_code in (('-1',0),('0',1)):
            result=self.parse({'verdict':'INDETERMINATE','readerStage':'QUALIFICATION'},code=code,exit_code=exit_code)
            self.assertNotIn('readerStage',result)
        self.values['readerStage']='QUALIFICATION'
        self.assertEqual(self.parse()['verdict'],'INDETERMINATE')
    def test_internal_stage_requires_exact_qualification_failure_envelope(self):
        for stage in receipt.QUALIFICATION_STAGES:
            result=self.parse({'verdict':'INDETERMINATE','readerStage':'QUALIFICATION','qualificationStage':stage},code='0')
            self.assertEqual(result.get('qualificationStage'),stage)
        for reader,internal in [('NATIVE_LOAD','OWNER_KEY_DECRYPT'),('QUALIFICATION','private/key/path')]:
            result=self.parse({'verdict':'INDETERMINATE','readerStage':reader,'qualificationStage':internal},code='0')
            self.assertNotIn('qualificationStage',result)
        result=self.parse({'verdict':'INDETERMINATE','readerStage':'QUALIFICATION','qualificationStage':'OWNER_KEY_DECRYPT','extra':'SECRET'},code='0')
        self.assertNotIn('qualificationStage',result);self.assertNotIn('SECRET',str(result))

    def test_legacy_reader_failure_remains_supported(self):
        self.assertEqual(self.parse({'verdict':'INDETERMINATE'},code='0'),{'verdict':'INDETERMINATE','failureCategory':'READER_INDETERMINATE'})

if __name__=='__main__':unittest.main()
