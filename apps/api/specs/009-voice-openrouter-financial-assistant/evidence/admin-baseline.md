# Admin Baseline

The current Admin AI surface is already substantial and its Zod/UI contracts are
the compatibility baseline:

- `features/ai/contracts.ts`: bounded provider/model/overview/operational/prompt
  resources and action contracts;
- `features/ai/repository.ts`: `/api/v1/admin/ai` probe, overview, providers,
  models, prompts/usage/failures/reports/safety-rules, detail, and action routes;
- `features/ai/hooks.ts` and page/view components: query/action consumers;
- `mocks/handlers/ai.ts`, fixtures, and phase state: development/test simulation.

The action schema currently requires a fixture-specific
`CONFIRM-SPEC-006` token. Phase 09 must replace it with the existing authenticated
Admin recent-MFA/reason/idempotency/version boundary; no hard-coded confirmation
token remains in the production contract.

The OpenAPI design retains existing repository compatibility routes while adding
the explicit route/prompt/governance methods required by the Master Plan. Admin
reads remain bounded/redacted; no raw customer message/audio, provider body,
secret, Storage reference, or unrestricted prompt content is exposed. MSW stays
test/development-only and cannot become a production fallback.
