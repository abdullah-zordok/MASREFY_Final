# Admin Analytics Evidence

Date: 2026-09-04
Scope: SPEC-BE-010 US5

Admin overview/platform/activity contracts use their exact bounded response
schemas. Repository reads expose aggregate counts only. Routes require
`admin.overview.read`; export creation/status require `privacy.exports.manage`
and recent authentication. User-level financial exports additionally call the
existing time-bound `support.access.use` grant with `financial-report/read-aggregate`.

Export attempts capture immutable snapshots, use idempotency, append actor/reason/
safe-filter audit metadata, and reuse the owner-safe private-link status path.
Contract and security checks contain no raw cross-tenant amount, transaction,
balance, recipient, or report row. The focused Admin repository tests and the
three-case desktop browser flow pass, including accepted-to-ready private download.
