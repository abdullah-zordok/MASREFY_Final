"""Fabricated v3 protocol only; no device or private credentials."""
import unittest

from parse_probe import parse, parse_launch
from test_parse_probe import fixture, output

ABSENCE = ('admissionLegacySmsQueue', 'admissionNativeOwnerContext',
           'admissionJsOwnerContext', 'admissionPrivacyEntries')


def launch_fixture():
    fields, identity = fixture()
    fields['admissionVersion'] = '3'
    fields.update({key: 'ABSENT' for key in ABSENCE})
    return fields, identity


def invoke(fields=None):
    original, identity = launch_fixture()
    return parse_launch(output(original if fields is None else fields), 0, identity,
                        expected_nonce='e' * 64, expected_deadline_ms=160000, now_ms=110000)


class LaunchParserTests(unittest.TestCase):
    def test_valid_absence_receipt_is_still_external_blocked_observation(self):
        result = invoke()
        self.assertEqual(result['verdict'], 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED')
        self.assertEqual(result['admission']['admissionVersion'], 3)
        self.assertEqual(result['admission']['admissionLocalStatus'], 'OBSERVED_NO_LOCAL_BLOCKER')
        self.assertEqual(len(result['admission']), 17)

    def test_present_or_unknown_cannot_claim_local_clear_and_payload_is_closed(self):
        for key in ABSENCE:
            for value in ('PRESENT', 'UNKNOWN'):
                fields, _ = launch_fixture(); fields[key] = value
                self.assertEqual(invoke(fields)['verdict'], 'INDETERMINATE')
                fields['admissionLocalStatus'] = 'BLOCKED'
                self.assertEqual(invoke(fields)['verdict'], 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED')
            for value in ('absent', 'false', '', 'PRIVATE_SENTINEL'):
                fields, _ = launch_fixture(); fields[key] = value
                result = invoke(fields)
                self.assertEqual(result['verdict'], 'INDETERMINATE')
                self.assertNotIn('PRIVATE_SENTINEL', str(result))

    def test_every_field_missing_or_duplicate_fails_without_partial_output(self):
        fields, identity = launch_fixture()
        for key in fields:
            removed = dict(fields); del removed[key]
            self.assertEqual(invoke(removed)['verdict'], 'INDETERMINATE')
            duplicated = output(fields) + '\nINSTRUMENTATION_RESULT: ' + key + '=' + str(fields[key])
            result = parse_launch(duplicated, 0, identity, expected_nonce='e' * 64,
                                  expected_deadline_ms=160000, now_ms=110000)
            self.assertEqual(result['verdict'], 'INDETERMINATE')

    def test_v2_and_v3_cannot_substitute_for_each_other(self):
        self.assertEqual(invoke(fixture()[0])['verdict'], 'INDETERMINATE')
        fields, identity = launch_fixture()
        self.assertEqual(parse(output(fields), 0, identity, expected_nonce='e' * 64,
                               expected_deadline_ms=160000, now_ms=110000)['verdict'], 'INDETERMINATE')

    def test_private_proofs_counts_nonce_clock_and_deadline_remain_required(self):
        for key, value in [('targetUid', '1'), ('unchanged', 'false'),
                           ('admissionNonce', 'a' * 64), ('admissionDeadline', '160001'),
                           ('admissionObservedAt', '110001'), ('admissionFinancePending', '1'),
                           ('admissionNativeIntake', 'ACTIVE'), ('admissionVersion', '2'),
                           ('admissionSecret', 'PRIVATE_SENTINEL')]:
            fields, _ = launch_fixture(); fields[key] = value
            result = invoke(fields)
            self.assertEqual(result['verdict'], 'INDETERMINATE')
            self.assertNotIn('PRIVATE_SENTINEL', str(result))


if __name__ == '__main__':
    unittest.main()
