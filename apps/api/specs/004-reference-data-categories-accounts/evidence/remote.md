# Remote Release Evidence

Not collected. The Constitution permits a direct `main` push only after every
locally executable pre-push gate passes. The repository-wide format gate remains
open on pre-existing unrelated files, so no commit, push, CI, image scan, SBOM,
signature, or provenance result is represented as passing.

After scope approval resolves that local gate, commit only the Phase 04 paths,
push `main` without rewriting history, and replace this file with exact workflow
run IDs, commit/image digests, dependency/secret/image scan results, SBOM,
signature, and provenance evidence. Any remote failure must be fixed forward.
