import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Store } from "../../packages/storage/index.js";
import type { User, Session } from "../../apps/api/auth.js";

const emails: string[] = [];
test.afterAll(async () => {
  const store = new Store();
  for (const email of emails) {
    const user = await store.userByEmail<User>(email);
    if (!user) continue;
    for (const session of await store.list<Session>("system", "session", 500))
      if (session.userId === user.id)
        await store.remove("system", "session", session.id);
    for (const membership of user.memberships)
      await store.remove(
        membership.workspace,
        "workspace",
        membership.workspace,
      );
    await store.remove("system", "user", user.id);
  }
  await store.close();
});

for (const width of [1440, 390])
  test(`register and sign back in at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const email = `browser-${randomUUID()}@example.test`;
    const password = "Browser-only-registration-test-2026!";
    emails.push(email);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/app");
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page.getByLabel("Full name").fill("Browser Engineer");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Operations overview" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Operations overview" }),
    ).toBeVisible();
    if (width < 768)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.goto("/app");
    await page.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Enter workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Operations overview" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
