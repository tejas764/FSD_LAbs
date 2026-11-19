# CrisisMap Web

Next.js PWA for crisis damage reporting and analyst review.
Serves both the public reporter flow and the authenticated analyst dashboard, backed by `apps/api`.

**Dev server:** `http://localhost:3000`

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Stack](#stack)
- [Setup](#setup)
- [Commands](#commands)
- [Route Structure](#route-structure)
- [Testing Accounts (Local)](#testing-accounts-local)
- [Key Features](#key-features)
- [Architecture Notes](#architecture-notes)
- [Offline Queue](#offline-queue)
- [Internationalisation](#internationalisation)
- [Accessibility](#accessibility)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Testing](#testing)

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 24.14.1 (see `.node-version`) |
| npm | bundled with Node |
| Docker + Compose | for local infrastructure services |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 6 (strict) |
| Styling | Tailwind CSS 4 (CSS-first, no tailwind.config.ts) |
| Components | shadcn/ui with OKLCH design tokens |
| Auth | better-auth client |
| Maps | Leaflet |
| Charts | Recharts |
| i18n | react-i18next (6 UN languages) |
| Offline | IndexedDB queue + Workbox service worker |
| Testing | Vitest + axe-core + Playwright |

---

## Setup

```bash
cp .env.example .env.local          # fill in required vars (see below)
npm ci
npm run dev                   # http://localhost:3000
```

Requires `apps/api` running at `http://localhost:4000` and Docker services up:

```bash
docker compose -f ../../infra/docker-compose.yml up -d
```

---

## Commands

```bash
npm run dev           # Dev server  ->  http://localhost:3000
npm test              # Vitest unit + a11y tests
npm run test:a11y     # axe-core a11y tests only (verbose)
npm run test:e2e      # Playwright end-to-end tests
npm run type-check    # TypeScript strict validation
npm run lint          # ESLint
npm run build         # Production build
```

---

## Route Structure

### Reporter (public, no login required)

| Route | Page |
|---|---|
| `/` | Landing — crisis selector, language toggle, submit CTA |
| `/report` | Multi-step damage report wizard |
| `/report/success` | Submission confirmation |
| `/my-reports` | Anonymous reporter's submission history |

### Dashboard (requires authenticated analyst / admin session)

| Route | Page |
|---|---|
| `/dashboard` | Overview — KPI cards, daily trend chart, recent reports |
| `/dashboard/reports` | Reports table with moderation filters and map view |
| `/dashboard/analytics` | H3 hotspot map, damage breakdown charts, trend analysis |
| `/dashboard/crises` | Crisis management — create, activate, deactivate |
| `/dashboard/moderation` | Report review queue — approve, reject, flag duplicates |
| `/dashboard/export` | Trigger CSV / GeoJSON export, download signed URL |
| `/dashboard/users` | User management (admin only) |
| `/dashboard/profile` | Analyst profile settings |

### Shared

| Route | Page |
|---|---|
| `/login` | Email + password sign-in |
| `/forgot-password` | Password reset request |
| `/reset-password` | Password reset confirmation |
| `/settings` | Account settings |

---

## Testing Accounts (Local)

After running API seed (`cd apps/api && npm run seed`), use these accounts on `/login`:

| Role | Email | Password | Intended checks |
|---|---|---|---|
| `admin` | `admin@crisismap.local` | `Password123!` | Full dashboard, admin-only sections, user management |
| `analyst` | `analyst@crisismap.local` | `Password123!` | Dashboard analytics, moderation, exports |
| `viewer` | `viewer@crisismap.local` | `Password123!` | Read-only/report viewing paths and role gating |

These credentials are for local development and demo environments only.

---

## Key Features

### Reporter PWA

- **Offline-first** — reports saved to IndexedDB when offline, synced when connectivity returns.
- **Multi-step wizard** — damage level, infrastructure type, location (GPS or text), photo upload.
- **Idempotency** — duplicate prevention via client-generated key.
- **Photo handling** — EXIF stripping, size validation, upload to object storage via API.
- **Language toggle** — 6 UN languages (ar, zh, en, fr, ru, es) with RTL layout support.
- **Contribution recognition** — `/report/success` shows a non-monetary badge/status card with current tier and next milestone hints, without points, rankings, or leaderboards.

### Analyst Dashboard

- **Interactive map view** — Leaflet map of reports per crisis with damage-level colour coding that auto-updates when connectivity is available.
- **Dashboard overview** — KPI stat tiles, daily report trend, recent submissions.
- **Analytics page** — H3 hexagon hotspot map, damage distribution pie chart, infrastructure bar chart; all filters update together.
- **Moderation** — confirm, reject, flag duplicate with audit trail.
- **Export** — trigger async CSV / GeoJSON export; download URL delivered via SSE stream or polling.
- **Crisis management** — create and toggle active crises.
- **Role-based navigation** — admin-only sections hidden from analyst role.

---

## Architecture Notes

### Ownership boundaries

- Owns reporter UI, dashboard UI, and shared authentication views.
- Does not own backend business logic, persistence, or migrations.
- All data operations must go through the typed API client.

- All backend calls go through `lib/api/client.ts` — never call `apps/api` URLs directly from components.
- No API route handlers in `app/api/` that proxy database calls — all data access is via `apps/api`.
- `apps/web` never runs `prisma migrate` — the database is fully owned by `apps/api`.
- Auth session managed by better-auth client; session cookie shared with API.

---

## Offline Queue

IndexedDB-backed report queue in `lib/offline/`:

| Module | Purpose |
|---|---|
| `queue.ts` | Enqueue reports to IndexedDB when offline |
| `sync.ts` | Drain queue and POST to API when connectivity returns |
| `register.ts` | Register service worker and connectivity listeners |

The service worker (`public/sw.js`) is managed by Workbox and handles asset caching.
Reports in the queue survive page refresh and browser restarts.

---

## Internationalisation

All user-visible text goes through `t()` from `react-i18next`. No hardcoded strings in JSX, `aria-label`, `placeholder`, `alt`, `title`, or inline errors.

Locale files: `public/locales/{ar,zh,en,fr,ru,es}/`

RTL languages (Arabic) use CSS logical properties throughout (`ms-4` not `ml-4`, `text-start` not `text-left`).

---

## Accessibility

- WCAG 2.1 AA target — zero axe violations on all components.
- axe-core tests in Vitest run before each component ships.
- Touch targets ≥ 48px. Semantic HTML first; ARIA only when necessary.
- Focus management in wizard steps and modal dialogs.

---

## Environment Variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | `http://localhost:4000` | URL of the `apps/api` service |
| `API_INTERNAL_BASE_URL` | Yes | `http://localhost:4000` | Server-side internal URL for SSR API calls (may differ in production networking) |
| `BETTER_AUTH_SECRET` | Yes | — | Must match `apps/api` secret |
| `BETTER_AUTH_URL` | Yes | — | Full public base URL of the app (used by better-auth) |
| `MAX_PHOTO_SIZE_MB` | No | `5` | Max permitted upload size in MB |
| `NEXT_PUBLIC_OFFLINE_MAX_ATTEMPTS` | No | `5` | Offline queue retry attempts before giving up |

---

## Deployment

`apps/web` is deployed via Vercel.

- **Production deploys**: triggered from the `main` branch
- **Preview deploys**: created automatically for pull requests and non-production branches
- **Project root**: set to `apps/web` in Vercel project settings

Minimum Vercel environment variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Public base URL of the deployed API |
| `API_INTERNAL_BASE_URL` | Internal server-side API base URL for SSR requests |
| `BETTER_AUTH_SECRET` | Shared auth secret matching the API configuration |
| `BETTER_AUTH_URL` | Public base URL of the deployed web app |

The API is deployed separately via GitHub Actions + AWS from `apps/api`.

---

## Testing

```bash
npm test                 # Vitest — unit + a11y (axe-core)
npm run test:e2e         # Playwright — full browser flows
```

### Rules

- Write failing test first. No production code without a prior failing test.
- axe-core test written before every new component.
- All user-visible strings via `t()` — tested with i18n key assertions.
- CSS logical properties only — linted by ESLint.
- Semantic design tokens only (`bg-primary`, not raw `oklch(...)` values).

---

## Troubleshooting

- `401` or auth session issues: verify `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` match `apps/api` values.
- Missing data in dashboard: confirm `NEXT_PUBLIC_API_BASE_URL` points to a running API (`http://localhost:4000` in local dev).
- Offline queue not draining: check browser connectivity status and inspect IndexedDB queue entries.
