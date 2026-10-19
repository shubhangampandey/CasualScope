import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { config } from "../packages/shared/config.js";
import { type Experiment, type Analysis } from "../packages/shared/index.js";
import { delay } from "../apps/demo-system/pool.js";
const base = `http://localhost:${config.API_PORT}/api/v1`;
const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.DEMO_EMAIL || "engineer@northstar.local",
    password: process.env.DEMO_PASSWORD || "Northstar-local-2026!",
  }),
});
assert(login.ok);
const { csrf } = (await login.json()) as { csrf: string },
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${base}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert(r.ok, `${path}: ${r.status}`);
  return r.json() as Promise<T>;
}
type Pair = { id: string; status: string; baselineId: string; faultId: string };
const pair = await api<Pair>("comparisons", {
  name: "Pair orchestration verification",
  fault: "pool-exhaustion",
  target: "inventory",
  duration: 5,
  rate: 8,
  seed: 867531,
  magnitude: 400,
  failureRate: 0.5,
  workload: "checkout",
});
let current = pair;
const deadline = Date.now() + 45000;
while (current.status === "running" && Date.now() < deadline) {
  await delay(500);
  current = (await api<Pair[]>("comparisons")).find((c) => c.id === pair.id)!;
}
assert.equal(current.status, "completed");
const runs = await api<Experiment[]>("experiments"),
  baseline = runs.find((r) => r.id === current.baselineId)!,
  fault = runs.find((r) => r.id === current.faultId)!;
assert.equal(baseline.status, "completed");
assert.equal(fault.status, "completed");
assert.equal(baseline.config.seed, fault.config.seed);
assert.equal(baseline.config.fault, "healthy");
const a = await api<Analysis>(`analysis?id=${fault.analysisId}`);
assert.equal(a.sourceRuns?.length, 2);
assert(a.sourceRuns.some((r) => r.id === baseline.id));
assert(a.sourceRuns.some((r) => r.id === fault.id));
writeFileSync(
  "artifacts/pair-verification.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      pair: current,
      baseline: {
        id: baseline.id,
        requests: baseline.completedRequests,
        errors: baseline.failedRequests,
      },
      fault: {
        id: fault.id,
        requests: fault.completedRequests,
        errors: fault.failedRequests,
      },
      analysisId: a.id,
      sourceRuns: a.sourceRuns,
      limitation:
        "Short orchestration smoke test; duration is insufficient for a full statistical baseline.",
    },
    null,
    2,
  ),
);
console.log(
  "PASS: paired controller executes healthy then fault, resets, persists both and isolates their analysis inputs.",
);
