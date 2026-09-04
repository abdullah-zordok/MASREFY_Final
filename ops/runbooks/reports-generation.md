# Report generation

## Generation failures

Check `report.generate` outcomes by safe error code, Storage health, output-size limits, and the worker deployment. Retry only failed immutable attempts; never regenerate ledger facts implicitly.

## Expiry backlog

Confirm Storage deletion health, then run the report worker until `report.output.expire` drains. A missing object counts as deleted; do not restore expired links.

## Rollback

Stop report workers, deploy the prior API/worker image, and use a forward migration to disable new schedule claims. Report snapshots are immutable and must not be rewritten during rollback.
