# Test review

Reviewed changed tests for independent setup/cleanup, deterministic fixtures, real boundary coverage, async completion, negative assertions, and flake risk. No release blocker remains.

- Provider behavior is fixture-driven; no external key is required.
- Live database suites use unique IDs, transactions or explicit cleanup, and close pools.
- Money, quota, replay, concurrency, ownership, expiry, cancellation, privacy, and migration paths assert effects as well as status.
- The Mobile full-suite timeout seen during a three-suite parallel run disappeared under the canonical isolated `--runInBand` execution: 411 suites/1,671 tests passed.
- Phase 09 Admin Playwright passes 25/25 across five viewports. A scoped accessibility regression uses the AI filter landmark to avoid the unrelated shell search field.
