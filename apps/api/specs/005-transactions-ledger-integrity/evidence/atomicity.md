# Phase 05 Account-Opening Atomicity Evidence

On 2026-08-30 the live PostgreSQL integration suite exercised account creation
and its optional opening entry through one `PoolClient` transaction.

The completed positive command produced exactly one account, transaction,
posting, projection, completed idempotency key, two audit events, and two outbox
events. Replaying the same key and normalized request returned the exact stored
JSON response without adding rows. A negative opening posted the signed amount;
a zero opening created only the account and zero projection, with no transaction
or posting.

The suite injected database exceptions at the account audit, account outbox,
ledger audit, ledger outbox, and idempotency completion triggers. It also forced
the opening-posting command to reject an unsafe amount after the account insert.
Every case returned an error and retained no new account, transaction, posting,
projection, audit event, outbox event, or idempotency key. Owner transaction
counts before and after every injected failure were equal.

Commands:

```text
npx jest --selectProjects integration --runInBand --runTestsByPath test/integration/ledger/account-opening.integration.spec.ts
Result: 1 suite passed, 3 tests passed

npx jest --selectProjects unit e2e --runInBand --runTestsByPath test/unit/reference/account.service.spec.ts test/unit/reference/reference.contracts.spec.ts test/unit/reference/reference.service.spec.ts test/unit/ledger/ledger.service.spec.ts test/e2e/reference/account.e2e-spec.ts
Result: 5 suites passed, 47 tests passed
```
