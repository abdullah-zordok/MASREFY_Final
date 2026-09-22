# Production Container Contract

Build one immutable image from `docker/backend.Dockerfile`, scan it, sign its
digest, and deploy that same digest for migration, API, and worker commands.
Migration runs pre-traffic and must succeed before the API rollout starts.
The migration command applies checksum-verified SQL directly through `pg`;
Supabase CLI remains a development/CI dependency and is excluded from runtime.

- Run as UID/GID `65532`, with a read-only root filesystem.
- Mount only a bounded writable `/tmp`; inject secrets at runtime from the
  deployment secret store, never through build arguments or image layers.
- Expose port 3000 only for the API. Worker and migration have no port/service.
- Use `/health/live` for container liveness and internal `/health/ready` for
  traffic readiness. Do not expose readiness publicly.
- Send `SIGTERM`, stop traffic/claims, and allow at most 30 seconds before kill.
- Set explicit CPU/memory requests and limits from measured load-test evidence.
- Retain the previous signed image digest for rollback. Schema changes remain
  additive and N-1 compatible.

Release is blocked when the image runs as root, has a writable root filesystem,
contains development dependencies/source maps/secrets/shell/package manager, or
has an exploitable Critical/High vulnerability.

## Staging Compose contract

`docker/staging/compose.backend.yml` runs the accepted image digest as separate
migration, API, and worker processes. Set `MASARIFI_BACKEND_REPOSITORY` to the
registry/repository without a tag and `MASARIFI_BACKEND_DIGEST` to its 64-character
SHA-256 digest. The rendered contract rejects mutable image tags. The API binds
only to loopback; the worker and migration publish no ports. Keep the three environment files at
`/etc/masarifi/{api,worker,migration}.env`, mode `0600`, or override their paths
with the corresponding `MASARIFI_*_ENV_FILE` variables.

The backend network publishes no provider/database ports while retaining the
outbound access required for Supabase, Clerk, SMTP, Expo, and enabled AI routes.
Run ClamAV on that private network or a private host address and set
`MASARIFI_CLAMAV_HOST` only in the worker environment. Do not publish ClamAV
port 3310. Admin hosting and TLS termination stay outside this manifest because
the approved host is selected during staging inventory.

Validate and run by digest:

```bash
docker compose -f docker/staging/compose.backend.yml config --quiet
docker compose -f docker/staging/compose.backend.yml --profile migrate run --rm migration
docker compose -f docker/staging/compose.backend.yml up -d api worker
```
