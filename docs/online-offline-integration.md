# Integrated online and offline workspace

`crisismap` is the canonical application for both projects. Open one frontend at
`http://localhost:3000`: use the connection toggle to switch between the online
CrisisMap experience and the offline field workspace at `/offline`. Reports,
photos, field notes, and SOS notes share this frontend origin and remain on the
device when changing modes. The original `Offline_disaster_management-` Vite
project remains available as a reference; do not run it on the same port.

## Start locally

Use Node.js 24 and a running Docker Desktop/Compose engine. From `crisismap`:

```text
npm run setup
npm run infra:up
npm run db:deploy
npm --prefix apps/api run seed
npm run dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd` in place of
`npm`. The launcher itself runs npm through Node without shell command strings.
`setup` installs the API and frontend dependencies sequentially, then generates
the Prisma client. It copies each `.env.example` to `.env.local` only when the
local file is absent; existing environment files are preserved. Review the
examples for your environment. Browser API requests use the same-origin Next.js
proxy; `API_INTERNAL_BASE_URL` defaults to `http://localhost:4000`.

`infra:up` uses the existing `infra/docker-compose.yml`. The launcher does not
change the infrastructure definition. PostgreSQL/PostGIS, Redis, MinIO,
translation, and mail services keep their existing ports. The initial translation
model download can take several minutes. `db:deploy` applies the checked-in API
migrations, including the new `FieldMessage` table. Seeding creates the local
crises and test accounts used by the existing reporter and dashboard workflows.

`dev` starts the API on its configured port (default 4000) and the frontend on
3000. Ctrl+C stops both child process trees. If either server exits unexpectedly,
the launcher stops the other server and reports failure. `npm run type-check`
checks the API and web app in sequence.

## Test offline reloads with a production build

Development mode supports the manual mode toggle, IndexedDB persistence, and
queued uploads while the page is open. Its service worker is disabled so stale
HMR bundles cannot break development. Use a production build to test opening or
reloading the app without a network:

```text
npm run build
npm start
```

Open the app online first and let the offline shell prepare. Visit the reporter,
report form, and field workspace before disconnecting. Use the app's offline
readiness indicator to check preparation. Service workers and geolocation need
`localhost` or HTTPS; plain HTTP on another device's LAN address does not provide
the same browser capabilities. Changing hostname or port creates a different
browser storage origin, so use the same URL throughout testing.

Public crisis metadata, this device's stored reports, and visited map tiles can be reused offline.
Unvisited tiles and uncached server data cannot be loaded without connectivity.
Offline readiness is browser storage dependent; clearing site data removes
the local queue and caches. Export a recovery packet before clearing data or
moving to another browser/device.

## Interface and personal response tools

The reporter home (`/`) is a community overview with a crisis selector, a severity
filter, reports in the current map area, queue counts, kit progress, and a safety
check-in. The full-screen incident map remains available at `/map`. Counts use
the API and this device's stored state; unavailable server data is shown as
unavailable. The interface supports light/dark themes, a desktop sidebar, and a
compact bottom navigation on phones.

- `/preparedness`: an eight-item emergency kit checklist, a household meeting
  place, household notes, and emergency contacts with tap-to-call links. Download
  a text copy of the plan, including contacts and checklist status.
- `/resources`: a personal directory of shelters, medical contacts, food/water
  points, and supplies. Add, edit, remove, search, and filter entries; export or
  import the directory as JSON. These are user-recorded places and availability,
  not a verified public shelter feed. Map links open the saved address externally.
- Safety check-ins are saved through the existing IndexedDB field-message queue.
  An assistance check-in creates an SOS record; it does not call emergency
  services or notify emergency contacts. The field workspace shows upload status.

Personal plans and resource directories are stored in this browser's local
storage, with schema validation and visible save errors. They are independent
of field recovery packets: download the plan and export the directory separately
before clearing browser data. A resource import merges records by ID and keeps
the newer timestamp. Both tools remain usable in manual offline mode and their
pages are prepared by the production service worker for disconnected reloads.

Street maps use the shared OpenStreetMap tile configuration; only viewed tiles
are cached, with no map-area download or bulk prefetch. Satellite imagery keeps
the existing provider. Unvisited map areas still need a connection.

## Mode switching and synchronization

- The manual offline preference persists across reloads and tabs. Losing browser
  connectivity or failing the API health probe also puts the app in its offline
  state. A manual offline choice remains in effect after the network returns.
- Offline reports and their photo blobs are stored in IndexedDB before the UI
  confirms local saving. Field notes and SOS notes are also stored durably.
- Returning to online mode lets the shared coordinator upload queued data. Queue
  synchronization uses a single active operation and browser locks where
  available, with stable UUIDs/idempotency keys across retries.
- A server acknowledgment changes a record to synced. Validation failures stay
  available for review; transient failures retain the local record for a later
  attempt. Use the workspace's sync control to retry when appropriate.
- Recovery packets move locally stored notes and unsynced reports/photos through
  an ordinary JSON file. Import preserves stable IDs so retries do not create a
  second server record. A packet can contain sensitive notes, coordinates, and
  photographs; share it deliberately and keep the original data until verified.

The coordinator runs while the app is open. Browser background-sync support is
an optional aid, not a guarantee that a closed app can finish uploads. Reopen the
app online to resume pending work.

## Field API and actual transport capabilities

`POST /api/v1/field-messages` stores a note with a client-generated message UUID,
private `deviceId` UUID, `TEXT` or `SOS` type, content, original creation time,
and optional paired coordinates. Replaying a message UUID preserves the first
accepted payload. `GET /api/v1/field-messages?deviceId=<UUID>` returns that device's
latest 200 stored messages; there is no public message feed. The API owns the
database schema and migrations. See [the OpenAPI contract](openapi.yaml).

The random device UUID acts like a bearer capability for these anonymous records;
it is not authenticated user identity. Do not publish the UUID in public links or
logs. Authenticated enrollment and authorization would be needed for stronger
device identity guarantees.

The mesh topology view is a labeled simulation. Neither the original browser
demo nor this integration implements real Bluetooth, Wi-Fi Direct, LoRa relay,
end-to-end encryption, or emergency dispatch. An SOS note saved locally or
accepted by this API is not proof that rescuers or nearby devices received it.
Actual radio communication needs a separate native/hardware transport and a
verified delivery protocol.

## Response tools verification (18 November 2026)

The redesigned frontend production build and TypeScript checks passed. The full
frontend unit suite passed 565 tests, and the accessibility suite passed 65 tests.
Targeted checks also passed after the final navigation and map changes.

All five `tests/e2e/response-tools.spec.ts` browser tests passed against the
production build in Chrome. These cover plan/contact persistence and downloads,
resource editing/search/filtering/import/export, safety check-in storage, light
and dark layouts at 320–1440 px, mobile map/report controls, and menu navigation.
The production service-worker test disconnects the browser and verifies that both
new tools reload and continue saving locally. The other UI tests use API fixtures;
this pass does not reverify live backend synchronization or the Docker issue
recorded below. Browser screenshots are written to the ignored `apps/web/test-results/`.

## Source attribution

The field workspace and topology demonstration were reimplemented for
CrisisMap's shared storage and layout using the concepts in
the local reference `Offline_disaster_management-/src/App.tsx`.
That source file declares `SPDX-License-Identifier: Apache-2.0`; preserve its
license notice when reusing code from the original demo. CrisisMap's existing
MIT license remains in [LICENSE](../LICENSE).

## Verification status

The existing local Docker infrastructure was started successfully and
`prisma migrate deploy` applied `20261118000000_add_field_messages` to the local
PostgreSQL database. API validation, idempotency, and HTTP contract tests passed.
Each fresh environment still needs its own `npm run db:deploy` before online
note storage can work. Validate the production browser's offline/reconnect flow
on the device and URL you intend to use; local queue storage and cached assets
belong to that browser origin.

### Historical verification and runtime interruption (18 November 2026)

Both production builds and type checks passed. The full frontend unit run passed
560 tests, and the API unit run passed 323 tests. Subsequent targeted checks
covered blank optional report fields, rate-limit backoff, and the workspace's
accessibility. All four report queue browser tests passed against the final build.

The field-message browser reconnect check was blocked during that pass:
PostgreSQL writes and a direct database query stalled, and Docker Desktop/WSL
restart and shutdown requests timed out. Saved messages remain in IndexedDB;
do not clear browser storage. Restore Docker Desktop/WSL (a Windows restart may
be needed), then run `npm.cmd run infra:up` and `npm.cmd start` from `crisismap`.
Stop an existing app launcher with Ctrl+C before starting another one. Docker
and database access were restored on 19 November; see the current release
verification below. This historical field-message reconnect case was not rerun
as part of the volunteer verification.

To rerun the production browser checks against the running app in PowerShell:

```powershell
cd apps/web
$env:CRISISMAP_PRODUCTION_E2E = '1'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx.cmd playwright test tests/e2e/offline-sync.spec.ts tests/e2e/connectivity-mode.spec.ts --project chromium
```

## Volunteer release verification (19 November 2026)

Both application production builds and TypeScript checks passed. The frontend
unit suite passed 587 tests, the API unit suite passed 360 tests, and the
accessibility suite passed 65 tests. The generated OpenAPI contract now includes
the volunteer endpoints. All 21 database migrations are applied locally.

The local-only API verification script passed all 24 real HTTP assertions,
including session authentication, ownership, role restrictions, concurrent task
capacity, assignment responses, completion review, approved hours, shifts,
safety check-ins, and verification invalidation after identity changes.

Six production browser tests passed across `response-tools.spec.ts` and
`volunteer-live.spec.ts`. The volunteer test uses real accounts and database
records, exercises registration through logout/login, and checks mobile,
desktop, dark mode, and the coordinator interface. The response tools tests
also verify disconnected reloads of the personal plan and resource directory.
The extended volunteer accessibility check passed after increasing the sidebar
email contrast. Generated live-test accounts and tasks were cleaned up.

See [the volunteer workspace guide](volunteer-workspace.md) for the exact
verification commands. Screenshots remain in the ignored web `test-results/`
directory and local environment values are excluded from Git.
