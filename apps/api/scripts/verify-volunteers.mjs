/**
 * Local-only live integration verification.
 * Start the migrated API first, then run: node scripts/verify-volunteers.mjs
 * Uses generated test identities; never prints or persists passwords/session cookies.
 * Cleanup is restricted to identities and tasks created by this invocation.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: new URL("../.env.local", import.meta.url), quiet: true });
const base = new URL(process.env.CRISISMAP_API_BASE_URL || "http://localhost:4000/api/v1");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "This verification script only targets a local API.");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in apps/api/.env.local before verification.");
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "This verification script only targets a local database.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 3000, statement_timeout: 15000 });
const runId = randomUUID();
const tag = runId.slice(0, 8);
const generatedUsers = new Map();
const generatedTasks = new Set();
let passed = 0;

function check(condition, description) {
  assert(condition, description);
  passed++;
  console.log(`PASS ${description}`);
}

function account(label) {
  return { name: `Verification ${label} ${tag}`, email: `verification-${runId}-${label}@example.test`, password: `Verify-${randomUUID()}!a1`, cookies: new Map(), id: null, profileId: null };
}

async function call(person, path, method = "GET", body) {
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:3000" };
  if (person?.cookies.size) headers.Cookie = [...person.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const response = await fetch(`${base.href.replace(/\/$/, "")}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  if (person) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0], separator = pair.indexOf("=");
      person.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function ok(person, path, method = "GET", body) {
  const result = await call(person, path, method, body);
  assert(result.status >= 200 && result.status < 300, `${method} ${path} returned HTTP ${result.status}`);
  if (path.startsWith("/volunteers")) assert.equal(result.json?.success, true, `${method} ${path} did not acknowledge persistence`);
  return path.startsWith("/volunteers") ? result.json.data : result.json;
}

async function register(person) {
  const result = await ok(person, "/auth/sign-up/email", "POST", { name: person.name, email: person.email, password: person.password });
  assert.equal(typeof result.user?.id, "string", "Registration did not return the test user's identity");
  person.id = result.user.id;
  generatedUsers.set(person.id, person.email);
  const profile = await ok(person, "/volunteers/enroll", "POST", { phone: "+91 9000000000", location: "Verification test location", skills: ["logistics"], bio: "Generated local integration fixture" });
  person.profileId = profile.id;
  return profile;
}

async function createTask(coordinator, suffix, extra = {}) {
  const task = await ok(coordinator, "/volunteers/admin/tasks", "POST", { title: `Verification ${tag} ${suffix}`, description: "Generated local verification fixture. Follow coordinator instructions.", location: "Verification test location", requiredSkills: ["logistics"], requiresVerification: true, capacity: 1, ...extra });
  generatedTasks.add(task.id);
  return task;
}

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = [...generatedUsers.keys()], taskIds = [...generatedTasks];
    // IDs below come exclusively from successful creation responses in this run.
    await client.query('DELETE FROM "VolunteerAssignment" WHERE "taskId" = ANY($1::text[]) OR "volunteerId" IN (SELECT "id" FROM "VolunteerProfile" WHERE "userId" = ANY($2::text[]))', [taskIds, ids]);
    await client.query('DELETE FROM "VolunteerTask" WHERE "id" = ANY($1::text[])', [taskIds]);
    for (const [id, email] of generatedUsers) await client.query('DELETE FROM "user" WHERE "id" = $1 AND "email" = $2', [id, email]);
    await client.query("COMMIT");
    console.log("Generated verification fixtures cleaned up.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

try {
  const coordinator = account("coordinator"), one = account("one"), two = account("two");
  await register(coordinator);
  const promoted = await pool.query('UPDATE "user" SET "role" = $1 WHERE "id" = $2 AND "email" = $3 RETURNING "id"', ["admin", coordinator.id, coordinator.email]);
  assert.equal(promoted.rowCount, 1, "Only the generated coordinator may be promoted");
  coordinator.cookies.clear();
  await ok(coordinator, "/auth/sign-in/email", "POST", { email: coordinator.email, password: coordinator.password });
  const firstProfile = await register(one), secondProfile = await register(two);
  check(firstProfile.verificationStatus === "PENDING" && firstProfile.availability === "OFFLINE", "Registration starts pending and opted out of availability");
  check((await call(null, "/volunteers/me")).status === 401, "Anonymous requests cannot read private volunteer data");
  check((await call(one, "/volunteers/admin/overview")).status === 403, "Volunteers cannot open coordinator endpoints");
  check((await call(one, "/volunteers/me", "PATCH", { verificationStatus: "VERIFIED" })).status === 400, "Volunteers cannot self-verify through profile input");

  await ok(one, "/volunteers/availability", "PATCH", { availability: "AVAILABLE" });
  await ok(two, "/volunteers/availability", "PATCH", { availability: "AVAILABLE" });
  const capacityTask = await createTask(coordinator, "capacity");
  check((await call(one, `/volunteers/tasks/${capacityTask.id}/accept`, "POST")).status === 403, "Pending verification cannot claim a verified task");
  for (const person of [one, two]) await ok(coordinator, `/volunteers/admin/profiles/${person.profileId}/verification`, "PATCH", { verificationStatus: "VERIFIED" });
  const eligible = await ok(one, "/volunteers/tasks");
  check(eligible.some((task) => task.id === capacityTask.id), "Verified available volunteers see matching eligible tasks");
  const claims = await Promise.all([call(one, `/volunteers/tasks/${capacityTask.id}/accept`, "POST"), call(two, `/volunteers/tasks/${capacityTask.id}/accept`, "POST")]);
  check(claims.filter((result) => result.status === 201).length === 1 && claims.filter((result) => result.status === 409).length === 1, "Concurrent claims cannot overfill task capacity");
  const winner = claims[0].status === 201 ? one : two, other = winner === one ? two : one;
  const accepted = claims.find((result) => result.status === 201).json.data;
  check((await call(other, `/volunteers/assignments/${accepted.id}/progress`, "PATCH", { progress: 10 })).status === 404, "Volunteers cannot edit another volunteer's assignment");
  const replay = await ok(winner, `/volunteers/tasks/${capacityTask.id}/accept`, "POST");
  check(replay.id === accepted.id, "A replay returns the original assignment");
  await ok(winner, `/volunteers/assignments/${accepted.id}/progress`, "PATCH", { progress: 50, notes: "Work in progress" });
  await ok(winner, `/volunteers/assignments/${accepted.id}/complete`, "POST", { summary: "Verification task completed", hours: 1.5 });
  const pending = await ok(winner, "/volunteers/me");
  check(pending.stats.verifiedHours === 0 && pending.assignments.some((item) => item.id === accepted.id && item.status === "COMPLETION_SUBMITTED"), "Submitted reports contribute zero verified hours before review");
  await ok(coordinator, `/volunteers/admin/assignments/${accepted.id}/review`, "POST", { decision: "RETURN", notes: "Please include the verification handover detail." });
  const returned = await ok(winner, "/volunteers/me");
  check(returned.stats.verifiedHours === 0 && returned.assignments.some((item) => item.id === accepted.id && item.status === "IN_PROGRESS"), "Returned completion reports reopen work without granting hours");
  await ok(winner, `/volunteers/assignments/${accepted.id}/complete`, "POST", { summary: "Verification task completed with handover detail", hours: 1.5 });
  await ok(coordinator, `/volunteers/admin/assignments/${accepted.id}/review`, "POST", { decision: "APPROVE", notes: "Verification fixture reviewed" });
  const completed = await ok(winner, "/volunteers/me");
  check(completed.stats.completedTasks === 1 && completed.stats.verifiedHours === 1.5 && completed.history.some((item) => item.id === accepted.id && item.status === "COMPLETED"), "Only coordinator-approved completion reports count toward verified hours and history");
  check((await call(coordinator, `/volunteers/admin/assignments/${accepted.id}/review`, "POST", { decision: "APPROVE" })).status === 409, "Already approved hours cannot be counted a second time");

  const offeredTask = await createTask(coordinator, "offer");
  const offer = await ok(coordinator, `/volunteers/admin/tasks/${offeredTask.id}/assign`, "POST", { volunteerId: other.profileId });
  const decline = await ok(other, `/volunteers/assignments/${offer.id}/respond`, "POST", { decision: "DECLINE" });
  check(decline.status === "DECLINED", "Volunteers can decline coordinator assignment offers");
  const acceptedOfferTask = await createTask(coordinator, "accepted-offer");
  const offerTwo = await ok(coordinator, `/volunteers/admin/tasks/${acceptedOfferTask.id}/assign`, "POST", { volunteerId: other.profileId });
  const acceptedOffer = await ok(other, `/volunteers/assignments/${offerTwo.id}/respond`, "POST", { decision: "ACCEPT" });
  check(acceptedOffer.status === "ACCEPTED", "Volunteers can accept coordinator assignment offers");

  const startsAt = new Date(Date.now() + 3600000).toISOString(), endsAt = new Date(Date.now() + 7200000).toISOString();
  const shift = await ok(coordinator, "/volunteers/admin/shifts", "POST", { volunteerId: winner.profileId, title: `Verification ${tag} shift`, location: "Verification test location", startsAt, endsAt });
  check((await ok(winner, "/volunteers/me")).shifts.some((item) => item.id === shift.id), "Upcoming shifts are visible to their assigned volunteer");
  check((await call(coordinator, "/volunteers/admin/shifts", "POST", { volunteerId: winner.profileId, title: "Overlap", location: "Verification test location", startsAt, endsAt })).status === 409, "Overlapping shifts are rejected");
  await ok(winner, "/volunteers/check-ins", "POST", { status: "SAFE", notes: "Generated verification check-in" });
  check((await ok(winner, "/volunteers/me")).checkIns.some((item) => item.status === "SAFE"), "Safety check-ins persist to the volunteer workspace");
  check((await ok(coordinator, "/volunteers/admin/overview")).checkIns.some((item) => item.volunteerId === winner.profileId), "Coordinator overview receives volunteer safety check-ins");

  const bioEdit = await ok(winner, "/volunteers/me", "PATCH", { name: winner.name, bio: "Updated verification introduction" });
  check(bioEdit.verificationStatus === "VERIFIED", "Saving an unchanged name with a bio edit preserves verification");
  const updatedName = `${winner.name} renamed`;
  await ok(winner, "/auth/update-user", "POST", { name: updatedName });
  check((await ok(winner, "/volunteers/me")).profile.verificationStatus === "PENDING", "The shared authentication name-update route invalidates reviewed volunteer identity");
  check((await call(winner, `/volunteers/tasks/${offeredTask.id}/accept`, "POST")).status === 403, "A renamed volunteer cannot bypass reverification through task claiming");

  check((await call(coordinator, `/volunteers/admin/profiles/${coordinator.profileId}/verification`, "PATCH", { verificationStatus: "VERIFIED" })).status === 403, "Coordinators cannot verify their own volunteer identity");
  // Verify the reviewer self-approval guard using a generated coordinator assignment.
  await ok(coordinator, "/volunteers/availability", "PATCH", { availability: "AVAILABLE" });
  const selfTask = await createTask(coordinator, "self-review", { requiresVerification: false });
  const selfAssignment = await ok(coordinator, `/volunteers/tasks/${selfTask.id}/accept`, "POST");
  await ok(coordinator, `/volunteers/assignments/${selfAssignment.id}/complete`, "POST", { summary: "Generated coordinator volunteer report", hours: 0.25 });
  check((await call(coordinator, `/volunteers/admin/assignments/${selfAssignment.id}/review`, "POST", { decision: "APPROVE" })).status === 403, "Coordinators cannot approve their own volunteer hours");
  console.log(`Live volunteer verification passed (${passed} assertions).`);
} catch (error) {
  console.error(`Live volunteer verification failed: ${error instanceof Error ? error.message : "Unknown failure"}`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); }
  catch { console.error("Generated fixture cleanup failed. No existing project records were targeted."); process.exitCode = 1; }
  await pool.end();
}
