import {
  test,
  expect,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Explicitly opt in: creates isolated real accounts in the configured local DB.
// No HTTP fixtures, pre-existing accounts, or persistent demo credentials are used.
test.describe("live volunteer workflow", () => {
  test.skip(
    process.env.CRISISMAP_VOLUNTEER_LIVE_E2E !== "1",
    "Requires the migrated local API and production frontend",
  );

  test("registers, signs in, manages assignments, and verifies coordinator-approved hours", async ({
    browser,
  }) => {
    test.setTimeout(180000);
    const apiRequire = createRequire(
      path.resolve(process.cwd(), "../api/package.json"),
    );
    const dotenv = apiRequire("dotenv") as {
      parse: (text: string) => Record<string, string>;
    };
    const connectionString =
      process.env.VOLUNTEER_TEST_DATABASE_URL ??
      dotenv.parse(
        readFileSync(path.resolve(process.cwd(), "../api/.env.local"), "utf8"),
      ).DATABASE_URL;
    if (!connectionString)
      throw new Error("A local volunteer test database must be configured.");
    type LocalClient = {
      connect: () => Promise<void>;
      end: () => Promise<void>;
      query: (
        sql: string,
        values?: unknown[],
      ) => Promise<{ rows: Array<Record<string, unknown>> }>;
    };
    const Client = (
      apiRequire("pg") as {
        Client: new (options: {
          connectionString: string;
          connectionTimeoutMillis: number;
          statement_timeout: number;
        }) => LocalClient;
      }
    ).Client;
    const database = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    const marker = randomUUID().slice(0, 10);
    const volunteerEmail = `volunteer-live-${marker}@example.test`;
    const coordinatorEmail = `volunteer-live-coordinator-${marker}@example.test`;
    const password = `Live-${randomUUID()}-Aa1!`;
    const volunteerName = `Live Volunteer ${marker}`;
    const skill = `live-${marker}`;
    const ownedEmails = [volunteerEmail, coordinatorEmail];
    const taskIds: string[] = [];
    const options = {
      baseURL: "http://localhost:3000",
      serviceWorkers: "block" as const,
      reducedMotion: "reduce" as const,
      viewport: { width: 1440, height: 1000 },
    };
    const volunteerContext = await browser.newContext(options);
    const coordinatorContext = await browser.newContext(options);
    const page = await volunteerContext.newPage();
    let connected = false;
    let coordinatorId: string | undefined;

    async function success(response: APIResponse) {
      expect(
        response.status(),
        `HTTP ${response.status()} from ${new URL(response.url()).pathname}`,
      ).toBeLessThan(400);
      return await response.json();
    }
    async function dashboard(context: BrowserContext) {
      return (await success(await context.request.get("/api/v1/volunteers/me")))
        .data;
    }
    function stat(label: string) {
      return page
        .locator("article.overview-stat")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("strong");
    }
    async function refresh() {
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
    }
    async function createTask(title: string) {
      const response = await coordinatorContext.request.post(
        "/api/v1/volunteers/admin/tasks",
        {
          data: {
            title,
            description: "A scoped live test task for this volunteer only.",
            location: "Test community hall",
            requiredSkills: [skill],
            requiresVerification: true,
            capacity: 1,
            startsAt: new Date(Date.now() - 60000).toISOString(),
            endsAt: new Date(Date.now() + 7200000).toISOString(),
          },
        },
      );
      const task = (await success(response)).data;
      taskIds.push(task.id);
      return task;
    }

    try {
      await database.connect();
      connected = true;
      await success(
        await coordinatorContext.request.post("/api/auth/sign-up/email", {
          headers: { Origin: "http://localhost:3000" },
          data: {
            name: `Live Coordinator ${marker}`,
            email: coordinatorEmail,
            password,
          },
        }),
      );
      // Promote only the random account created above; never modify existing users.
      const promoted = await database.query(
        'UPDATE "user" SET role = $1 WHERE email = $2 RETURNING id',
        ["admin", coordinatorEmail],
      );
      coordinatorId = String(promoted.rows[0]?.id ?? "");
      expect(coordinatorId).not.toBe("");
      await coordinatorContext.request.post("/api/auth/sign-out", {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      });
      await success(
        await coordinatorContext.request.post("/api/auth/sign-in/email", {
          headers: { Origin: "http://localhost:3000" },
          data: { email: coordinatorEmail, password },
        }),
      );

      await page.goto("/volunteer/register");
      await page.getByLabel("Full name", { exact: true }).fill(volunteerName);
      await page
        .getByLabel("Email address", { exact: true })
        .fill(volunteerEmail);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page
        .getByLabel("Phone number", { exact: true })
        .fill("+91 90000 00000");
      await page.getByLabel("Your location", { exact: true }).fill("Pune");
      await page
        .getByLabel("Skills", { exact: true })
        .fill(`Logistics, ${skill}`);
      await page
        .getByRole("button", { name: "Create volunteer account" })
        .click();
      await expect(page).toHaveURL(/\/volunteer$/);
      await expect(
        page.getByRole("heading", { name: /Good to have you here/ }),
      ).toBeVisible();
      await expect(page.locator(".volunteer-verification")).toHaveText(
        "Pending",
      );
      await expect(stat("Verified hours")).toHaveText("0");
      const first = await dashboard(volunteerContext);
      expect(first.profile.availability).toBe("OFFLINE");
      const volunteerId = first.profile.id;
      expect(
        (
          await volunteerContext.request.get(
            "/api/v1/volunteers/admin/overview",
          )
        ).status(),
      ).toBe(403);

      await page
        .getByRole("button", { name: "Available", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Available", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Busy", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Busy", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page
        .getByRole("button", { name: "Available", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Available", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("link", { name: "Manage my profile" }).click();
      await page
        .getByLabel("A little about you")
        .fill(
          "Live test: logistics volunteer, available for coordinated community support.",
        );
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await expect(
        page.getByText("Your profile has been saved.", { exact: true }),
      ).toBeVisible();
      await success(
        await coordinatorContext.request.patch(
          `/api/v1/volunteers/admin/profiles/${volunteerId}/verification`,
          { data: { verificationStatus: "VERIFIED" } },
        ),
      );

      const claimTask = await createTask(`Live supplies ${marker}`);
      const declineTask = await createTask(`Live declined offer ${marker}`);
      const acceptTask = await createTask(`Live accepted offer ${marker}`);
      await success(
        await coordinatorContext.request.post(
          `/api/v1/volunteers/admin/tasks/${declineTask.id}/assign`,
          { data: { volunteerId } },
        ),
      );
      await success(
        await coordinatorContext.request.post(
          `/api/v1/volunteers/admin/tasks/${acceptTask.id}/assign`,
          { data: { volunteerId } },
        ),
      );
      const shiftTitle = `Live planned shift ${marker}`;
      await success(
        await coordinatorContext.request.post(
          "/api/v1/volunteers/admin/shifts",
          {
            data: {
              volunteerId,
              title: shiftTitle,
              location: "Test community hall",
              startsAt: new Date(Date.now() + 86400000).toISOString(),
              endsAt: new Date(Date.now() + 93600000).toISOString(),
            },
          },
        ),
      );

      await page.goto("/volunteer");
      await expect(page.locator(".volunteer-verification")).toHaveText(
        "Verified",
      );
      await expect(stat("Upcoming shifts")).toHaveText("1");
      await page.getByRole("tab", { name: /My assignments/ }).click();
      const declined = page.locator("article.volunteer-assignment").filter({
        has: page.getByRole("heading", {
          name: declineTask.title,
          exact: true,
        }),
      });
      await declined
        .getByRole("button", { name: "Decline", exact: true })
        .click();
      await expect(declined).toHaveCount(0);
      const offered = page.locator("article.volunteer-assignment").filter({
        has: page.getByRole("heading", {
          name: acceptTask.title,
          exact: true,
        }),
      });
      await offered.getByRole("button", { name: "Accept assignment" }).click();
      await expect(offered.locator(".volunteer-task-status")).toHaveText(
        "Accepted",
      );

      await page
        .getByRole("tab", { name: "Eligible tasks", exact: true })
        .click();
      await page.getByLabel("Search eligible volunteer tasks").fill(marker);
      const catalogTask = page
        .locator("article.volunteer-catalog-task")
        .filter({
          has: page.getByRole("heading", {
            name: claimTask.title,
            exact: true,
          }),
        });
      await catalogTask
        .getByRole("button", { name: "Accept task", exact: true })
        .click();
      await page.getByRole("tab", { name: /My assignments/ }).click();
      const assigned = page.locator("article.volunteer-assignment").filter({
        has: page.getByRole("heading", {
          name: claimTask.title,
          exact: true,
        }),
      });
      await assigned.getByRole("slider", { name: "Task progress" }).focus();
      await assigned
        .getByRole("slider", { name: "Task progress" })
        .press("End");
      await assigned
        .getByLabel(`Progress notes for ${claimTask.title}`)
        .fill("Supplies organised and ready for handover.");
      await assigned.getByRole("button", { name: "Save progress" }).click();
      await expect(assigned.locator(".volunteer-task-status")).toHaveText(
        "In progress",
      );
      await assigned
        .getByRole("button", { name: "Submit completion", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Completion summary")
        .fill(
          "Organised community supplies and completed the coordinator handover.",
        );
      await page
        .getByRole("dialog")
        .getByLabel("Hours volunteered")
        .fill("1.5");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Submit completion report" })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(stat("Verified hours")).toHaveText("0");
      const submitted = await dashboard(volunteerContext);
      const submittedAssignment = submitted.assignments.find(
        (item: { taskId: string }) => item.taskId === claimTask.id,
      );
      expect(submittedAssignment.status).toBe("COMPLETION_SUBMITTED");
      expect(submitted.stats.verifiedHours).toBe(0);

      await success(
        await coordinatorContext.request.post(
          `/api/v1/volunteers/admin/assignments/${submittedAssignment.id}/review`,
          {
            data: {
              decision: "APPROVE",
              notes: "Live test: completion and hours reviewed.",
            },
          },
        ),
      );
      await refresh();
      await expect(stat("Verified hours")).toHaveText("1.5");
      await expect(stat("Completed tasks")).toHaveText("1");
      await page.getByRole("tab", { name: "Task history" }).click();
      await expect(
        page.getByRole("row").filter({ hasText: claimTask.title }),
      ).toContainText("Completed");
      await expect(
        page.getByRole("row").filter({ hasText: declineTask.title }),
      ).toContainText("Declined");

      await page
        .getByRole("button", { name: "Safety check-in", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Check-in notes")
        .fill("Safe at the test meeting point.");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save safety check-in" })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      const checked = await dashboard(volunteerContext);
      expect(checked.checkIns[0].status).toBe("SAFE");
      expect(checked.checkIns[0].notes).toBe("Safe at the test meeting point.");

      await page.getByRole("tab", { name: "Overview", exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: "test-results/volunteer-live-desktop.png",
        fullPage: true,
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `test-results/volunteer-live-mobile-${width}.png`,
          fullPage: true,
        });
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", { name: "Switch to dark mode", exact: true })
        .click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.screenshot({
        path: "test-results/volunteer-live-dark.png",
        fullPage: true,
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      const coordinatorPage = await coordinatorContext.newPage();
      await coordinatorPage.goto("/dashboard/volunteers");
      await expect(
        coordinatorPage.getByRole("heading", {
          name: "Good people. Meaningful action.",
          exact: true,
        }),
      ).toBeVisible();
      await coordinatorPage
        .getByRole("textbox", { name: "Search volunteers", exact: true })
        .fill(volunteerEmail);
      await expect(
        coordinatorPage.getByText(volunteerEmail, { exact: true }),
      ).toBeVisible();
      await coordinatorPage.screenshot({
        path: "test-results/volunteer-coordinator-desktop.png",
        fullPage: true,
      });
      expect(
        (await new AxeBuilder({ page: coordinatorPage }).analyze()).violations,
      ).toEqual([]);

      await page
        .getByRole("button", { name: volunteerName, exact: true })
        .click();
      await page.getByRole("menuitem", { name: /Sign out/i }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.goto("/volunteer");
      await expect(page).toHaveURL(/\/volunteer\/login/);
      await page
        .getByLabel("Email address", { exact: true })
        .fill(volunteerEmail);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/volunteer$/);
      await expect(stat("Verified hours")).toHaveText("1.5");
    } finally {
      await volunteerContext.close();
      await coordinatorContext.close();
      if (connected) {
        // Cascade only the accounts generated by this test, then remove their tasks.
        await database.query(
          'DELETE FROM "user" WHERE email = ANY($1::text[]) AND email LIKE $2',
          [ownedEmails, "volunteer-live-%@example.test"],
        );
        if (coordinatorId && taskIds.length)
          await database.query(
            'DELETE FROM "VolunteerTask" WHERE "createdBy" = $1 AND id = ANY($2::text[])',
            [coordinatorId, taskIds],
          );
      }
      await database.end();
    }
  });
});
