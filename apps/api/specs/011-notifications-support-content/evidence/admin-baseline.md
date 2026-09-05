# Admin Baseline

Reviewed `apps/admin-web/src/features/communications` routes, Zod contracts,
repository, hooks, shared safe UI components and tests, plus the communications
browser suite. The current UI already models templates, campaigns, delivery logs,
support tickets/notes/categories, feedback, abuse and content.

The backend permission manifest already exposes the exact relevant notification,
support, feedback, abuse and content keys. The Admin client has a one-time campaign
schedule contract but no scheduled content-publication contract. Therefore Phase 11:

- aligns the repository/contracts/hooks with the server OpenAPI and removes owned
  no-op handlers;
- keeps aggregate-only audience previews and redacted delivery/file/note fields;
- implements approved content publication immediately, without inventing a
  `content.publish.schedule` job;
- does not enable production MSW fallback or take Phase 14 provider selection.

