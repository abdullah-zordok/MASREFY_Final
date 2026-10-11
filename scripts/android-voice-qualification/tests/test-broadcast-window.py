"""Diagnostic package-window rollback and evidence tests; never contacts ADB."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'android-process-lab/test-broadcast-lab.py'
spec = importlib.util.spec_from_file_location('broadcast_lab', path)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class BroadcastWindowTests(unittest.TestCase):
    def test_package_override_restored_after_success_or_body_failure(self):
        for original in (0, 1):
            for fail in (False, True):
                with self.subTest(original=original, fail=fail):
                    changes = []
                    def operation():
                        self.assertEqual(changes[-1], 3)
                        if fail:
                            raise RuntimeError('DIAGNOSTIC_FAILED')
                        return 'observed'
                    if fail:
                        with self.assertRaisesRegex(RuntimeError, 'DIAGNOSTIC_FAILED'):
                            lab.package_window(original, changes.append, lambda: changes.append("stopped"), operation)
                    else:
                        self.assertEqual(lab.package_window(original, changes.append, lambda: changes.append("stopped"), operation), 'observed')
                    self.assertEqual(changes, [3, "stopped", original])

    def test_disable_failure_still_attempts_restoration_without_diagnostic(self):
        changes = []
        def change(state):
            changes.append(state)
            if state == 3:
                raise RuntimeError('DISABLE_OUTCOME_UNKNOWN')
        with self.assertRaisesRegex(RuntimeError, 'DISABLE_OUTCOME_UNKNOWN'):
            lab.package_window(1, change, lambda: changes.append('stopped'), lambda: self.fail('must not run'))
        self.assertEqual(changes, [3, "stopped", 1])

    def test_unknown_prior_state_never_mutates_or_runs(self):
        for state in (-1, 2, 3, 4, None, True, '1'):
            with self.subTest(state=state), self.assertRaises(RuntimeError):
                lab.package_window(state, lambda _: self.fail('must not mutate'), lambda: self.fail('must not stop'), lambda: self.fail('must not run'))

    def test_restore_failure_cannot_be_reported_as_success(self):
        def change(state):
            if state == 1:
                raise RuntimeError('RESTORE_FAILED')
        with self.assertRaisesRegex(RuntimeError, 'RESTORE_FAILED'):
            lab.package_window(1, change, lambda: None, lambda: 'pass')

    def test_failed_stop_never_reenables_a_potentially_running_package(self):
        changes = []
        def stop(): raise RuntimeError('STOP_UNPROVEN')
        with self.assertRaisesRegex(RuntimeError, 'STOP_UNPROVEN'):
            lab.package_window(0, changes.append, stop, lambda: 'pass')
        self.assertEqual(changes, [3])

    def test_malformed_or_duplicate_instrumentation_output_is_rejected(self):
        valid = 'INSTRUMENTATION_RESULT: verdict=PASS_BROADCAST_OBSERVATION\nINSTRUMENTATION_CODE: -1\n'
        self.assertEqual(lab.parse(valid), {'verdict': 'PASS_BROADCAST_OBSERVATION'})
        for extra in ('INSTRUMENTATION_CODE: -1\n', 'INSTRUMENTATION_RESULT: verdict=anything\n',
                      'unrecognized output\n', 'INSTRUMENTATION_RESULT: =missing\n'):
            with self.subTest(extra=extra), self.assertRaises(RuntimeError):
                lab.parse(valid + extra)

    def test_enabled_control_requires_an_observed_main_peer(self):
        good = {'initialSurvey': lab.PASS, 'finalSurvey': lab.MAIN, 'peerSamples': '25',
                'packageState': '0', 'applicationEnabled': 'true', 'verdict': 'PASS_BROADCAST_OBSERVATION'}
        lab.validate(good, protected=False)
        for key, value in [('peerSamples', '0'), ('peerSamples', '27'), ('finalSurvey', lab.PASS),
                           ('packageState', '3'), ('verdict', 'INDETERMINATE')]:
            with self.subTest(key=key, value=value), self.assertRaises(RuntimeError):
                lab.validate(dict(good, **{key: value}), protected=False)

    def test_guard_rejection_or_missing_boot_evidence_never_passes_fixed_case(self):
        good = {'initialSurvey': lab.PASS, 'finalSurvey': lab.PASS, 'peerSamples': '0',
                'packageState': '3', 'applicationEnabled': 'false', 'verdict': 'PASS_BROADCAST_OBSERVATION'}
        lab.validate(good, protected=True)
        for key, value in [('initialSurvey', lab.MAIN), ('finalSurvey', lab.MAIN),
                           ('peerSamples', '1'), ('packageState', '0'), ('applicationEnabled', 'true'), ('unexpected', 'data')]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                lab.validate(dict(good, **{key: value}), protected=True)
        with self.assertRaises(RuntimeError):
            lab.validate(dict(good, packageState='0'), protected=False)


if __name__ == '__main__':
    unittest.main()
