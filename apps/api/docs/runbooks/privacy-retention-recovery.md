# Privacy Export, Deletion, and Retention Recovery

Owner: Privacy operations with Security on-call; legal policy changes require the designated human policy approver.

For export failure, keep the object private, expire the request, delete any partial object by its opaque reference, verify handler-manifest completeness, then retry through the guarded action. Never log a signed URL, object key, package body, email, or provider response. Close only after HEAD size validation, manifest/checksum completion, owner/recent-auth signing, and expiry deletion.

For deletion failure, pause the worker, recheck cancellation and every active hold immediately before resuming, reconcile every registered handler outcome, and retry idempotently. Provider session revocation completes before local session references are cleared. Never use generic dynamic SQL or cascade-delete audit/security evidence.

For retention, process only enabled, human-approved policy rows through the registered owner handler in bounded batches. Overlapping holds are rejected under an advisory lock. On a hold race, retain the object and retry from a fresh candidate read. Roll policy changes back with a new versioned update, not history deletion.

Close after all handler outcomes are accounted for as deleted, anonymized, archived, or retained under an identified active hold; profile/session state is reconciled; export objects are expired; backlog/age alerts recover; and no sensitive value appears in operational evidence.
