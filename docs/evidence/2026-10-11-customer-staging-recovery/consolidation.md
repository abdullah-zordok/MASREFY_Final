# Non-destructive consolidation proposal

Continue implementation on `codex/voice-auto-save-restoration-2026-10-11`. The requested integration branch is `codex/masarifi-complete-integration-2026-10-10`, initially pinned at `42bcb8ca93b3018d6c6e8a875de39579f0936ac3`.

The read-only ancestry audit confirms that the requested integration commit, original Voice commit `0ad0c0410b77d83b1d665b72f2f6b9bf8c38c979`, Tracking commit `3bd0c5d3149259ad69fb6a5e86083a820052b7f4` and legacy recovery commit `91213b443d51b3b2264468e660f9bf78a87e74d9` are ancestors of the active candidate. No divergent feature merge is required to consolidate the candidate into the integration branch. The exact final ahead/behind counts and commit list belong in the final external SHA-pinned receipt.

All 47 selectively recovered paths remain present; 38 match the original recovery receipt byte-for-byte after line-ending normalization. The nine evolved files are the scoped worker regressions, Home rendering/tests, earlier localized TransactionCard correction and bilingual messages. Their changes require the corresponding final regression gates; the presence check alone does not establish functional equivalence.

The original dirty Voice worktree and all other checkouts remain untouched. The integration branch is not currently checked out in any of the 19 listed worktrees. Available related task histories were inspected read-only; no authorization to message or change those tasks was inferred. Recheck task/worktree activity immediately before any branch update.

## Proposed integration procedure

1. Preserve and verify the final all-ref bundle, source archive, dirty-worktree evidence and final CI/APK/image receipts.
2. Require a clean active candidate at the exact qualified SHA, unchanged integration ref, no checkout of the integration branch and no concurrent task modifying that ref.
3. Verify `git merge-base --is-ancestor 42bcb8ca93b3018d6c6e8a875de39579f0936ac3 <qualified-SHA>` succeeds. Inspect the full commit/file diff and all original disposition decisions.
4. Fast-forward the integration ref to the qualified SHA using an expected-old-ref compare-and-swap. Use an ordinary remote fast-forward push only after verifying the remote integration ref still matches its reviewed base. Never reset another checkout, rewrite history or force-push.
5. Keep original branches, stashes, worktrees and evidence. Select the consolidated integration branch for future work only after coordinating the existing active checkout; do not create a duplicate implementation or long-lived branch.

This is a proposal, not a performed ref update. Physical and operational acceptance remains open, so the candidate must not be described as a fully accepted integration release.

## Proposed main PR

Title: `Recover customer Staging Voice, Assistant and financial onboarding while preserving Tracking safeguards`.

The description should lead with restored automatic Voice transaction persistence, independently resolved ordered events, atomic zero-balance Cash onboarding, approved grouped Today cards and the standalone Assistant route. Include the exact qualified source/image/APK identities, full CI evidence and the distinction between the completed single-event canary and pending persistent/new-customer/multi-event acceptance.

Canonical remote main was observed at `ecfba4d7de40555c122bd3b5e53e7e7fd71f6294`; its one historical merge commit is not an ancestor of the candidate, while the reviewed source/history is represented in the preserved integration lineage. Recheck the current remote and three-way PR diff before proposing any merge. This recovery does not merge into main or update main. Actual merge and Production release require separate explicit approval.
