# Volunteer workspace

The volunteer workspace shares the existing application, authentication service,
and PostgreSQL database. Volunteer accounts use Better Auth email/password
sessions. Passwords are handled by the authentication service; the frontend does
not store passwords in browser storage.

## Register and sign in

- Open `/volunteer/register` to create an account and complete the volunteer
  profile. Provide a name, email, password, phone number, location, and any skills.
  A short biography and emergency contact details are optional.
- Open `/volunteer/login` to sign in. Authenticated volunteers use `/volunteer`
  for their dashboard and `/volunteer/profile` to manage their own profile.
- Account creation and profile enrollment are separate server operations. If the
  account is created but enrollment fails, sign in with the same account. The
  dashboard offers **Complete your volunteer enrollment** rather than requiring
  another account. Retrying enrollment preserves an existing profile.

A public registration receives the ordinary account role. It does not grant
administrator permissions or verify the volunteer automatically. Enrollment and
profile updates cannot supply a different user ID, verified status, or verified
hours. Private records are selected using the authenticated session identity.

## Dashboard and assignments

The dashboard shows the profile summary, verification status, availability,
assigned tasks, upcoming shifts, completed task count, verified volunteer hours,
safety check-ins, and task history. A refresh retrieves the current server state.

New volunteers begin with **Pending** verification and **Offline** availability.
The availability setting is a working preference, separate from the device’s
network connection:

- **Available** opts the volunteer into eligible assignments.
- **Busy** and **Offline** stop new task acceptance until the volunteer becomes
  available again. Existing offers can still be declined.

An eligible task must be open, have capacity remaining, match every required
skill, and satisfy its verification requirement. Rejected verification prevents
new task acceptance. An administrator may offer a task to an eligible volunteer,
who can accept or decline the offer. Volunteers can also accept tasks from their
eligible task catalog. The server checks the current requirements and capacity
again when accepting or offering a task; a stale browser view cannot reserve an
extra place.

After accepting an assignment, a volunteer can record progress and notes.
Progress updates range from 0 to 99 percent and cannot decrease. A task with a
future start cannot receive progress or completion updates before that start.
To finish, submit a completion summary and the hours worked. Hours are reported
in quarter-hour increments, from 0.25 to 24 hours per report.

Submitting a report sets the assignment to **Completion submitted**. It does not
add verified hours. An administrator reviews the summary and either approves the
reported hours or returns the report with notes. A returned assignment becomes
**In progress** so the volunteer can make corrections and resubmit. Approved
reports become **Completed**; the dashboard’s total verified hours is calculated
from approved assignments in the database. Replaying an approval cannot credit
the same assignment twice.

## Verification and profile management

Administrators record **Pending**, **Verified**, or **Rejected** decisions after
their verification process. Volunteers cannot set their own verification status.
Changing a name, phone number, or listed skills returns the profile to review.
Verification-sensitive actions use the server’s current profile state.

Verification is an administrator decision recorded by this application. It does
not independently check identity documents, qualifications, or professional
licensing. Task instructions and the administrator’s verification process should
reflect the responsibilities of the work being offered.

## Shifts and safety check-ins

Administrators schedule a volunteer’s shift with a title, location, start, and
end. Dates are entered in the coordinator browser’s local timezone, stored as
timestamps, and displayed in each browser’s local timezone. A shift cannot span
more than 48 hours, and overlapping shifts for the same volunteer are rejected.
Upcoming shifts appear on the volunteer dashboard.

The safety check-in records **Safe** or **Need help**, with optional notes and
paired coordinates. The volunteer must explicitly attach a location. Check-ins
are saved to the volunteer service and are visible to administrators in their
coordination workspace. A saved check-in is not automatic emergency dispatch and
does not call emergency services or notify an emergency contact.

## Administrator coordination

The administrator route is `/dashboard/volunteers`. It provides:

- A searchable directory and verification review.
- Task creation with location, instructions, skills, capacity, optional dates,
  and a verification requirement.
- Assignment offers to eligible volunteers who have not already received that
  task.
- Shift scheduling.
- Completion report approval or return with review notes.
- Volunteer safety check-ins, including assistance requests and attached map
  coordinates.

Both the interface and API require administrator access. Analyst, viewer, and
ordinary volunteer accounts cannot use coordinator endpoints. Administrators
cannot verify their own volunteer profiles or approve their own volunteer hours;
another administrator must make those decisions.

The coordinator overview retrieves up to 500 profiles, tasks, assignments, and
shifts, plus the latest 200 check-ins. Its hour summary is labelled **Verified
hours in view** to reflect that limit. Each volunteer’s verified hours total uses
a database aggregate over all their approved assignments.

## Connection requirements

The volunteer dashboard and coordinator workspace require an active connection
to their private API. Personalized volunteer responses and authenticated pages
are not placed in the public offline service-worker cache. An unavailable request
shows an error; it does not simulate an assignment, verified hours, or a saved
check-in. A page may retain its last loaded state while open, but mutations need
server acknowledgment and a disconnected reload cannot recover private records.

The app’s anonymous field workspace, personal safety plan, and local resource
directory retain their separate offline workflows. See
[online and offline integration](online-offline-integration.md).

## Database setup and local run

Use Node.js 24 and a running Docker Desktop/Compose engine. From the `crisismap`
directory in Windows PowerShell:

```powershell
npm.cmd run setup
npm.cmd run infra:up
npm.cmd run db:deploy
npm.cmd --prefix apps/api run seed
npm.cmd run dev
```

`db:deploy` applies the additive migrations:

- `20261118010000_add_volunteer_workspace`, which creates profiles, tasks,
  assignments, shifts, and check-ins linked to existing authentication users.
- `20261118020000_track_volunteer_verified_identity`, which records the verified
  name snapshot used to detect identity changes through the account service.

These migration directories are under `apps/api/prisma/migrations/`. `setup`
generates the Prisma client after installing dependencies. For an already
installed checkout after a schema change,
run `npm.cmd --prefix apps/api run prisma:generate` before the API build.

The frontend runs at `http://localhost:3000` and the API normally runs on port
4000. Existing local seed accounts remain available for administrator access;
register a separate volunteer account for testing. There are no fabricated tasks
or credited hours: an administrator must create work, and approve a completion
report, to populate those parts of the dashboard. Do not use development seed
credentials or placeholder secrets in a deployed environment.

For a production-mode local run:

```powershell
npm.cmd run build
npm.cmd start
```

## Focused checks

The following checks do not need a running application:

```powershell
npm.cmd run type-check
npm.cmd --prefix apps/api test -- --runInBand volunteers
npm.cmd --prefix apps/web run test -- --project unit --maxWorkers=1 components/volunteer 'app/(dashboard)/dashboard/volunteers' 'app/(reporter)/ai-logs'
```

In PowerShell, quote paths containing parentheses when passing a specific test
path. The tests cover ownership, input validation, coordinator authorization,
eligibility and capacity, verification, approval-controlled hours, profile
recovery, dashboard actions, and evaluation-log export scope.

## Opt-in live verification

Run live verification deliberately against a migrated local development database.
The scripts create temporary real users, tasks, and volunteer records, then scope
cleanup to records created by that invocation. They generate passwords at runtime;
no existing seed accounts or fixed credentials are used. They do not mock HTTP
responses. The test coordinator is promoted only inside the test fixture setup,
using the configured database connection; ordinary registration cannot do this.

With the API running on port 4000, run the API verification from `apps/api`:

```powershell
node scripts/verify-volunteers.mjs
```

This explicit script invocation is the opt-in. It loads `apps/api/.env.local`,
including `DATABASE_URL`, and targets a localhost API. `CRISISMAP_API_BASE_URL`
can override the default `http://localhost:4000/api/v1`, but the script rejects
non-local API and database hostnames before writing. Check the selected
development database before running.

For the complete browser workflow, keep the real API on port 4000 and a freshly
built production frontend on port 3000. From `apps/web` in a separate PowerShell
terminal:

```powershell
$env:CRISISMAP_VOLUNTEER_LIVE_E2E = '1'
$env:CRISISMAP_PRODUCTION_E2E = '1'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npx.cmd playwright test tests/e2e/volunteer-live.spec.ts --project chromium
```

`CRISISMAP_VOLUNTEER_LIVE_E2E=1` explicitly enables the live test; it is skipped
otherwise. `CRISISMAP_PRODUCTION_E2E=1` uses the already running production server.
The test reads the local database URL from `apps/api/.env.local`, or from an
explicit `VOLUNTEER_TEST_DATABASE_URL` override. It covers registration, sign-in,
profile/availability updates, verification, task acceptance and offer responses,
progress, completion review, approved hours, shifts, safety check-ins, history,
and logout. It also captures responsive views and runs browser accessibility
checks. Do not point this workflow at a production database.

The private volunteer workspace is intentionally not an offline application. For
the app’s separate production service-worker tests, use the commands in the
[online/offline integration guide](online-offline-integration.md).
