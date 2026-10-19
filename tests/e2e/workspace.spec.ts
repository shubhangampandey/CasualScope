import { test, expect, type Page } from "@playwright/test";
import "dotenv/config";
async function signIn(page: Page) {
  await expect(
    page.getByRole("button", { name: "Enter workspace" }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.DEMO_EMAIL || "engineer@northstar.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "Northstar-local-2026!");
  await page.getByRole("button", { name: "Enter workspace" }).click();
}
for (const width of [1440, 1024, 768, 390])
  test(`workspace evidence surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app");
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Operations overview" }),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await page.screenshot({
      path: `artifacts/screenshots/overview-${width}.png`,
      fullPage: true,
    });
    for (const route of [
      "services",
      "traces",
      "metrics",
      "incidents",
      "replay",
      "hypotheses",
      "lab",
      "compare",
      "evaluations",
      "events",
      "analytics",
      "developers",
      "settings",
    ]) {
      await page.goto(`/app/${route}`);
      await expect(page.locator(".page-heading h1")).toBeVisible();
      await expect(page.locator(".loading")).toHaveCount(0);
      await expect(page.locator(".error-banner")).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${route} overflow at ${width}`).toBe(false);
    }
    await page.goto("/app/lab");
    await page.screenshot({
      path: `artifacts/screenshots/lab-${width}.png`,
      fullPage: true,
    });
  });

test("inspect a captured trace and persist an investigator workflow", async ({
  page,
}) => {
  await page.goto("/app");
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await page.goto("/app/traces?service=inventory");
  await expect(
    page.getByRole("heading", { name: "Trace explorer", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".panel .loading")).toHaveCount(0);
  await expect(page.locator(".error-banner")).toHaveCount(0);
  const first = page.locator("tbody tr").first();
  // A fresh CI workspace has no installed telemetry fixture. The live verifier
  // supplies observations when this optional investigation test can run.
  if ((await first.count()) === 0) {
    test.skip(
      true,
      "Run pnpm verify:live to capture real commerce telemetry before this workflow.",
    );
    return;
  }
  await first.click();
  await expect(
    page.getByRole("heading", { name: "Execution waterfall" }),
  ).toBeVisible();
  const rows = page.locator(".span-row"),
    count = await rows.count();
  expect(count).toBeGreaterThan(1);
  await page.locator("button.span-fold").first().click();
  expect(await rows.count()).toBeLessThan(count);
  await page.locator("button.span-fold").first().click();
  expect(await rows.count()).toBe(count);
  await page.locator("div.waterfall").focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("heading", { name: "Span inspector" }),
  ).toBeVisible();
  await page.goto("/app/incidents");
  await page.getByRole("button", { name: "Open investigation" }).click();
  await page
    .getByRole("textbox", { name: "Investigation title" })
    .fill(`Browser verified investigation ${Date.now()}`);
  await page
    .getByRole("button", { name: "Create from current evidence" })
    .click();
  await expect(
    page.getByRole("button", { name: "Move to investigating" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move to investigating" }).click();
  await page
    .getByRole("textbox", { name: "Investigator note" })
    .fill(
      "Observed evidence inspected through a real trace. Cause remains a hypothesis.",
    );
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page
      .locator(".log-entry")
      .filter({ hasText: "Observed evidence inspected through a real trace." }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("id");
  const response = await page.request.get(`/api/v1/reports/${id}`);
  expect(response.ok()).toBe(true);
  const report = await response.json();
  expect(report.incident.notes[0].text).toContain("Cause remains a hypothesis");
  expect(report.analysis.spanCount).toBeGreaterThan(0);
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Navigate workspace" }),
  ).toBeVisible();
  await page.getByPlaceholder("Go to a workspace page…").fill("Replay");
  await page.getByRole("button", { name: "Replay studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Incident replay studio" }),
  ).toBeVisible();
});
