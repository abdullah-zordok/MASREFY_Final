"""Only fabricated Android protocol text; never invokes a device."""
import unittest

from parse_probe import parse


def fixture():
    identity = dict(targetUid=10304, targetApkSha256='a' * 64,
                    probeApkSha256='b' * 64, certificateSha256='c' * 64)
    private = dict(identity, verdict='BLOCKED', owners=1, legacy=0, async_=0,
                   rows=1, pending=1, terminal=0, audioOwned=1,
                   confirmationOwned=0, committedFrames=0, fingerprint='d' * 64,
                   unchanged='true', plainApplication='true', onlyPrivateProcess='true',
                   workSummary='OWNER_SINGLETON:processing:1:1:0=1')
    private['async'] = private.pop('async_')
    fields = dict(private, admissionVersion='2', admissionNonce='e' * 64,
                  admissionObservedAt='100000', admissionDeadline='160000',
                  admissionVerdict='BLOCKED_EXTERNAL_ASSURANCES_REQUIRED',
                  admissionLocalStatus='OBSERVED_NO_LOCAL_BLOCKER',
                  admissionPrunableBatches='0', admissionFinancePending='0',
                  admissionTrackingRows='0', admissionSchemaCurrent='true',
                  admissionLegacyCleanup='false', admissionTrackingSources='INACTIVE',
                  admissionNativeIntake='INACTIVE')
    return fields, identity


def output(fields):
    return '\n'.join('INSTRUMENTATION_RESULT: ' + key + '=' + str(value)
                     for key, value in fields.items()) + '\nINSTRUMENTATION_CODE: -1\n'


def invoke(fields=None, **kwargs):
    original, identity = fixture()
    options = dict(expected_nonce='e' * 64, expected_deadline_ms=160000, now_ms=110000)
    options.update(kwargs)
    return parse(output(original if fields is None else fields), 0, identity, **options)


class ProbeTests(unittest.TestCase):
    def test_valid_observation_retains_original_blocked_classification(self):
        result = invoke()
        self.assertEqual(result['verdict'], 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED')
        self.assertEqual(result['privateReceipt']['verdict'], 'BLOCKED')
        self.assertEqual(result['admission']['admissionLocalStatus'], 'OBSERVED_NO_LOCAL_BLOCKER')

    def test_every_missing_field_and_duplicate_rejected(self):
        fields, identity = fixture()
        for key in fields:
            removed = dict(fields); del removed[key]
            self.assertEqual(invoke(removed)['verdict'], 'INDETERMINATE')
            duplicate = output(fields) + 'INSTRUMENTATION_RESULT: ' + key + '=' + str(fields[key])
            self.assertEqual(parse(duplicate, 0, identity, expected_nonce='e' * 64,
                                  expected_deadline_ms=160000, now_ms=110000)['verdict'], 'INDETERMINATE')

    def test_unknown_fields_and_raw_exception_never_return(self):
        for key in ('admissionSecret', 'privateToken', 'admissionOwnerSessionBinding'):
            fields, _ = fixture(); fields[key] = 'DO_NOT_RETAIN_SECRET'
            result = invoke(fields)
            self.assertEqual(result['verdict'], 'INDETERMINATE')
            self.assertNotIn('DO_NOT_RETAIN_SECRET', str(result))

    def test_counts_booleans_versions_and_verdict_are_closed(self):
        changes = [('admissionVersion', '1'), ('admissionVerdict', 'PASS'),
                   ('admissionSchemaCurrent', '1'), ('admissionLegacyCleanup', 'False'),
                   ('admissionLocalStatus', 'CLEAR'), ('admissionPrunableBatches', '-1'),
                   ('admissionTrackingRows', '1048577'), ('admissionFinancePending', '00')]
        for key, value in changes:
            fields, _ = fixture(); fields[key] = value
            self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')

    def test_tracking_facts_are_closed_and_cannot_claim_local_clear(self):
        for key in ('admissionTrackingSources', 'admissionNativeIntake'):
            for value in ('ACTIVE', 'UNKNOWN'):
                fields, _ = fixture(); fields[key] = value
                self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')
                fields['admissionLocalStatus'] = 'BLOCKED'
                self.assertEqual(invoke(fields)['verdict'], 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED')
            for value in ('false', 'inactive', 'PRIVATE_SENTINEL', ''):
                fields, _ = fixture(); fields[key] = value
                result = invoke(fields)
                self.assertEqual(result['verdict'], 'INDETERMINATE')
                self.assertNotIn('PRIVATE_SENTINEL', str(result))

    def test_local_status_exactly_matches_facts(self):
        for key, value in [('admissionPrunableBatches', '1'), ('admissionFinancePending', '1'),
                           ('admissionTrackingRows', '1048576'), ('admissionSchemaCurrent', 'false'),
                           ('admissionLegacyCleanup', 'true'), ('owners', '0')]:
            fields, _ = fixture(); fields[key] = value
            self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')
            fields['admissionLocalStatus'] = 'BLOCKED'
            self.assertEqual(invoke(fields)['verdict'], 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED')
        fields, _ = fixture(); fields['admissionLocalStatus'] = 'BLOCKED'
        self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')

    def test_original_parser_identity_and_private_proofs_still_required(self):
        for key, value in [('targetUid', '1'), ('unchanged', 'false'),
                           ('workSummary', 'PRIVATE'), ('verdict', 'CLEAR')]:
            fields, _ = fixture(); fields[key] = value
            self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')

    def test_nonce_deadline_and_time_replay_rejected(self):
        for arguments in [dict(expected_nonce='f' * 64), dict(expected_deadline_ms=160001),
                          dict(now_ms=160000), dict(now_ms=99999), dict(now_ms=True),
                          dict(expected_deadline_ms=True), dict(expected_nonce=None)]:
            self.assertEqual(invoke(**arguments)['verdict'], 'INDETERMINATE')
        fields, _ = fixture(); fields['admissionObservedAt'] = '-1'
        self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')
        fields, _ = fixture(); fields['admissionDeadline'] = '700001'
        self.assertEqual(invoke(fields, expected_deadline_ms=700001)['verdict'], 'INDETERMINATE')

    def test_envelope_failure_bounds_and_failure_receipts(self):
        _, identity = fixture()
        for text, exit_code in [(output(fixture()[0]), 1), ('x' * 65537, 0),
                                ('INSTRUMENTATION_RESULT: verdict=INDETERMINATE\nINSTRUMENTATION_CODE: 0', 0),
                                (None, 0), ('\ud800', 0)]:
            self.assertEqual(parse(text, exit_code, identity, expected_nonce='e' * 64,
                                  expected_deadline_ms=160000, now_ms=110000)['verdict'], 'INDETERMINATE')


if __name__ == '__main__':
    unittest.main()
