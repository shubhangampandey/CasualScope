import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../packages/storage/index.js";
import { createApp, report } from "../../apps/api/app.js";
import { seed, type User } from "../../apps/api/auth.js";
import { config } from "../../packages/shared/config.js";
import { analyze } from "../../packages/analysis/index.js";
import {
  experimentSchema,
  type Incident,
} from "../../packages/shared/index.js";
import { span } from "../fixtures.js";
const dir = mkdtempSync(join(tmpdir(), "causalscope-test-")),
  store = new Store("local", dir),
  { app } = createApp(store);
let cookie = "",
  csrf = "";
beforeAll(async () => {
  await seed(store);
  const response = await request(app).post("/api/v1/auth/login").send({
    email: "engineer@northstar.local",
    password: "Northstar-local-2026!",
  });
  cookie = response.headers["set-cookie"][0].split(";")[0];
  csrf = response.body.csrf;
});
afterAll(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("authentication, isolation and bounded inputs", () => {
  it("requires authentication and sets protected session cookies", async () => {
    expect((await request(app).get("/api/v1/analysis")).status).toBe(401);
    const r = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.user.password).toBeUndefined();
  });
  it("blocks cross-workspace and cross-environment access", async () => {
    await store.put("other", "incident", {
      id: "secret",
      environment: "commerce",
    });
    expect(
      (
        await request(app)
          .get("/api/v1/incidents")
          .set("Cookie", cookie)
          .set("x-workspace", "other")
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/incidents/secret").set("Cookie", cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get("/api/v1/traces")
          .set("Cookie", cookie)
          .set("x-environment", "production")
      ).status,
    ).toBe(403);
  });
  it("rejects mutations without CSRF and invalid query windows", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/analysis")
          .set("Cookie", cookie)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/v1/traces?start=0&end=9999999999")
          .set("Cookie", cookie)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/analysis")
          .set("Cookie", cookie)
          .set("X-CSRF-Token", csrf)
          .set("Origin", "https://untrusted.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("enforces viewer authorization on incident mutations and experiments", async () => {
    const u = (await store.get<User>("system", "user", "northstar-engineer"))!;
    await store.put("system", "user", {
      ...u,
      memberships: [
        { workspace: "northstar", role: "viewer", environments: ["commerce"] },
      ],
    });
    expect(
      (
        await request(app)
          .post("/api/v1/experiments")
          .set("Cookie", cookie)
          .set("X-CSRF-Token", csrf)
          .send({})
      ).status,
    ).toBe(403);
    await store.put("system", "user", u);
  });
  it("validates local-only target enums, bounds, and meaningful fault targets", () => {
    const c = {
      name: "test",
      fault: "pool-exhaustion",
      target: "inventory",
      duration: 10,
      rate: 8,
      seed: 42,
    };
    expect(experimentSchema.safeParse(c).success).toBe(true);
    for (const extra of [
      { target: "https://outside.example" },
      { rate: 5000 },
      { duration: 10000 },
      { target: "gateway" },
      { url: "http://external" },
    ])
      expect(experimentSchema.safeParse({ ...c, ...extra }).success).toBe(
        false,
      );
  });
  it("deduplicates observations and isolates inference from hidden fault labels", async () => {
    const s = span();
    await store.insertSpans([s, s]);
    expect(await store.spans({ ...s, start: 0, end: Date.now() })).toHaveLength(
      1,
    );
    const before = analyze(
      [s],
      s.workspace,
      s.environment,
      0,
      Date.now(),
    ).hypotheses;
    await store.truth(s.workspace, "secret-label", {
      target: "payment",
      fault: "latency",
      seed: 42,
    });
    const after = analyze(
      [s],
      s.workspace,
      s.environment,
      0,
      Date.now(),
    ).hypotheses;
    expect(after).toEqual(before);
  });
  it("core analysis and reports operate without Gemini and preserve evidence IDs", async () => {
    const a = analyze(
      [span()],
      "northstar",
      "commerce",
      Date.now() - 10000,
      Date.now(),
    );
    await store.put("northstar", "analysis", a);
    const r = await request(app)
      .post("/api/v1/incidents")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ name: "Real persisted test evidence", analysisId: a.id });
    expect(r.status).toBe(201);
    const i = r.body as Incident;
    const exported = await request(app)
      .get(`/api/v1/reports/${i.id}`)
      .set("Cookie", cookie);
    expect(exported.body.analysis.id).toBe(a.id);
    expect(exported.body.distinction).toContain("not proof");
    const replay = await request(app)
      .get(`/api/v1/incidents/${i.id}/replay`)
      .set("Cookie", cookie);
    expect(replay.body.source).toBe("persisted observations");
    expect(replay.body.analysis.spanCount).toBe(1);
    expect(
      (
        await request(app)
          .patch(`/api/v1/incidents/${i.id}`)
          .set("Cookie", cookie)
          .set("X-CSRF-Token", csrf)
          .send({ status: "monitoring" })
      ).status,
    ).toBe(409);
  });
});
