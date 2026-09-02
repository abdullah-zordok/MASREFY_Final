# Phase 06 Tooling

- Repository-pinned and executable Supabase CLI: `2.116.0`.
- `supabase migration new [flags] <migration name>` is available.
- The CLI supports `--workdir`; Phase 06 migrations will be generated from
  `apps/api` with `--workdir ../..` before their contents are edited.
- Node engine remains 24 and TypeScript remains 5.9; no dependency is added.

Validated 2026-08-31 with:

```powershell
npx supabase --version
npx supabase migration new --help
```
