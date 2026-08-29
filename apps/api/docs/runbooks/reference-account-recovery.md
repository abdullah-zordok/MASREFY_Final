# Reference Data, Categories, and Accounts Recovery

Backend on-call owns API/database recovery. Security on-call joins for permission,
RLS, audit, or ownership anomalies. Platform Operations owns cache and deployment
health. Never delete reference, category, account, rate, audit, or outbox history
to make reconciliation pass.

## Triage

1. Capture release version, request ID, stable error code, affected route family,
   migration checksum result, outbox depth, and the three bounded reference
   metrics. Do not capture names, bilingual labels, notes, last four, rate values,
   Admin reasons, tokens, SQL parameters, or user/resource IDs in broad logs.
2. Disable the affected route at the deployment boundary if authorization,
   ownership, audit, or outbox atomicity is uncertain. Reference reads may remain
   available only when their canonical database hash and RLS checks are healthy.
3. Compare table/constraint/index/policy/function/seed counts with pgTAP tests
   016-018 and run migration checksum verification. Repair only with a new
   forward migration; never edit an applied migration or force a checksum.

## Seed Drift and Reference Disablement

Run the deterministic seed assertions from test 016. Reapplying the approved
`INSERT ... ON CONFLICT DO NOTHING` set must insert zero rows and must not change
versions, timestamps, audit evidence, or Admin-disabled rows. If a code or system
key is missing, block release and add a reviewed forward seed migration. Disable
a currency/country/category through the typed Admin command with recent MFA,
reason, and expected version; never delete its natural key or referenced history.

## Audit or Outbox Failure

A reference/category/account mutation must have one resource change, one audit
event, and one outbox event in the same transaction. Query by the bounded request
ID and aggregate ID. Zero of all three is a safe rollback and may be retried after
the dependency is restored. Any partial set is a critical invariant failure:
stop writes, preserve evidence, reconcile from the immutable audit/outbox tables,
and ship a forward correction. Do not fabricate missing audit rows manually.

## Cache Loss or Cross-Replica Staleness

Local cache loss is safe: restart or clear the process cache and allow an
authorized database read. For suspected staleness, compare the response ETag with
the canonical ordered database hash, confirm a hash check occurs on every request,
and verify the Admin mutation emitted its event. Keep serving from PostgreSQL
while investigating; no Redis or manual cache value is required by Phase 04.

## Category and Account Reconciliation

Count categories/accounts by owner and lifecycle state, duplicate active labels,
category parent/merge cycles, cross-owner links, active defaults per owner, closed
date violations, and currency/type violations. Run pgTAP 018 plus the live Phase
04 integration suites. Correct invalid data with a reviewed, idempotent forward
migration under maintenance mode. Archive/restore/merge/close through guarded
commands; never rewrite ownership, currency, versions, timestamps, or history.

## FX Absence

No provider worker or secret is configured in Phase 04. Missing or stale approved
metadata must return `FX_UNAVAILABLE`; same-currency identity is the only computed
rate. Do not seed, estimate, invert, scrape, or simulate a provider rate. A manual
Admin row requires exact write permission, recent MFA, reason, validation, audit,
and outbox evidence.

## Migration Failure, Previous Image, and Forward Fix

Release A is additive. Release B first proves no invalid preference currency,
adds the FK `NOT VALID`, then validates it. The previous application must pass its
identity/preferences integration suite against the new schema before promotion.
On migration failure, keep the previous image serving, retain all rows, diagnose
the failed statement, and deploy a new forward migration. Never drop the five
Phase 04 tables, seeded codes, or the validated preference FK as rollback.

## Closure

Close only after checksums, clean reset, pgTAP, live integration, security,
performance, cache invalidation, build/image, and full verification pass; resource
to audit/outbox counts reconcile; alerts recover for ten minutes; no provider
worker is enabled; and no later-Spec or client-cutover resource changed.
