# Masarifi Project Structure

## Repository map

```text
MASREFY _Final/
├── apps/
│   ├── api/             # NestJS API, worker, migration process, OpenAPI and tests
│   ├── admin-web/       # Next.js Admin app, Vitest, Playwright and Sites build
│   ├── mobile/          # Expo/React Native app and local Android tracking module
│   └── marketing-web/   # reserved public-site boundary
├── supabase/            # configuration, migrations, checksums, seed and pgTAP tests
├── docker/              # pinned non-root backend image and local/production support
├── ops/                 # operational dashboards, alerts and runbook assets
├── packages/            # reserved shared-package boundaries
├── docs/                # product, architecture, API, security and deployment material
└── .github/workflows/   # application, database, security, image and release gates
```

## Runnable applications

### API and workers

`apps/api` contains the implemented identity, reference data, ledger, sync, planning, tracking, AI, reports, engagement, security and operations modules. It builds separate API, worker and migration entry points.

```powershell
cd apps/api
npm ci --ignore-scripts
npm run verify
```

Database and image checks additionally require a running Docker engine:

```powershell
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run test:release-image
```

### Admin web

`apps/admin-web` is the implemented Admin application with Clerk protection, live API repositories, role projection, audit/security, customer support, AI, notification and operational surfaces.

```powershell
cd apps/admin-web
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run build
npm run build:sites
```

### Mobile

`apps/mobile` is the implemented Expo application. It includes local persistence and sync, finance/planning/reporting/assistant journeys, notifications, voice, and the Android SMS/notification tracking module.

```powershell
cd apps/mobile
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm run check:frontend-quality
npx expo prebuild --platform android --no-install
npx jest --forceExit
```

## Deployment boundaries

- API, worker and migration use the same built image with separate entry points.
- Supabase migrations and checksums are the database source of truth.
- Admin supports the standard Next build and the repository's Sites/Vinext build.
- Mobile signed builds use `eas.json`; real signing, provider credentials and store approval remain external release gates.
- `Front_end`, generated build directories, caches and local dependency folders are not application source.
