"""Validate private, pinned static facts; never authorize a device launch.

All inputs come from a separately qualified controller. This pure module does
not read files, contact services, access Android, or manufacture evidence.
Hashes bind bytes, not truth: trusted producer qualification remains necessary.
"""
import hashlib
import json
import re


KINDS = frozenset(('local', 'remote', 'auth', 'staging'))
CONTEXT = frozenset(('schemaVersion', 'nonce', 'apkSha256', 'sourceSha256',
                     'windowStartMs', 'windowEndMs'))
FACTS = {
    'local': {'batchPrunableThroughWindow': 0, 'financeQueuedOrSending': 0,
              'trackingInert': True, 'schemaComplete': True,
              'legacyCleanupPending': False, 'protectedFingerprint': None,
              'ownerSessionBinding': None},
    'remote': {'ownerSessionBinding': None, 'legacyConfirmed': False,
               'incomingPreservationChanges': 0},
    'auth': {'ownerSessionBinding': None, 'sameOwnerValid': True,
             'signOutCleanupExposure': False},
    'staging': {'postingOff': True, 'activeEpochs': 0, 'baselineUnchanged': True},
}


def _require(condition):
    if not condition:
        raise ValueError('invalid admission evidence')


def _digest(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def _unique(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result)
        result[key] = value
    return result


def evaluate(context, receipts, pins, *, now_ms):
    """Return a closed, identifier-free verdict; missing/unknown always blocks.

    The controller supplies the intended <=60 second window and current time.
    This draft admits only static observations <=30 seconds old at assessment;
    even complete observations cannot establish preservation for a future run.
    No optional flag can bypass that remaining requirement.
    """
    try:
        _require(type(context) is dict and set(context) == CONTEXT)
        _require(type(context['schemaVersion']) is int and context['schemaVersion'] == 1)
        for key in ('nonce', 'apkSha256', 'sourceSha256'):
            _require(_digest(context[key]))
        for key in ('windowStartMs', 'windowEndMs'):
            _require(type(context[key]) is int and context[key] >= 0)
        _require(type(now_ms) is int and now_ms >= 0)
        _require(now_ms <= context['windowStartMs'] <= now_ms + 30000)
        _require(0 < context['windowEndMs'] - context['windowStartMs'] <= 60000)
        _require(type(receipts) is dict and set(receipts) == KINDS)
        _require(type(pins) is dict and set(pins) == KINDS)
        parsed = {}
        for kind in sorted(KINDS):
            raw = receipts[kind]
            _require(type(raw) is bytes and 0 < len(raw) <= 32768)
            _require(_digest(pins[kind]) and hashlib.sha256(raw).hexdigest() == pins[kind])
            doc = json.loads(raw, object_pairs_hook=_unique)
            _require(type(doc) is dict and set(doc) == CONTEXT | {'kind', 'observedAtMs', 'facts'})
            for key in CONTEXT:
                _require(type(doc[key]) is type(context[key]) and doc[key] == context[key])
            _require(doc['kind'] == kind)
            _require(type(doc['observedAtMs']) is int and 0 <= now_ms - doc['observedAtMs'] <= 30000)
            facts = doc['facts']
            _require(type(facts) is dict and set(facts) == set(FACTS[kind]))
            for key, expected in FACTS[kind].items():
                if expected is None:
                    _require(_digest(facts[key]))
                else:
                    _require(type(facts[key]) is type(expected) and facts[key] == expected)
            parsed[kind] = facts
        binding = parsed['local']['ownerSessionBinding']
        _require(parsed['remote']['ownerSessionBinding'] == binding == parsed['auth']['ownerSessionBinding'])
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        return {'schemaVersion': 1, 'verdict': 'BLOCKED', 'staticEvidence': 'REJECTED',
                'reasons': ['INVALID_INCOMPLETE_OR_UNSAFE_EVIDENCE']}
    return {'schemaVersion': 1, 'verdict': 'BLOCKED',
            'staticEvidence': 'STRUCTURALLY_COMPLETE_UNQUALIFIED',
            'reasons': ['UNQUALIFIED_PRODUCER_PROVENANCE',
                        'FULL_WINDOW_PRESERVATION_UNPROVEN']}
