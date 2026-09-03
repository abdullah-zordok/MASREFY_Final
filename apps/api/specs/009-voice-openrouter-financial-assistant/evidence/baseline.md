# Baseline Evidence

Captured 2026-09-03 before implementation.

| Check                     | Result                                                      |
| ------------------------- | ----------------------------------------------------------- |
| branch                    | `main`                                                      |
| local HEAD                | `bdffc5a39dc4c863827dc750f464ddd844221425`                  |
| `origin/main` after fetch | `bdffc5a39dc4c863827dc750f464ddd844221425`                  |
| Node                      | `v24.16.0`                                                  |
| npm                       | `11.17.0`                                                   |
| Docker                    | `29.7.2`                                                    |
| Supabase CLI              | `2.116.0`                                                   |
| SpecKit helper scripts    | absent under `apps/api/.specify`; checked-in templates used |

Initial status contained only the feature pointer/new Phase 09 artifacts plus
these protected untracked paths, which are excluded from every stage/commit:

```text
.agents/plugins/
apps/api/pnpm-lock.yaml
apps/api/pnpm-workspace.yaml
```

The repository has no Phase 09 implementation at baseline. Existing migrations
and tests through Phase 08 are immutable inputs. Work proceeds directly on the
synchronized checkout as explicitly requested; no branch or worktree is created.
