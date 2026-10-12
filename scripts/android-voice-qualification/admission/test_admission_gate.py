"""Synthetic admission tests. No network, Android, credentials or real records."""
import copy
import hashlib
import json
import unittest

from admission_gate import evaluate


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def fixture():
    context = dict(schemaVersion=1, nonce='a' * 64, apkSha256='b' * 64,
                   sourceSha256='c' * 64, windowStartMs=100000, windowEndMs=160000)
    facts = {
        'local': dict(batchPrunableThroughWindow=0, financeQueuedOrSending=0,
                      trackingInert=True, schemaComplete=True, legacyCleanupPending=False,
                      protectedFingerprint='d' * 64, ownerSessionBinding='e' * 64),
        'remote': dict(ownerSessionBinding='e' * 64, legacyConfirmed=False,
                       incomingPreservationChanges=0),
        'auth': dict(ownerSessionBinding='e' * 64, sameOwnerValid=True,
                     signOutCleanupExposure=False),
        'staging': dict(postingOff=True, activeEpochs=0, baselineUnchanged=True),
    }
    receipts = {kind: encoded(dict(**context, kind=kind, observedAtMs=99000, facts=value))
                for kind, value in facts.items()}
    pins = {kind: hashlib.sha256(raw).hexdigest() for kind, raw in receipts.items()}
    return context, receipts, pins


class AdmissionTests(unittest.TestCase):
    def check(self, context, receipts, pins, now=100000):
        return evaluate(context, receipts, pins, now_ms=now)

    def mutate(self, kind, key, value):
        context, receipts, pins = fixture()
        doc = json.loads(receipts[kind])
        doc['facts'][key] = value
        receipts[kind] = encoded(doc)
        pins[kind] = hashlib.sha256(receipts[kind]).hexdigest()
        return self.check(context, receipts, pins)

    def test_complete_static_facts_cannot_authorize_launch(self):
        result = self.check(*fixture())
        self.assertEqual(result['verdict'], 'BLOCKED')
        self.assertEqual(result['reasons'], ['UNQUALIFIED_PRODUCER_PROVENANCE',
                                            'FULL_WINDOW_PRESERVATION_UNPROVEN'])
        self.assertEqual(result['staticEvidence'], 'STRUCTURALLY_COMPLETE_UNQUALIFIED')

    def test_unknown_missing_false_and_wrong_types_fail_closed(self):
        cases = [('local', 'trackingInert', None), ('local', 'trackingInert', 1),
                 ('local', 'financeQueuedOrSending', True),
                 ('remote', 'legacyConfirmed', True), ('staging', 'postingOff', False),
                 ('auth', 'sameOwnerValid', 'true'), ('local', 'batchPrunableThroughWindow', -1)]
        for kind, key, value in cases:
            with self.subTest(kind=kind, key=key, value=value):
                self.assertEqual(self.mutate(kind, key, value)['staticEvidence'], 'REJECTED')

    def test_all_each_required_receipt_and_pin_must_exist(self):
        for kind in ('local', 'remote', 'auth', 'staging'):
            for part in (1, 2):
                values = fixture()
                del values[part][kind]
                self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_pin_tampering_rejected(self):
        values = fixture()
        values[1]['local'] += b' '
        self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_owner_binding_mismatch(self):
        self.assertEqual(self.mutate('remote', 'ownerSessionBinding', 'f' * 64)['staticEvidence'], 'REJECTED')

    def test_extra_fields_cannot_smuggle_secrets_or_assurance(self):
        self.assertEqual(self.mutate('auth', 'token', 'secret')['staticEvidence'], 'REJECTED')
        values = fixture()
        doc = json.loads(values[1]['local'])
        doc['fullWindowSafe'] = True
        values[1]['local'] = encoded(doc)
        values[2]['local'] = hashlib.sha256(values[1]['local']).hexdigest()
        self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_context_mismatch_future_stale_and_window(self):
        for key, value in [('nonce', 'f' * 64), ('apkSha256', 'f' * 64),
                           ('sourceSha256', 'f' * 64), ('observedAtMs', 100001),
                           ('observedAtMs', 69999), ('windowEndMs', 160001),
                           ('schemaVersion', True)]:
            values = fixture()
            doc = json.loads(values[1]['local']); doc[key] = value
            values[1]['local'] = encoded(doc)
            values[2]['local'] = hashlib.sha256(values[1]['local']).hexdigest()
            self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')
        self.assertEqual(self.check(*fixture(), now=100001)['staticEvidence'], 'REJECTED')

    def test_duplicate_json_fields_and_oversize_are_rejected(self):
        for raw in (b'{"schemaVersion":1,"schemaVersion":1}', b' ' * 32769):
            values = fixture(); values[1]['local'] = raw
            values[2]['local'] = hashlib.sha256(raw).hexdigest()
            self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_result_contains_no_input_values(self):
        values = fixture()
        values[1]['local'] = b'private corrupted record'
        result = json.dumps(self.check(*values))
        self.assertNotIn('private', result)
        self.assertNotIn('a' * 64, result)

    def test_no_input_mutation(self):
        values = fixture(); before = copy.deepcopy(values)
        self.check(*values)
        self.assertEqual(values, before)

    def test_unknown_context_receipt_or_pin_cannot_expand_scope(self):
        for part in range(3):
            values = fixture()
            values[part]['approved'] = True
            self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_invalid_window_and_clock_types(self):
        for key, value in [('windowEndMs', 160001), ('windowEndMs', 100000),
                           ('windowStartMs', -1), ('windowStartMs', True),
                           ('windowStartMs', 130001)]:
            values = fixture(); values[0][key] = value
            self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')
        for now in (None, True, -1, float('nan')):
            self.assertEqual(self.check(*fixture(), now=now)['staticEvidence'], 'REJECTED')

    def test_nested_duplicate_json_key_and_nonfinite_numbers(self):
        for replacement in (b'"postingOff":true,"postingOff":true', b'"postingOff":NaN'):
            values = fixture()
            raw = values[1]['staging'].replace(b'"postingOff":true', replacement)
            values[1]['staging'] = raw
            values[2]['staging'] = hashlib.sha256(raw).hexdigest()
            self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')

    def test_each_required_fact_is_mandatory_and_typed(self):
        for kind in ('local', 'remote', 'auth', 'staging'):
            for key in json.loads(fixture()[1][kind])['facts']:
                for omit in (False, True):
                    values = fixture(); doc = json.loads(values[1][kind])
                    if omit:
                        del doc['facts'][key]
                    else:
                        doc['facts'][key] = None
                    values[1][kind] = encoded(doc)
                    values[2][kind] = hashlib.sha256(values[1][kind]).hexdigest()
                    self.assertEqual(self.check(*values)['staticEvidence'], 'REJECTED')


if __name__ == '__main__':
    unittest.main()
