# First-time post-auth profile setup

## Goal

After the existing pre-auth welcome screen, keep authentication as an explicit Clerk integration placeholder. Once a real Clerk session exists, route every account through one server-authoritative profile-setup check. Incomplete accounts enter profile setup; completed accounts go directly to Home on every device.

## Existing contracts reused

- `GET/PATCH /api/v1/me` owns the editable display name and optimistic version.
- `GET/PUT /api/v1/me/preferences` owns the default currency and optimistic version.
- `GET/PUT /api/v1/me/onboarding` owns completion. `completedSteps` containing `welcome` means post-auth profile setup is complete.
- Every mutation keeps the existing authenticated Clerk token, idempotency key, and expected-version behavior.

No new database column, local completion flag, fake user, fake token, or second routing policy is introduced.

## Flow and routing

The single entry-route resolver evaluates, in order: hydration, valid Clerk session, server profile-setup state, privacy lock, pending destination, then Home.

1. The pre-auth welcome CTA records only that the local marketing welcome was seen, then opens the temporary Clerk placeholder.
2. The placeholder contains a removal TODO and never creates a session. A real Clerk session remains the only way forward in live mode.
3. Session restoration loads profile, preferences, and onboarding from the authenticated API before protected navigation resolves.
4. Missing `welcome` completion routes to `/(onboarding)/profile-setup`.
5. Present `welcome` completion routes returning users to Home without showing setup again.

## Profile-setup screen

The screen follows the supplied mobile reference while using current Masarifi components and tokens. It always shows an editable required name and a supported-currency selector. Arabic copy is:

- Title: `وش ناديلك؟`
- Supporting text: `بنستخدم اسمك عشان نخلي تجربتك في مصاريفي أقرب لك.`
- Currency label: `العملة الأساسية`
- Helper: `اختر العملة اللي تستخدمها غالبًا.`
- CTA: `متابعة`

English uses the same meaning in short natural copy. Direction, alignment, dropdown affordance, keyboard handling, safe areas, and loading/error states follow locale and existing design-system behavior. Locale changes preserve the in-memory form.

The name prefills from the real Clerk user's `fullName`, falling back to joined first and last names, then the backend display name. The backend remains the source of persisted profile data. Currency defaults to SAR only when the backend has no supported value; the selector uses the project's existing supported currency source.

## Submission and failure behavior

One submit operation is allowed at a time. It validates the trimmed name, then saves:

1. profile name;
2. default currency while preserving the remaining server preferences;
3. `welcome` completion last.

Marking completion last makes retries safe: a partial failure cannot unlock Home. Existing idempotency and version contracts make repeated requests deterministic. A version conflict reloads authoritative data without discarding the user's visible form; network and server failures show retry UI and preserve both fields. Navigation happens only after the server confirms `welcome` completion.

## Verification

Focused tests cover the entry-route truth table, first-time and returning accounts, persisted completion across local reset, Clerk prefill fallbacks, required name, supported currency/default SAR, duplicate-submit prevention, ordered saves, partial failure and retry, conflict refresh, loading/error UI, RTL/LTR, locale switching, and placeholder auth behavior. Typecheck, lint, focused Jest suites, and Android device checks complete verification.
