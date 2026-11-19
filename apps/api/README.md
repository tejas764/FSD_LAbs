# CrisisMap API

NestJS REST API for the CrisisMap crisis damage reporting platform.
Serves all data, auth, queues, and analytics for both the reporter PWA and analyst dashboard.

**Base URL (dev):** `http://localhost:4000`
**API prefix:** `/api/v1/*`
**Interactive docs:** `http://localhost:4000/api/docs`

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Stack](#stack)
- [Setup](#setup)
- [Commands](#commands)
- [Modules](#modules)
- [Auth & Roles](#auth--roles)
- [Report Submission Flow](#report-submission-flow)
- [Async Queue Workers](#async-queue-workers)
- [Realtime SSE Stream](#realtime-sse-stream)
- [Analytics](#analytics)
- [Report Versioning](#report-versioning)
- [Rate Limiting](#rate-limiting)
- [Scale Validation (250k and 500k)](#scale-validation-250k-and-500k)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [API Contract](#api-contract)

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 24.14.1 (see `.node-version`) |
| npm | bundled with Node |
| Docker + Compose | for PostgreSQL, Redis, MinIO, LibreTranslate, Mailhog |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 (strict) |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | PostgreSQL 15 + PostGIS 3.4 |
| Queue | BullMQ + Redis |
| Auth | better-auth v1 (Prisma adapter) |
| Object storage | MinIO / S3-compatible |
| Translation | LibreTranslate |
| AI classification | Anthropic Claude |
| Testing | Jest + ts-jest |

---

## Setup

```bash
cp .env.example .env.local        # fill in required vars (see below)
npm ci
npm run prisma:generate
npm run prisma:migrate             # run pending DB migrations (local dev only — see note)
npm run seed                       # seed crises + sample reports
npm run start:dev                  # http://localhost:4000
```

Requires Postgres and Redis to be running:

```bash
docker compose -f ../../infra/docker-compose.yml up -d
```

---

## Commands

```bash
npm run start:dev         # Dev server with hot reload
npm test                  # Unit tests (src/**/*.spec.ts)
npm run test:e2e          # E2E tests (test/*.e2e-spec.ts)
npm run type-check        # TypeScript strict validation
npm run lint              # ESLint

npm run prisma:generate   # Regenerate Prisma client
npm run prisma:migrate    # Apply pending migrations (prisma migrate dev — local only)
npm run prisma:status     # Show migration status
npm run benchmark:scale   # Run scale benchmark scenarios (50k, 250k, 500k)
```

> **Note:** `prisma:migrate` runs `prisma migrate dev` and is for local development only.
> In production the container runs `prisma migrate deploy` automatically on startup (see `Dockerfile`).

```bash
npm run seed              # Seed local crises + sample reports (idempotent)
npm run seed:reset        # Wipe DB + re-migrate + reseed

npm run openapi:export    # Write docs/openapi.yaml from live Swagger decorators
```

---

## Modules

### Ownership boundaries

- Owns all backend domain logic, Prisma schema, and migrations.
- Owns all `/api/v1/*` REST endpoints and `/api/auth/*` better-auth routes.
- Owns queue workers, exports, translation, and AI classification pipelines.
- `apps/web` must consume this service via typed client and does not directly access the database.

| Module | Routes | Description |
|---|---|---|
| `health` | `GET /api/v1/health` | Liveness probe |
| `crises` | `GET/POST/PATCH /api/v1/crises` | Crisis lifecycle, building footprints, modular schema |
| `reports` | `POST/GET /api/v1/reports` | Report submission, versioning, moderation, SSE stream, export |
| `analytics` | `GET /api/v1/analytics/summary` `GET /api/v1/analytics/hotspots` | H3 spatial clustering, damage summary |
| `reporter` | `GET /api/v1/reporter/profile` | Anonymous reporter profile lookup |
| `account` | `GET/PATCH /api/v1/account` | Authenticated user account management |
| `auth` | `/api/auth/*` | better-auth session and credential routes |

---

## Auth & Roles

- **Anonymous reporters** — no token required for `POST /api/v1/reports`
- **Analysts / admins** — authenticate via better-auth → session cookie or JWT
- **`JwtAuthGuard`** — validates `Authorization: Bearer <token>`, returns 401 on failure
- **`RolesGuard`** — enforces `@Roles("admin")` on protected endpoints, returns 403 on mismatch
- **Protected routes** — crisis writes, report stream, export, moderation, analytics summary, account, user management

---

## Report Submission Flow

```
POST /api/v1/reports
  → Zod validation
  → Crisis exists + isActive check
  → Idempotency key dedup (24 h window)
  → EXIF stripping
  → Photo upload to MinIO
  → Report persisted (version bump if same building)
  → BullMQ jobs dispatched asynchronously:
      ai-classification  →  aiDamageLevel + aiConfidence written back
      translation        →  description translated to 6 UN languages
```

Report submission is never blocked by AI or translation latency.

---

## Async Queue Workers

| Queue | Worker | Job |
|---|---|---|
| `ai-classification` | `AiClassificationWorker` | Classifies photo; writes `aiDamageLevel` + `aiConfidence` back to `Report` |
| `translation` | `DescriptionTranslationWorker` | Translates `description` into 6 UN languages; stored in `Report.extraFields` |
| `export` | `ReportsExportWorker` | Generates CSV / GeoJSON; uploads to MinIO; emits `export.complete` SSE event with signed 24 h URL |
| `retention` | `RetentionWorker` | Soft-deletes / anonymises reports older than `RETENTION_DAYS` |

Workers are suppressed when `JEST_WORKER_ID` is set and implement `OnApplicationShutdown` for graceful teardown.

---

## Realtime SSE Stream

```
GET /api/v1/reports/stream?crisisId=<uuid>
Authorization: Bearer <token>
Accept: text/event-stream
```

| Event | When | Payload |
|---|---|---|
| `ready` | On connect | `{ crisisId }` |
| `report.updated` | Report created / superseded | `{ reportId, crisisId, version, … }` |
| `export.complete` | Export worker finished | `{ jobId, crisisId, downloadUrl }` |
| `: heartbeat` | Every 15 s (SSE comment) | — |

---

## Analytics

### `GET /api/v1/analytics/hotspots`

Clusters reports into H3 hexagons (resolution 7). Accepts optional `crisisId` and `damageLevel` filters.
Returns `h3Index`, `centerLat`, `centerLng`, `count`, `avgDamageLevel` per cell.

> Only call with a `crisisId`. Unscoped queries are expensive at large data volumes.

### `GET /api/v1/analytics/summary`

Returns report totals, trend by day, breakdown by damage level and infra type, and recent reports.
Accepts `crisisId`, `period` (7d / 30d / 90d / 365d / all), `dateFrom`, `dateTo`.

---

## Report Versioning

| Concept | Implementation |
|---|---|
| Per-building versioning | `version` counter + `supersededById` FK on `Report` |
| Duplicate detection | `isDuplicate` flag; duplicates excluded from default map view |
| Primary view | `GET /api/v1/reports` returns latest non-superseded report per building |
| History | `GET /api/v1/reports/{id}/history` returns all versions |

---

## Rate Limiting

| Scope | Default | Env var |
|---|---|---|
| Anonymous report submission | 10 / hour / IP | `RATE_LIMIT_PER_HOUR` |
| Admin export queuing | 30 / min | `RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE` |
| Admin crisis writes | 30 / min | `RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE` |

Returns `429` with `ErrorCode.RATE_LIMITED`. Respects `X-Forwarded-For` when `TRUST_PROXY` is set.

---

## Scale Validation (250k and 500k)

Large-dataset behavior is verified as part of the backend test strategy.

- Analytics scale coverage includes 250,000 and 500,000 report scenarios.
- Export worker scale coverage includes 250,000 and 500,000 row scenarios.
- Benchmark tooling supports 50k, 250k, and 500k targets for repeatable local verification.

Run focused scale checks:

```bash
npm test -- src/analytics/analytics.service.spec.ts src/queue/reports-export.worker.scale.spec.ts
npm run benchmark:scale
```

---

## Environment Variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL + PostGIS connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `API_PORT` | No | `4000` | Port the API server listens on |
| `BETTER_AUTH_SECRET` | Yes | — | better-auth signing secret |
| `BETTER_AUTH_URL` | Yes | — | Public API URL (better-auth cookie domain) |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `TRUST_PROXY` | No | — | Express `trust proxy` hop count or `true` |
| `STORAGE_ENDPOINT` | Yes | — | MinIO / S3 endpoint URL |
| `STORAGE_REGION` | Yes | — | S3 region (`us-east-1` for MinIO) |
| `STORAGE_BUCKET` | Yes | — | Bucket for photos and exports |
| `STORAGE_ACCESS_KEY_ID` | Yes | — | Object storage access key |
| `STORAGE_SECRET_ACCESS_KEY` | Yes | — | Object storage secret key |
| `STORAGE_PUBLIC_URL` | Yes | — | Public base URL for stored objects |
| `LIBRETRANSLATE_URL` | Yes | — | LibreTranslate endpoint |
| `ANTHROPIC_API_KEY` | No | (mock) | Omit to use the local stub classifier |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` | Anthropic model |
| `SMTP_HOST` | Yes | — | SMTP host for better-auth email |
| `SMTP_PORT` | Yes | — | SMTP port (1025 for Mailhog locally) |
| `SMTP_FROM` | Yes | — | From address for auth emails |
| `RATE_LIMIT_PER_HOUR` | No | `10` | Anonymous submission limit |
| `RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE` | No | `30` | Export queue rate limit |
| `RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE` | No | `30` | Crisis write rate limit |
| `RETENTION_DAYS` | No | `730` | Days before report anonymisation |

---

## Database Schema

Prisma schema lives in `prisma/schema.prisma`. This app owns all migrations — `apps/web` never runs `prisma migrate`.

Key models: `Crisis`, `Report`, `ReporterProfile`, `BuildingFootprint`, `AuditLog`, `ModularField`, `User`, `Session`.

---

## Testing

```bash
npm test              # Unit tests — all src/**/*.spec.ts
npm run test:e2e      # E2E — spins up a test Postgres + app, runs test/*.e2e-spec.ts
```

E2E tests require the Docker services to be running (or a `DATABASE_URL` pointing at a live DB).

### Rules

- Read env via `ConfigService` — never `process.env` directly.
- All constructors use explicit `@Inject()` tokens.
- Never use `console.log` — use the NestJS `Logger`.
- Prisma datasource URL configured in `prisma.config.ts` (Prisma 7 pattern).

---

## API Contract

`docs/openapi.yaml` in the repo root is the canonical contract.
After route changes, regenerate and commit it:

```bash
npm run openapi:export
git add ../../docs/openapi.yaml
git commit -m "docs: update openapi contract"
```

The CI/CD pipeline (`deploy-api.yml`) enforces contract parity — deploy fails if `openapi.yaml` is stale.

---

## Troubleshooting

### Field message synchronization

Run `npm run prisma:generate` and apply migrations with `npx prisma migrate deploy`
before using the merged offline workspace.

- `POST /api/v1/field-messages` accepts `id` and `deviceId` UUIDs, trimmed
  `content` (1–2000 characters), `type` (`TEXT` or `SOS`), original `createdAt`
  ISO datetime, and optional numeric `latitude`/`longitude` supplied together.
- `GET /api/v1/field-messages?deviceId=<UUID>` returns that device's latest 200
  records in descending receipt order. There is no anonymous global message feed.
- Both return `{success: true, data: ...}`. A successful POST means the server
  stored the note; it does not mean another device or emergency service received it.
- Retrying the same message UUID keeps the original payload and receipt time.
  Reusing a message UUID from another device returns HTTP 409.
- Anonymous devices use a private random UUID as a bearer capability, not an
  authenticated user identity. Keep it out of public links and shared logs.
  An authenticated device enrollment/authorization flow is required for stronger
  identity guarantees or a real emergency dispatch system.
- Messages are not end-to-end encrypted. These endpoints do not implement
  Bluetooth, Wi-Fi Direct, LoRa, radio relay, or emergency dispatch.

- Startup fails with Prisma connection errors: verify Docker Postgres is running and `DATABASE_URL` points to the expected instance.
- Queue jobs not processing: confirm Redis is reachable via `REDIS_URL` and worker providers are enabled in app bootstrap.
- Missing export download URLs: check MinIO/S3 settings (`STORAGE_*`) and bucket permissions.
- CORS issues from web app: ensure `CORS_ORIGINS` includes the frontend origin (`http://localhost:3000` for local dev).
