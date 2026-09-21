# Masarifi

Masarifi is a multi-application personal-finance platform with a NestJS API and worker, a Next.js Admin application, an Expo mobile application, Supabase migrations and RLS tests, and a non-root production container.

| Component | Location | Primary checks |
|---|---|---|
| API, worker, migrations | `apps/api` | `npm run verify` |
| Admin web | `apps/admin-web` | `npm run typecheck && npm run lint && npm test && npm run build` |
| Mobile | `apps/mobile` | `npm run typecheck && npm run lint && npm run check:frontend-quality && npx jest --forceExit` |
| Database | `supabase` | Run the `apps/api` Supabase and database scripts with Docker available |
| Production image | `docker/backend.Dockerfile` | `npm run test:release-image` from `apps/api` |

Each application has its own npm lockfile. Use `npm ci --ignore-scripts` for reproducible verification and copy the relevant `.env.example`; never commit real credentials.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the repository map and [Phase 14 external gates](apps/api/specs/014-client-cutover-mock-migration-production-readiness/evidence/external-gates.md) for hosted, provider, signed-device, backup, rollback, and release steps that cannot be proven from a local checkout.
