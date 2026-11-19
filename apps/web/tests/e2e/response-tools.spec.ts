import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Isolate presentation and device persistence from the local Docker/API stack.
// These fixtures are test data only; the application has no simulated directory.
async function stubApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { success: true, data: [] };
    if (url.pathname === "/api/v1/crises") body = [];
    if (url.pathname === "/api/v1/reports")
      body = {
        type: "FeatureCollection",
        features: [],
        meta: { total: 0, limit: 100, nextCursor: null },
      };
    if (url.pathname.includes("/api/auth/")) body = null;
    if (url.pathname.includes("/reporter/"))
      body = {
        success: true,
        data: {
          reporterId: "test-device",
          reportCount: 0,
          badgeLevel: "NEWCOMER",
          lastActiveAt: new Date().toISOString(),
        },
      };
    if (
      url.pathname === "/api/v1/field-messages" &&
      route.request().method() === "POST"
    )
      body = {
        success: true,
        data: {
          ...route.request().postDataJSON(),
          receivedAt: new Date().toISOString(),
        },
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("community response tools", () => {
  test.use({ serviceWorkers: "block" });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await stubApi(page);
  });

  test("saves a household plan and contacts across reloads, and downloads the plan", async ({
    page,
  }) => {
    await page.goto("/preparedness");
    await expect(
      page.getByRole("heading", { name: "Prepared feels better." }),
    ).toBeVisible();
    await page.getByLabel("Drinking water").check();
    await page.getByLabel("Torch & spare batteries").check();
    await page
      .getByLabel("Where will you meet?")
      .fill("The community hall on Hill Road");
    await page.getByLabel("Household notes").fill("Bring the pet carrier.");
    await page.getByRole("button", { name: "Save household plan" }).click();
    await page.getByLabel("Contact name").fill("Test family contact");
    await page.getByLabel("Phone number").fill("+91 90000 00000");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(
      page.getByText("Test family contact", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Drinking water")).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/safety-plan-mobile.png",
      fullPage: true,
    });
    await expect(page.getByLabel("Where will you meet?")).toHaveValue(
      "The community hall on Hill Road",
    );
    await expect(page.getByLabel("Household notes")).toHaveValue(
      "Bring the pet carrier.",
    );
    await expect(
      page.getByText("Test family contact", { exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my plan" }).click();
    expect((await download).suggestedFilename()).toBe(
      "crisismap-safety-plan.txt",
    );
    await page.getByRole("switch", { name: "Online mode" }).click();
    await expect(page).toHaveURL(/\/preparedness$/);
    await expect(
      page.getByRole("switch", { name: "Online mode" }),
    ).not.toBeChecked();
    await page.reload();
    await expect(page.getByLabel("Drinking water")).toBeChecked();
    await expect(page.locator("[data-sonner-toast]")).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-sonner-toast] [data-title]")).toHaveCSS("opacity", "1");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("creates, searches, filters, edits, exports, imports and removes saved resources", async ({
    page,
  }) => {
    await page.goto("/resources");
    await page
      .getByRole("button", { name: "Add a resource", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Place or organisation name")
      .fill("Test community shelter");
    await dialog.getByLabel("Address or location").fill("10 Hill Road");
    await dialog.getByLabel("Recorded availability").selectOption("Available");
    await dialog.getByLabel("Useful notes").fill("Step-free entrance.");
    await dialog.getByRole("button", { name: "Save resource" }).click();
    await expect(
      page.getByRole("heading", { name: "Test community shelter" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Test community shelter" }),
    ).toBeVisible();
    await page.getByLabel("Search saved resources").fill("unknown place");
    await expect(
      page.getByRole("heading", { name: "No matching places" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByLabel("Available only").check();
    await expect(
      page.getByRole("heading", { name: "Test community shelter" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Edit Test community shelter" })
      .click();
    await dialog
      .getByLabel("Place or organisation name")
      .fill("Updated test shelter");
    await dialog.getByRole("button", { name: "Save resource" }).click();
    const directory = await page.evaluate(
      () => localStorage.getItem("crisismap:resources:v1")!,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    expect((await download).suggestedFilename()).toBe(
      "crisismap-resources.json",
    );
    await page.getByLabel("Import resource directory").setInputFiles({
      name: "resources.json",
      mimeType: "application/json",
      buffer: Buffer.from(directory),
    });
    await expect(page.getByText("1 place", { exact: true })).toBeVisible();
    await page.getByLabel("Import resource directory").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('[{"name":"broken"}]'),
    });
    await expect(page.locator(".form-error[role=alert]")).toContainText(
      "not a valid",
    );
    await expect(
      page.getByRole("heading", { name: "Updated test shelter" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/resources-mobile.png",
      fullPage: true,
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page
      .getByRole("button", { name: "Remove Updated test shelter" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove resource", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your local knowledge belongs here." }),
    ).toBeVisible();
  });

  test("queues a safety check-in and keeps the dashboard responsive", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Stronger communities start with you.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check in safely" }).click();
    await page.getByLabel("Add a note").fill("Safe at the meeting point.");
    await page
      .getByRole("button", { name: "Save check-in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check-in saved" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const messages = await page.evaluate(
      () =>
        new Promise<Array<{ content: string }>>((resolve, reject) => {
          const request = indexedDB.open("crisismap-field", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const read = db
              .transaction("messages")
              .objectStore("messages")
              .getAll();
            read.onsuccess = () => {
              resolve(read.result);
              db.close();
            };
          };
        }),
    );
    expect(
      messages.some((message) =>
        message.content.includes("Safe at the meeting point."),
      ),
    ).toBe(true);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1024, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(
        page.getByRole("heading", { name: "Community situation map" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/response-overview-${viewport.width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: "test-results/response-overview-dark.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("navigation", { name: "Quick navigation" }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("mobile response navigation", () => {
  test.use({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  test("keeps map controls and report actions above navigation, and closes the menu after selection", async ({
    page,
  }) => {
    await stubApi(page);
    await page.goto("/map");
    const nav = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(nav).toBeVisible();
    const navBounds = (await nav.boundingBox())!;
    const sheet = page.getByTestId("bottom-sheet");
    await expect(sheet).toBeVisible();
    const sheetBounds = (await sheet.boundingBox())!;
    expect(sheetBounds.y + sheetBounds.height).toBeLessThanOrEqual(
      navBounds.y + 2,
    );
    await page.goto("/report");
    await expect(page.locator(".wizard-actions")).toBeVisible();
    const actions = (await page.locator(".wizard-actions").boundingBox())!;
    expect(actions.y + actions.height).toBeLessThanOrEqual(navBounds.y + 2);
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "My Reports", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/my-reports$/);
  });
});

test.describe("production offline access to planning tools", () => {
  test.use({ serviceWorkers: "allow" });
  test.skip(
    process.env.CRISISMAP_PRODUCTION_E2E !== "1",
    "Requires a production build for service-worker caching",
  );

  test("reloads the checklist and resource directory with the browser disconnected", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await page.goto("/preparedness");
    await page.getByLabel("Drinking water").check();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!navigator.serviceWorker.controller) return false;
            const cacheName = (await caches.keys()).find((name) =>
              name.startsWith("crisismap-static-"),
            );
            if (!cacheName) return false;
            const cache = await caches.open(cacheName);
            return (
              !!(await cache.match("/preparedness")) &&
              !!(await cache.match("/resources"))
            );
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Prepared feels better." }),
    ).toBeVisible();
    await expect(page.getByLabel("Drinking water")).toBeChecked();
    await page.getByLabel("Torch & spare batteries").check();
    await page.goto("/resources", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Add a resource", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Place or organisation name")
      .fill("Offline test shelter");
    await dialog.getByLabel("Address or location").fill("Test location");
    await dialog.getByRole("button", { name: "Save resource" }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Offline test shelter" }),
    ).toBeVisible();
    await context.setOffline(false);
  });
});
