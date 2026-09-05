# US5 — Quarantined attachments

Coverage exercises server-generated keys, participant authorization, short signed
uploads, exact object metadata/head verification, hash/size/type/magic checks,
message binding, idempotent finalize, bounded ClamAV INSTREAM framing, retry and
terminal scan outcomes, clean-only downloads, rejected deletion, orphan cleanup,
lease replay, and cross-user denial. The service now authorizes the ticket owner
before any privileged Storage verification, with a matching SQL owner predicate.
