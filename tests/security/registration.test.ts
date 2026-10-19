import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/storage/index.js";
import { createApp } from "../../apps/api/app.js";
import { seed, type User } from "../../apps/api/auth.js";
import { config } from "../../packages/shared/config.js";

const directory = mkdtempSync(join(tmpdir(), "causalscope-registration-"));
const store = new Store("local", directory);
const { app } = createApp(store);
const account = {
  name: "New Engineer",
  email: "new-engineer@example.test",
  password: "New-engineer-passphrase-2026!",
};
beforeAll(() => seed(store));
afterAll(async () => {
  await store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("account registration", () => {
  it("returns anonymous status without a 401 while preserving API authentication", async () => {
    const response = await request(app).get("/api/v1/auth/session");
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
  });
  it("registers with normalized email, hashes the password, and isolates the workspace", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...account, email: ` ${account.email.toUpperCase()} ` });
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(account.email);
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.user.memberships[0].workspace).not.toBe("northstar");
    const stored = await store.userByEmail<User>(account.email);
    expect(stored?.password).toMatch(/^\$argon2id\$/);
    const cookie = response.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    const session = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", cookie);
    expect(session.body.workspaceName).toBe("New Engineer's workspace");
    expect(
      (
        await request(app)
          .get("/api/v1/analysis")
          .set("Cookie", cookie)
          .set("x-workspace", "northstar")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/logout")
          .set("Cookie", cookie)
          .set("X-CSRF-Token", response.body.csrf)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/v1/auth/session").set("Cookie", cookie))
        .body,
    ).toBeNull();
    expect(
      (
        await request(app).post("/api/v1/auth/login").send({
          email: account.email.toUpperCase(),
          password: account.password,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: account.email, password: "wrong" })
      ).status,
    ).toBe(401);
  });
  it("rejects duplicates, short passwords, injected roles and untrusted origins", async () => {
    const alias = new URL(config.WEB_ORIGIN);
    alias.hostname = alias.hostname === "localhost" ? "127.0.0.1" : "localhost";
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .set("Origin", alias.origin)
          .send({ email: account.email, password: account.password })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/v1/auth/register").send(account)).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/register")
          .send({ ...account, password: "short" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/register")
          .send({ ...account, role: "owner" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/register")
          .set("Origin", "https://untrusted.example")
          .send(account)
      ).status,
    ).toBe(403);
  });
  it("resolves duplicate races atomically without changing the existing account", async () => {
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post("/api/v1/auth/register")
          .set("Origin", config.WEB_ORIGIN)
          .send({ ...account, email: "race@example.test" }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await store.list("system", "user", 500)).toHaveLength(3);
  });
  it("can log in to an older account even after more than 500 users exist", async () => {
    const original = (await store.userByEmail<User>(account.email))!;
    for (let index = 0; index < 505; index++)
      await store.put("system", "user", {
        ...original,
        id: `extra-${index}`,
        email: `extra-${index}@example.test`,
      });
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: account.email, password: account.password })
      ).status,
    ).toBe(200);
  });
});
