# Mobile Baseline

The existing voice contract is
`services/contracts/voice-capture-service.ts`. It exposes platform recording and
a `VoiceAnalyzerService` split into `transcribe` and `analyze`. The selector
`services/voice-analyzer-service.ts` chooses the deterministic fixture only under
`__DEV__`; release already throws `analysis_unavailable`. Phase 09 must preserve
recorder/microphone/local-file ownership and replace only the analyzer workflow
with a live API adapter plus explicit unavailable states.

Assistant currently has no production selector. `features/assistant/
assistant-queries.ts` imports `services/mocks/assistant-service.ts` directly. The
shared `AssistantService` interface lives in
`services/contracts/assistant-notifications-service.ts` and covers consent,
availability, conversations/responses, previews, confirmation/cancel, and
feedback. The mock locally decrements quota, fabricates content/evidence, and can
invoke planning. Those behaviors must move behind the Phase 09 server boundary.

Current assistant context building reads finance/planning plus a mock report
service. Phase 09 may expose only Specs 005-008 context and cannot implement the
Phase 10 report dependency. Existing UI domain action kinds include navigation and
later-domain affordances; the live adapter accepts only Phase 09 allowlisted
actions and surfaces unsupported ones without execution.

Fixtures under `services/mocks` and test utilities remain explicit test/demo
inputs. Release builds must never import them through the voice/assistant
production selectors.
