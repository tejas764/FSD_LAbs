import { test, expect, type Page } from "@playwright/test";

// Requires npm run build && npm start, migrated local API, and persistent browser storage.
// Run with CRISISMAP_PRODUCTION_E2E=1 against the production server.
test.describe("integrated production offline workflow", () => {
  test.skip(process.env.CRISISMAP_PRODUCTION_E2E !== "1", "Requires a production build and local API");

  async function messages(page: Page): Promise<Array<{ id: string; deviceId: string; content: string; status: string }>> {
    return page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("crisismap-field", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("messages").objectStore("messages").getAll();
        read.onsuccess = () => { resolve(read.result); db.close(); };
        read.onerror = () => { reject(read.error); db.close(); };
      };
    }));
  }

  test("persists messages across real offline reload and acknowledges them once after reconnect", async ({ page, context }) => {
    test.setTimeout(90_000);
    const marker = `Integration check ${crypto.randomUUID()}`;
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "Your offline field workspace" })).toBeVisible();
    await page.waitForFunction(async () => {
      if (!navigator.serviceWorker.controller) return false;
      const names = await caches.keys();
      for (const name of names.filter((key) => key.startsWith("crisismap-static-"))) {
        if (await (await caches.open(name)).match("/offline")) return true;
      }
      return false;
    });
    await expect(page.getByRole("switch", { name: "Online mode" })).toBeChecked();
    await page.getByRole("switch", { name: "Online mode" }).click();
    await expect(page.getByRole("switch", { name: "Online mode" })).not.toBeChecked();
    await page.getByLabel("Message", { exact: true }).fill(marker);
    await page.getByRole("button", { name: "Save message", exact: true }).click();
    await expect.poll(async () => (await messages(page)).find((item) => item.content === marker)?.status).toBe("queued");
    const original = (await messages(page)).find((item) => item.content === marker)!;

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Your offline field workspace" })).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Online mode" })).not.toBeChecked();
    expect((await messages(page)).find((item) => item.id === original.id)?.status).toBe("queued");

    await context.setOffline(false);
    // A manual offline choice must survive the network returning.
    await expect(page.getByRole("switch", { name: "Online mode" })).not.toBeChecked();
    await page.getByRole("switch", { name: "Online mode" }).click();
    await expect.poll(async () => (await messages(page)).find((item) => item.id === original.id)?.status, { timeout: 30_000 }).toBe("synced");
    const response = await page.request.get(`/api/v1/field-messages?deviceId=${encodeURIComponent(original.deviceId)}`);
    expect(response.ok()).toBe(true);
    const stored = await response.json();
    expect(stored.data.filter((item: { id: string }) => item.id === original.id)).toHaveLength(1);
    // Verify replay preserves the first accepted payload instead of duplicating it.
    const first = stored.data.find((item: { id: string }) => item.id === original.id);
    const replay = await page.request.post("/api/v1/field-messages", { data: {
      id: first.id, deviceId: first.deviceId, content: "changed retry", type: first.type, createdAt: first.createdAt,
    } });
    expect(replay.ok()).toBe(true);
    expect((await replay.json()).data.content).toBe(marker);
  });
});
