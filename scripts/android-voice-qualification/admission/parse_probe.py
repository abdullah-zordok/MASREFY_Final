"""Optional admission extension over the original strict private receipt parser.

No output text is retained on any failure. A valid receipt is only an observation
and cannot authorize launching the target or satisfy remote/auth assurances.
"""
import importlib.util
from pathlib import Path
import re


_SPEC = importlib.util.spec_from_file_location(
    '_masarifi_private_parser', Path(__file__).resolve().parent.parent / 'parse-private-probe-receipt.py')
_PRIVATE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_PRIVATE)

COUNTS = frozenset(('admissionPrunableBatches', 'admissionFinancePending', 'admissionTrackingRows'))
BOOLS = frozenset(('admissionSchemaCurrent', 'admissionLegacyCleanup'))
TRACKING = frozenset(('admissionTrackingSources', 'admissionNativeIntake'))
FIELDS = COUNTS | BOOLS | TRACKING | frozenset(('admissionVersion', 'admissionNonce',
    'admissionObservedAt', 'admissionDeadline', 'admissionVerdict', 'admissionLocalStatus'))
BLOCKED = 'BLOCKED_EXTERNAL_ASSURANCES_REQUIRED'
MAX_HORIZON_MS = 600000
MAX_SAFE_INTEGER = 9007199254740991


def _require(condition):
    if not condition:
        raise ValueError('invalid admission receipt')


def _integer(text, maximum):
    _require(re.fullmatch(r'0|[1-9][0-9]{0,15}', text) is not None)
    value = int(text)
    _require(value <= maximum)
    return value


def parse(output, exit_code, expected, *, expected_nonce, expected_deadline_ms, now_ms):
    """Validate a fresh optional receipt with caller-bound nonce and deadline.

    Host/device clock agreement and single-use nonce consumption must be supplied
    by a separately qualified controller. Ten minutes is a diagnostic horizon,
    never a permitted app-launch duration. The original private receipt verdict
    is returned separately and is never weakened by the admission observation.
    """
    failure = {'verdict': 'INDETERMINATE', 'failureCategory': 'INVALID_ADMISSION_RECEIPT'}
    try:
        _require(type(output) is str and len(output.encode('utf-8')) <= 65536)
        _require(type(exit_code) is int and exit_code == 0)
        _require(type(expected_nonce) is str and re.fullmatch(r'[0-9a-f]{64}', expected_nonce) is not None)
        for value in (expected_deadline_ms, now_ms):
            _require(type(value) is int and 0 <= value <= MAX_SAFE_INTEGER)
        admission = {}
        private_lines = []
        for line in output.splitlines():
            match = re.fullmatch(r'INSTRUMENTATION_RESULT: ([A-Za-z][A-Za-z0-9]*)=(.*)', line)
            if match and match[1] in FIELDS:
                _require(match[1] not in admission)
                admission[match[1]] = match[2]
            else:
                # Unknown/malformed fields remain subject to the original parser.
                private_lines.append(line)
        _require(set(admission) == FIELDS)
        private = _PRIVATE.parse('\n'.join(private_lines), exit_code, expected)
        _require(private.get('verdict') in ('CLEAR', 'BLOCKED'))
        _require(admission['admissionVersion'] == '2')
        _require(admission['admissionNonce'] == expected_nonce)
        _require(admission['admissionVerdict'] == BLOCKED)
        observed = _integer(admission['admissionObservedAt'], MAX_SAFE_INTEGER)
        deadline = _integer(admission['admissionDeadline'], MAX_SAFE_INTEGER)
        _require(deadline == expected_deadline_ms and observed <= now_ms < deadline)
        _require(0 < deadline - observed <= MAX_HORIZON_MS)
        typed = dict(admission, admissionVersion=2, admissionObservedAt=observed,
                     admissionDeadline=deadline)
        for key in COUNTS:
            typed[key] = _integer(admission[key], 1048576)
        for key in BOOLS:
            _require(admission[key] in ('true', 'false'))
            typed[key] = admission[key] == 'true'
        for key in TRACKING:
            _require(admission[key] in ('INACTIVE', 'ACTIVE', 'UNKNOWN'))
        clear_local = (private['owners'] > 0 and all(typed[key] == 0 for key in COUNTS)
                       and typed['admissionSchemaCurrent'] and not typed['admissionLegacyCleanup']
                       and all(typed[key] == 'INACTIVE' for key in TRACKING))
        expected_status = 'OBSERVED_NO_LOCAL_BLOCKER' if clear_local else 'BLOCKED'
        _require(admission['admissionLocalStatus'] == expected_status)
        return {'verdict': BLOCKED, 'privateReceipt': private, 'admission': typed}
    except (ValueError, TypeError, KeyError, UnicodeError, OverflowError):
        return failure
