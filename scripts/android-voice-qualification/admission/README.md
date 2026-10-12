# Offline first-launch admission evidence validator

This module is a pure, preliminary schema validator. It has no device, network,
filesystem, authentication, deployment or financial side effects. **It cannot
authorize a launch. Every result is `BLOCKED`.** A syntactically complete set of
static receipts is `STRUCTURALLY_COMPLETE_UNQUALIFIED`, never a preservation
qualification. Production adapters, producer provenance and a preservation
argument covering the full launch window do not yet exist here.

The intended device remains the existing Android user. This module neither
creates another user nor changes the application's startup behavior.

## Optional Android observation parser

`parse_probe.py` implements the actual optional collector receipt parser. It
strips only its thirteen closed version-2 `admission*` fields and passes all remaining text
to the existing `../parse-private-probe-receipt.py` parser. Unknown fields,
duplicate fields, missing fields, private identity/fingerprint failures and
malformed execution envelopes produce only a sanitized `INDETERMINATE` result.
The original private verdict is retained separately in `privateReceipt`.

The caller supplies the exact run nonce, deadline and current time. The parser
requires `observedAt <= now < deadline` and a maximum 600000ms observation
horizon, matching the collector. This is a diagnostic bound, not authorization
for a ten-minute launch. Host/device clock alignment, nonce single-use and
qualified producer provenance remain outside the parser. Counts are bounded
to 1048576; local status is recomputed from owners, pruning, finance and Tracking
counts, schema completeness, legacy cleanup and both Tracking states. Even a consistent no-local-
blocker observation remains `BLOCKED_EXTERNAL_ASSURANCES_REQUIRED`.

`admissionTrackingSources` and `admissionNativeIntake` each accept only
`INACTIVE`, `ACTIVE` or `UNKNOWN`. A complete stable opted-in snapshot must
establish both inactive before local status can be `OBSERVED_NO_LOCAL_BLOCKER`.
The exact AsyncStorage source key and one native preferences XML are read
without SharedPreferences initialization or writes. The additional XML has
private integrity coverage while the original Voice fingerprint is unchanged.
Missing opt-in, malformed values or ambiguous state cannot prove inactivity.

Version-2 native suspension semantics are bound to the exact preservation
client APK in `PrivateProbePolicy.requireAdmissionTarget`. Historical allowed
APKs retain ordinary Voice diagnostics but cannot request this admission
extension. The old client ignored the native suspension preference, so the
new interpretation must never be applied to its bytes.

The implemented receipt has no owner/session binding, token or identifier
fields. The four-producer schema below is only a future offline design and is
not an adapter for the actual Android observation. Nothing populates remote or
auth proof from local output.

## Interface and strict envelope

`evaluate(context, receipts, pins, now_ms=...)` accepts four exact receipt byte
strings, keyed `local`, `remote`, `auth`, `staging`, and their separately supplied
SHA256 pins. A pin checks byte integrity; it cannot prove the producer's truth
or independence. Supplying one's own matching receipt and pin cannot admit a
launch. No function derives missing facts or replaces unknown facts with safe
defaults.

The version 1 context has exactly:

| Field | Requirement |
| --- | --- |
| `schemaVersion` | integer 1, never boolean |
| `nonce` | 32 random bytes encoded as 64 lowercase hexadecimal characters |
| `apkSha256`, `sourceSha256` | exact intended APK and source-bundle SHA256 |
| `windowStartMs`, `windowEndMs` | integer UTC epoch milliseconds; future window at most 60 seconds |

The nonce must be generated and single-use enforced by a future qualified
controller. This stateless validator cannot detect previously consumed nonces.
The source bundle is not a Git SHA1. A receipt repeats every context field and
adds only `kind`, `observedAtMs`, `facts`. Observations must be no more than
30 seconds old, never future dated. Window start must be between assessment
time and 30 seconds later. These limits are structural bounds, not an assurance
of safety between observation and launch. Device clock agreement and trusted
clock acquisition remain prerequisites outside this function.

Receipt JSON rejects duplicate keys at any level, extra keys, oversized input,
wrong types, missing fields, unknown values and hash mismatches. Results expose
only closed constants, never receipt data or exception text.

## Proposed facts (not implemented producer claims)

This historical four-producer design is not the current launch checklist.
The qualified preservation client now returns before unconfirmed automatic
Voice recovery and retains durable data on unavailable authentication restore.
Do not reintroduce remote Voice binding or destructive-cold-sign-out assumptions
for that client. Current source-bound requirements are recorded in
`docs/evidence/2026-10-12-acceptance-current.md`; normal metadata/cache effects
and actual automatic submission risks must be assessed separately.

| Producer | Required facts |
| --- | --- |
| Local private collector | zero batch rows prunable through window end; zero finance queued/sending operations; Tracking already inert; complete schema; no pending legacy cleanup; protected journal fingerprint; owner/session commitment |
| Remote read-only collector | matching owner/session commitment; legacy session not confirmed; zero preservation-relevant incoming changes |
| Auth collector | matching owner/session commitment; valid same-owner identity; no sign-out cleanup exposure |
| Staging verifier | posting OFF; zero active posting epochs; unchanged protected baseline |

The exact field names and types are the closed `FACTS` dictionary in
`admission_gate.py`. Local Java/native output must be explicitly adapted and
qualified before it can become a receipt. In particular, local schema or queue
inspection cannot establish remote status, auth validity or future safety.

## Privacy-safe binding recommendation, not an implemented protocol

A future local/remote binding can use a one-run random 256-bit HMAC key and
domain-separated, length-delimited UTF-8 fields containing the same canonical
owner identity and Voice session identifier. Both sides compute the commitment
inside their existing trust boundaries; only the commitment and closed verdicts
leave those boundaries. The run nonce, APK hash and scope version must enter
the commitment, preventing accidental cross-run reuse. A public nonce with
plain SHA256 is not a confidentiality guarantee for guessable identifiers.

Do not extract Clerk tokens, dump SecureStore, export raw owner/session IDs, or
refresh an auth session merely to populate this draft. If the device and server
do not already have access to the same canonical identity, binding is unknown.
A server-side collector may compare commitments against authorized Staging
records internally and return only an exact unique match count and closed
status. It must not export candidate records or log the ephemeral HMAC key.
Transport, bounded query cardinality, uniqueness, key lifetime and in-memory
handling need independent qualification before implementation or use.

An auth-session binding is a separate concern from a Voice-session binding.
The draft shared commitment establishes only common owner/Voice identity; it
does not validate a Clerk token, session, expiry or owner authentication. Those
facts require a separately qualified auth adapter; unavailable proof is BLOCKED.

## Remaining preservation argument

A snapshot that the Voice session is unconfirmed is insufficient if its state
can change before or during launch. The same problem applies to incoming finance
changes, Tracking configuration and auth revocation/expiry. The installed client
performs token refresh (`captureLiveClerkIdentity`), finance synchronization
(`AppShellProvider`), automatic Tracking submission before permission inspection
(`automatic-tracking-coordinator`), and legacy confirmed-receipt reconciliation.
Posting OFF alone does not prevent those operations.

No read-only collector can manufacture an enforced preservation window. A
reviewed source-level proof or separately approved and qualified mechanism must
cover the complete window and permitted metadata writes before a launch gate
can acquire an executable PASS path. This module deliberately has no caller
boolean or optional flag that bypasses that requirement. The latest preserved
Redmi installation check is not a substitute for fresh launch admission.

## Synthetic tests

Run from the repository root:

```powershell
python -B -m unittest discover -s scripts/android-voice-qualification/admission -p test_admission_gate.py
python -B -O -m unittest discover -s scripts/android-voice-qualification/admission -p test_admission_gate.py
```

The tests use fabricated facts and hashes only. They cover valid-shaped evidence
remaining blocked, malformed/missing/unknown evidence, exact types, window and
freshness boundaries, mismatched bindings/context/pins, duplicate JSON keys,
extra-field injection, nonfinite values, output redaction and input immutability.
They do not claim device, backend, auth or full-window preservation qualification.
