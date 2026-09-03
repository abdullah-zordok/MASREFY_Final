# Mobile and Admin Contract Mapping

## Mobile voice

| Existing client operation  | Phase 09 mapping                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| analyze/capture capability | production capability from device + `GET /meta`/safe route availability; unavailable is explicit |
| start upload               | `POST /voice/sessions`; upload only to returned signed private instruction                       |
| process recording          | `POST /voice/sessions/{id}/process` with idempotency key                                         |
| poll/read result           | `GET /voice/sessions/{id}` and `/proposal`                                                       |
| edit proposal              | edits travel only in confirm request and are server revalidated                                  |
| confirm                    | `POST /voice/proposals/{id}/confirm` with expected version/key                                   |
| reject                     | `POST /voice/proposals/{id}/reject` with expected version/key                                    |
| category preference        | bounded preference list/upsert/delete routes                                                     |

The existing `VoiceAnalyzerService` contract remains stable where practical. Its
production implementation becomes the API workflow adapter rather than a local
model/fixture. Release mode with unavailable device audio, backend route, quota,
budget, or provider returns a typed unavailable/error state. It never calls a
mock or fabricates a proposal.

## Mobile assistant

| Existing client operation               | Phase 09 mapping                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| get/grant/revoke consent                | consent routes and current policy version                                     |
| list/create/archive/delete conversation | conversation CRUD/list routes                                                 |
| list/send messages                      | message list and keyed message endpoint; SSE where selected                   |
| show evidence                           | response snapshot aliases only; protected app views refetch owned domain data |
| confirm/reject preview                  | keyed preview decision routes with expected version                           |
| rate response                           | feedback route                                                                |
| report response                         | report route                                                                  |

Production selects the HTTP adapter explicitly. Test/demo code selects the fixture
adapter explicitly. Offline assistant generation is unavailable; cached completed
redacted responses may render with their stored synchronization state.

## Admin AI

| Surface                              | Route family                     | Permission                                      |
| ------------------------------------ | -------------------------------- | ----------------------------------------------- |
| provider/model list/detail/update    | `/admin/ai/providers`, `/models` | `ai.providers.read/manage`                      |
| route list/detail/update             | `/admin/ai/routes`               | `ai.routes.read/manage`                         |
| prompt versions/tests/publish/retire | `/admin/ai/prompts`              | `ai.prompts.read/manage/publish`                |
| usage/budget/failures                | `/admin/ai/usage`, `/failures`   | `ai.usage.read`, actions `ai.operations.manage` |
| safety rules                         | `/admin/ai/safety-rules`         | `ai.safety.read/manage`                         |
| response reports                     | `/admin/ai/response-reports`     | `ai.reports.read/manage`                        |

Admin repository maps the current view models to bounded backend pages. All
mutations send expected version, idempotency key, reason, and current recent-auth
context where required. Server authorization is decisive. Provider/request/
response bodies, prompts outside explicit prompt-governance detail, audio/storage
refs, customer message text, and secrets never enter list/detail DTOs.

## Fixture and release boundary

- Mobile mocks and Admin MSW handlers remain only in explicit tests/storybook/demo.
- Production defaults to live adapters and fails configuration closed.
- Contract tests compare fixture DTO shape to OpenAPI without asserting fixture
  values in production code.
- Phase 09 replaces voice/assistant/Admin-AI handlers only. Phase 14 retains final
  all-domain mock removal, shadow cutover, deployment choreography, and launch.
- No SPEC-BE-010 report, SPEC-BE-011 notification/support, SPEC-BE-012 billing, or
  SPEC-BE-013 operations contract is added by these adapters.
