# Support attachment quarantine

## Scan failures

Keep pending, failed, and rejected objects unavailable. Verify Storage and ClamAV connectivity without logging filenames, keys, hashes, or bytes. Failed scans retry within the attempt cap; terminal/malware/magic mismatches are rejected and deleted. Reconcile uploads older than one hour as orphaned quarantine objects.

## Deletion verification

Use only attachment IDs in operational notes. Confirm the database state is rejected or orphaned, invoke idempotent object deletion, and verify a clean-only signed download cannot be issued.
