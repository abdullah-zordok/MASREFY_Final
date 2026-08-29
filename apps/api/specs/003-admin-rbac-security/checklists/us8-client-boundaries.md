# US8 — Client boundary evidence

- [x] Runtime OpenAPI contains exactly 38 Phase 03 paths and 45 operations with matching exact permission metadata.
- [x] Admin 151-key aliases, states, opaque cursors, masks, and future adapters are mapped in `contracts/client-mapping.md`.
- [x] Mobile security-event/export/deletion projections expose no raw IP, token, provider payload, Storage key, or unrestricted evidence.
- [x] `__scenario`, role/permission headers or queries, fixture authority, session storage, and mock confirmations cannot grant server authority.
- [x] `git diff --exit-code -- apps/admin-web apps/mobile` passes: no client production source changed.

Coverage: FR-044–FR-045, AC-015, SC-010.
