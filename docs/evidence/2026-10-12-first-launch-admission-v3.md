# Narrow first-launch cleanup admission

The previously approved installation-only scope completed successfully at 11:10:45–11:11:19 UTC on 12 October 2026. The qualified preservation client is installed, its UID and original enabled/stopped state were restored, and its retained Voice fingerprint/summary is unchanged. A separate independent review verified the recorded execution evidence. That one-shot approval is consumed; no app launch occurred.

The v2 observation established inactive local Tracking sources and native intake, zero pending finance and stored Tracking rows, current schema and no detected legacy cleanup. Independent startup review then identified three additional app-owned preservation branches that those facts do not cover:

- The foreground coordinator loads the legacy SMS queue before checking source consent; queue loading can remove a non-null legacy AsyncStorage value.
- Cold Tracking restoration can clear a previous native owner queue or remove a mismatched JS context, even with intake suspended.
- Privacy-lock migration and malformed PIN loading can remove retained legacy or owner-scoped values.

Optional v3 conservatively reports four closed absence observations using the already captured RKStorage, SecureStore/default preference XML and native Tracking XML. It does not add a file inventory, decrypt PINs/identity contexts, export preference names, or change application data. Both raw and keychain-prefixed preference names, owner suffixes and default-preference fallback are covered. A retained empty or malformed native context is present, not absent. Missing opt-in, unstable snapshots and incomplete walks cannot complete these observations.

The `parse_launch` entry point in `admission/parse_probe.py` requires the exact seventeen v3 fields, the caller-bound nonce/deadline and the original private identity/journal proof. Ordinary v2 parsing remains separate. Each new fact is ABSENT/PRESENT/UNKNOWN; a consistent local no-blocker result requires all four ABSENT. Every receipt remains externally BLOCKED and never grants launch authorization.

Focused Java qualification passed 40 new cleanup checks alongside the unchanged v2 cases. Both parser versions pass normally and under Python optimization. Full portable qualification subsequently passed, including 925 whole-store checks and 215 real-migration schema checks. The C-drive temporary directory filled during one attempt; a new exclusive E-drive temporary directory was used without deleting existing evidence. Windows-only unavailable symlink/native-identity/POSIX checks remain explicit; Linux CI must execute all such protection cases. New disposable Android v3 qualification remains pending at this evidence revision.

The prepared first-launch controller requires fresh v3 absence admission immediately before one no-tap MainActivity observation, a deadline covering its entire observation/stop budget, posting-OFF Staging pre/post baseline checks and independently verified cleanup. Ordinary cache/profile/cursor/push effects must be explicitly allowed in its human scope. Postlaunch Voice semantic summaries are compared, rather than incorrectly requiring a whole-store fingerprint to remain equal after normal cache writes. This does not prove payload byte equality or full application acceptance.

Expo SecureStore can refresh or discard unusable credential entries during normal SDK handling. No deliberate login/logout/account switch, revocation or authentication bypass is included; absolute SDK token-cache byte preservation is not established by these four absence facts. This limitation must remain explicit in the launch scope.

This change does not activate posting, transact, deploy, merge a protected branch or authorize Production. The next physical-device operation requires a newly qualified, reviewed, artifact-bound scope and explicit approval.
