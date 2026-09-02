# Quickstart: Verification and Handoff

Run from `apps/mobile`. Keep Jest temp files on drive D and invoke Jest directly so
`--runInBand` reaches Jest.

## Native privacy prerequisite

Generate the ignored Android project before any run that includes
`platform-privacy-config.test.ts` (the complete suite includes it):

```powershell
npx expo prebuild --platform android --no-install
```

This is required in every clean checkout/worktree. The test intentionally reads the generated
manifest so the SMS-permission removal and backup prohibition are verified in native output,
not inferred only from `app.json`.

## Focused red/green loop

```powershell
$env:TEMP='D:\CodexTemp\client-remediation-safe-phase1'
$env:TMP=$env:TEMP
$env:NODE_OPTIONS='--max-old-space-size=1024'
node .\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath <focused-tests>
```

Cover canonical effects/parity, transfer/category validation and SQLite repair, remittance/demo
separation, refund eligibility/bounds, payoff validation/net worth/replay, obligation bilingual
accessibility, production/demo/unsupported/disabled tracking, and the unchanged obligation
accessibility assertion.

## Complete Mobile gates

```powershell
npm run typecheck
npm run lint
npm run check:frontend-quality
node .\node_modules\jest\bin\jest.js --runInBand --no-cache
```

## Integration and evidence gates

- Before overlapping storage edits, confirm SPEC-BE-006 is committed; integrate local main once,
  choose the next unused migration, inspect conflicts, and rerun affected plus complete gates.
- Confirm no changes under `apps/api`, `apps/admin-web`, `supabase`, backend specs/plans, or the
  external archive.
- Record exact commands/results only in relevant remediation entries.
- Request independent review, resolve valid findings, commit a clean feature branch.
- Do not push or merge.
