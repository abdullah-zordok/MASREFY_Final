# Test-quality review

The suites were reviewed for assertions that can pass without behavior, mocked-away
authorization, stale clocks, nondeterminism, missing negative checks, and inflated
provider claims. A reports contract with a fixed expiry was made deterministic by
freezing its clock. Attachment authorization gained a fail-first test that proves
Storage verification is not reached for a foreign owner and a SQL predicate check.
Static contract/security tests are paired with behavioral unit tests and live-capable
pgTAP/integration suites. Real providers and locally unavailable database tests are
not claimed as passing.
