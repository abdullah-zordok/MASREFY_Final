"""Host assertions for disposable install-replace qualification. No device calls."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).resolve().parents[1]/'android-rehearsal/test-bootstrap.py')
bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)

class UpgradeGuards(unittest.TestCase):
    def test_replacement_command_preserves_enabled_state_and_is_user_zero_only(self):
        from types import SimpleNamespace
        calls=[]
        emulator=SimpleNamespace(command=lambda *args:(calls.append(args) or 'Success\n'))
        bootstrap.install_disabled_replacement(emulator,Path('synthetic.apk'))
        self.assertEqual(calls, [('install','-r','--no-incremental','--no-streaming','--user','0','--skip-enable',Path('synthetic.apk'))])

    def test_upgrade_runtime_is_bound_to_built_apks_and_both_journal_phases(self):
        spec=importlib.util.spec_from_file_location('builder2',Path(__file__).resolve().parents[1]/'android-probe/build-probe.py')
        builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        import copy
        phase={'verdict':'PASS_DISPOSABLE_ENCRYPTED_JOURNALS','fixtureFingerprint':'c'*64,'cases':'57',
               'readerStageCases':'25','qualificationStageCases':'19','workSummaryCases':'38','admissionCases':'38','launchAdmissionCases':'38','launchAdmissionVersion':'3','packageState':'3','applicationEnabled':'false'}
        runtime={'disabledReplacement':{'beforeApkSha256':'a'*64,'afterApkSha256':'b'*64},
                 'encryptedJournals':{'runs':[dict(phase)],'preReplacementRuns':[dict(phase)],'postReplacementRuns':[dict(phase)]}}
        artifact={'target':{'sha256':'a'*64},'replacement':{'sha256':'b'*64}}
        builder.validate_upgrade_provenance(runtime,artifact)
        for key in ('preReplacementRuns','postReplacementRuns'):
            bad=copy.deepcopy(runtime);del bad['encryptedJournals'][key]
            with self.assertRaisesRegex(RuntimeError,'PROBE_BUILD_GATE'):builder.validate_upgrade_provenance(bad,artifact)
            for field,value in [('launchAdmissionCases','0'),('launchAdmissionVersion','2'),('verdict','FAIL'),('fixtureFingerprint','d'*64),('packageState','0'),('applicationEnabled','true')]:
                bad=copy.deepcopy(runtime);bad['encryptedJournals'][key][0][field]=value
                with self.assertRaisesRegex(RuntimeError,'PROBE_BUILD_GATE'):builder.validate_upgrade_provenance(bad,artifact)
        for key in ('target','replacement'):
            bad=copy.deepcopy(artifact);bad[key]['sha256']='d'*64
            with self.assertRaisesRegex(RuntimeError,'PROBE_BUILD_GATE'):builder.validate_upgrade_provenance(runtime,bad)

    def test_requires_exact_state_uid_hash_and_no_process(self):
        good={'enabled':3,'stopped':True,'uid':10123,'apkSha256':'a'*64,'quiet':True}
        bootstrap.require_upgrade_state(good,3,10123,'a'*64)
        for key,value in [('enabled',0),('stopped',False),('uid',10124),('apkSha256','b'*64),('quiet',False)]:
            with self.subTest(key=key),self.assertRaisesRegex(RuntimeError,'UPGRADE_STATE_REJECTED'):
                bootstrap.require_upgrade_state(dict(good,**{key:value}),3,10123,'a'*64)
        for key in good:
            bad=dict(good);del bad[key]
            with self.subTest(missing=key),self.assertRaisesRegex(RuntimeError,'UPGRADE_STATE_REJECTED'):
                bootstrap.require_upgrade_state(bad,3,10123,'a'*64)

    def test_runtime_signing_gate_rejects_missing_upgrade_evidence(self):
        spec=importlib.util.spec_from_file_location('builder',Path(__file__).resolve().parents[1]/'android-probe/build-probe.py')
        builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        good={'verdict':'PASS_DISABLED_REPLACEMENT','beforeApkSha256':'a'*64,'afterApkSha256':'b'*64,
              'uidUnchanged':True,'exactPackageStateRestored':True,'journalFingerprintUnchanged':True,
              'newNetworkRequests':0,'startupTripwireUnchanged':True}
        builder.validate_upgrade(good)
        for key in good:
            bad=dict(good);del bad[key]
            with self.subTest(missing=key),self.assertRaisesRegex(RuntimeError,'PROBE_BUILD_GATE'):
                builder.validate_upgrade(bad)
        for key,value in [('afterApkSha256','a'*64),('uidUnchanged',False),('exactPackageStateRestored',False),
                          ('journalFingerprintUnchanged',False),('newNetworkRequests',1),('startupTripwireUnchanged',False)]:
            with self.subTest(key=key),self.assertRaisesRegex(RuntimeError,'PROBE_BUILD_GATE'):
                builder.validate_upgrade(dict(good,**{key:value}))

if __name__=='__main__':unittest.main()
