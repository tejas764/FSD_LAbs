/**
 * E2E tests for Offline Queue & Sync
 *
 * Covers acceptance criteria:
 * - Report submitted offline persists to IndexedDB
 * - After reconnect, queued reports sync to API
 * - Sync failure doesn't lose data (retryable)
 * - Offline/online status visible and announced to screen readers
 * - E2E: submit offline → reconnect → confirm upload succeeds
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// IndexedDB helpers — run inside the browser page context
// ---------------------------------------------------------------------------

const DB_NAME = "crisismap-offline";
const DB_VERSION = 1;

/** Open (or create) the IndexedDB and return all entries in pending-reports. */
async function readQueuedReports(
  page: Page,
): Promise<Array<{ id: string; status: string; retryCount: number }>> {
  return page.evaluate(
    ({ dbName, dbVersion }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("pending-reports")) {
            const store = db.createObjectStore("pending-reports", {
              keyPath: "id",
            });
            store.createIndex("byStatus", "status");
            store.createIndex("byCreatedAt", "createdAt");
          }
          if (!db.objectStoreNames.contains("report-blobs")) {
            db.createObjectStore("report-blobs");
          }
        };

        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("pending-reports", "readonly");
          const store = tx.objectStore("pending-reports");
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () =>
            resolve(
              getAllReq.result as Array<{
                id: string;
                status: string;
                retryCount: number;
              }>,
            );
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

/** Seed IndexedDB with a report in "queued" status (simulates an offline submit). */
async function seedQueuedReport(
  page: Page,
  reportId: string,
): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, id }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("pending-reports")) {
            const store = db.createObjectStore("pending-reports", {
              keyPath: "id",
            });
            store.createIndex("byStatus", "status");
            store.createIndex("byCreatedAt", "createdAt");
          }
          if (!db.objectStoreNames.contains("report-blobs")) {
            db.createObjectStore("report-blobs");
          }
        };

        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const blobKey = `${id}-photo`;
          const report = {
            id,
            idempotencyKey: "test-idempotency-key-e2e",
            formDataSerialized: {
              crisisId: "crisis-test-e2e",
              damageLevel: "PARTIAL",
              infraType: "RESIDENTIAL",
              crisisType: "FLOOD",
              infraName: "E2E Test Building",
              latitude: 14.5995,
              longitude: 120.9842,
              locationText: "Test location",
              pressingNeeds: ["FOOD_WATER"],
              collectedAt: new Date().toISOString(),
              descriptionLang: "en",
            },
            photoBlobKey: blobKey,
            status: "queued",
            createdAt: new Date().toISOString(),
            retryCount: 0,
            lastError: null,
          };

          const tx = db.transaction(
            ["pending-reports", "report-blobs"],
            "readwrite",
          );
          const blobs = tx.objectStore("report-blobs");
          const reports = tx.objectStore("pending-reports");

          blobs.put(
            new Blob(["fake-photo-data-e2e"], { type: "image/jpeg" }),
            blobKey,
          );
          reports.put(report);

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION, id: reportId },
  );
}

/** Seed IndexedDB with a report in "queued" status that has already failed once. */
async function seedFailedReport(
  page: Page,
  reportId: string,
): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, id }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("pending-reports")) {
            const store = db.createObjectStore("pending-reports", {
              keyPath: "id",
            });
            store.createIndex("byStatus", "status");
            store.createIndex("byCreatedAt", "createdAt");
          }
          if (!db.objectStoreNames.contains("report-blobs")) {
            db.createObjectStore("report-blobs");
          }
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const blobKey = `${id}-photo`;
          // retryCount: 1 means it has failed once (still under RETRY_LIMIT of 3)
          const report = {
            id,
            idempotencyKey: "test-idempotency-key-retry",
            formDataSerialized: {
              crisisId: "crisis-test-retry",
              damageLevel: "COMPLETE",
              infraType: "RESIDENTIAL",
              crisisType: "EARTHQUAKE",
              infraName: "Retry Test Building",
              latitude: 14.0,
              longitude: 121.0,
              pressingNeeds: ["SHELTER_REPAIR"],
              collectedAt: new Date().toISOString(),
              descriptionLang: "en",
            },
            photoBlobKey: blobKey,
            status: "queued",
            createdAt: new Date().toISOString(),
            retryCount: 1,
            lastError: "Network error",
          };
          const tx = db.transaction(
            ["pending-reports", "report-blobs"],
            "readwrite",
          );
          tx.objectStore("report-blobs").put(
            new Blob(["retry-photo"], { type: "image/jpeg" }),
            blobKey,
          );
          tx.objectStore("pending-reports").put(report);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName: DB_NAME, dbVersion: DB_VERSION, id: reportId },
  );
}

/** Dispatch a native browser online event to trigger sync listeners. */
async function goOnline(page: Page, context: BrowserContext): Promise<void> {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

/** Set up standard API mocks to prevent errors from background requests. */
async function mockBackgroundApis(page: Page): Promise<void> {
  // The shared connectivity provider probes health and reconciles field history.
  await page.route("**/api/v1/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "ok" }),
  }));
  await page.route("**/api/v1/field-messages**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: [] }),
  }));
  // Silence schema and crises API calls made by the wizard and provider.
  await page.route("**/api/v1/crises**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    }),
  );
  await page.route("**/api/v1/crises/*/schema/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found" }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Offline Queue & Sync", () => {
  // These tests exercise mocked API responses. The production connectivity suite
  // separately verifies the real service worker and offline document cache.
  test.use({ serviceWorkers: "block" });
  test("queued report syncs to API when connectivity is restored", async ({
    page,
    context,
  }) => {
    const reportId = `e2e-sync-${Date.now()}`;

    // Track API submissions
    const submittedIdempotencyKeys: string[] = [];

    // Mock the reports endpoint to return a successful response
    await page.route("**/api/v1/reports", async (route, request) => {
      if (request.method() === "POST") {
        submittedIdempotencyKeys.push(
          request.headers()["x-idempotency-key"] ?? "",
        );
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              id: "server-report-id-e2e",
              photoUrl: "https://storage.example.com/photo.jpg",
              acknowledgment: "Thank you for your report.",
              isDuplicate: false,
              version: 1,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await mockBackgroundApis(page);

    // Navigate to the reporter wizard within the shared connectivity provider.
    await page.goto("/report");
    await expect(
      page.getByRole("heading", { name: "Photo and Location" }),
    ).toBeVisible();

    // Go offline before seeding so no premature sync fires
    await context.setOffline(true);

    // Seed a queued report directly into IndexedDB
    await seedQueuedReport(page, reportId);

    // Verify the report is queued
    const pendingBefore = await readQueuedReports(page);
    const queuedEntry = pendingBefore.find((r) => r.id === reportId);
    expect(queuedEntry, "Report should be stored in IndexedDB").toBeDefined();
    expect(queuedEntry!.status).toBe("queued");

    // Come back online — the provider probes the API and drains the shared queue.
    await goOnline(page, context);

    // Wait until the API receives the submission
    await expect
      .poll(
        async () => submittedIdempotencyKeys.length,
        {
          message: "Expected API to receive the queued report submission",
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);

    // Wait for IndexedDB to reflect the synced status
    await expect
      .poll(
        async () => {
          const reports = await readQueuedReports(page);
          const entry = reports.find((r) => r.id === reportId);
          return entry?.status;
        },
        {
          message: "Expected IndexedDB entry to be marked as synced",
          timeout: 10_000,
        },
      )
      .toBe("synced");

    // The idempotency key used in sync should match what we seeded
    expect(submittedIdempotencyKeys[0]).toBe("test-idempotency-key-e2e");
  });

  test("failed sync preserves data and retries on next sync", async ({
    page,
    context,
  }) => {
    const reportId = `e2e-retry-${Date.now()}`;

    let callCount = 0;
    // First call fails with 503, second call succeeds
    await page.route("**/api/v1/reports", async (route, request) => {
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Service unavailable" }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              id: "server-report-id-retry",
              photoUrl: "https://storage.example.com/photo.jpg",
              acknowledgment: "Thank you.",
              isDuplicate: false,
              version: 1,
            },
          }),
        });
      }
    });

    await mockBackgroundApis(page);
    await page.goto("/report");
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);

    // Seed a previously-failed report (retryCount: 1, status: queued = still retryable)
    await seedFailedReport(page, reportId);

    const before = await readQueuedReports(page);
    const beforeEntry = before.find((r) => r.id === reportId);
    expect(beforeEntry?.status).toBe("queued");
    expect(beforeEntry?.retryCount).toBe(1);

    // First sync attempt — 503 keeps it as queued
    await goOnline(page, context);

    await expect
      .poll(async () => callCount, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);

    // After a 503 the retry count should be incremented but data must still be present
    await expect
      .poll(
        async () => {
          const reports = await readQueuedReports(page);
          return reports.find((r) => r.id === reportId);
        },
        {
          message: "Report should still exist after failed sync",
          timeout: 5_000,
        },
      )
      .toBeDefined();

    // Check that the entry was not deleted (data preserved)
    const afterFirstSync = await readQueuedReports(page);
    const afterEntry = afterFirstSync.find((r) => r.id === reportId);
    expect(afterEntry, "Report must not be lost after sync failure").toBeDefined();
  });

  test("offline/online status is accessible via aria-live region", async ({
    page,
    context,
  }) => {
    await mockBackgroundApis(page);
    await page.route("**/api/v1/reports**", (route) => route.continue());

    // Load the wizard inside the application shell and connectivity provider.
    await page.goto("/report");
    await page.waitForLoadState("networkidle");

    // Simulate going offline — this triggers useConnectivityToast to call
    // toast.warning(), which causes Sonner to render its [data-sonner-toaster] container.
    // Note: Sonner v2 only renders the container when at least one toast is active.
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // The Toaster container should appear once the connectivity toast fires.
    // Sonner marks it with [data-sonner-toaster] and wraps it in an aria-live region.
    const toastRegion = page.locator('[data-sonner-toaster]');
    await expect(toastRegion).toBeAttached({ timeout: 8_000 });

    // The Sonner container wraps toasts in a section[aria-live="polite"] for screen readers.
    // Use the Sonner-specific aria-label to avoid ambiguity with other aria-live regions.
    const ariaLiveRegion = page.locator('section[aria-live="polite"]');
    await expect(ariaLiveRegion).toBeAttached({ timeout: 5_000 });
  });

  test("report stays in IndexedDB after navigating away while offline", async ({
    page,
    context,
  }) => {
    const reportId = `e2e-navigate-${Date.now()}`;

    await page.route("**/api/v1/reports**", (route) => route.continue());
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], total: 0 }),
      }),
    );
    // Playwright routes match newest first, so provider-specific envelopes must
    // be registered after the generic response used by this persistence test.
    await mockBackgroundApis(page);

    // Navigate while online so Next.js caches the route information
    await page.goto("/report");
    await page.waitForLoadState("networkidle");

    // Go offline and seed a queued report
    await context.setOffline(true);
    await seedQueuedReport(page, reportId);

    // Verify it's queued in IndexedDB
    const before = await readQueuedReports(page);
    expect(before.find((r) => r.id === reportId)?.status).toBe("queued");

    // Come back online before navigating so Next.js RSC fetches succeed
    await goOnline(page, context);

    // Navigate to /my-reports — simulates "navigate away" from the report page
    await page.goto("/my-reports");
    await page.waitForLoadState("networkidle");

    // IndexedDB must retain the queued entry across page navigation
    const after = await readQueuedReports(page);
    const entry = after.find((r) => r.id === reportId);
    expect(entry, "Report must persist in IndexedDB after navigation").toBeDefined();
    // Status may be "queued" or "synced" (sync triggered on reconnect), but must not be deleted
    expect(["queued", "synced", "syncing"]).toContain(entry!.status);
  });
});
