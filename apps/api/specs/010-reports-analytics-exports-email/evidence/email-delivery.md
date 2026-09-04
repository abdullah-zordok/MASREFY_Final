# Email Delivery Evidence

Date: 2026-09-04
Scope: SPEC-BE-010 US4

The focused adapter, worker, security, webhook, event-contract, and local E2E
suites pass. Fixtures prove STARTTLS/TLS 1.2 enforcement, bounded timeouts,
connection-refused/4xx retry, 5xx terminal rejection, and post-DATA ambiguity.
Recovered `sending` work terminalizes as `DELIVERY_ACCEPTANCE_UNKNOWN` without a
second SMTP call. Identical signed webhook replays are accepted and conflicting
payloads are rejected through a durable Postgres receipt fence.

Messages have one normalized recipient, a fixed subject/sender, stable Message-ID,
generic text, no BCC, and no attachment. Safe observable fields are limited to
fixed job/outcome/error-code values; no address, URL token, financial value,
provider body, credential, or secret is retained here.
