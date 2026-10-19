import { mkdirSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { config } from "../packages/shared/config.js";
import {
  type Analysis,
  type Experiment,
  type ExperimentConfig,
  type Fault,
  type Service,
} from "../packages/shared/index.js";
import { Store } from "../packages/storage/index.js";
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
assert(login.ok, "Login");
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
  assert(r.ok, `${path}: ${await (r.ok ? Promise.resolve("") : r.text())}`);
  return r.json() as Promise<T>;
}
const results: unknown[] = [];
async function run(
  fault: Fault,
  target: Service,
  duration: number,
  magnitude = 400,
) {
  const c: ExperimentConfig = {
    name: `Verification / ${fault}`,
    fault,
    target,
    duration,
    rate: 8,
    seed: 3407,
    magnitude,
    failureRate: fault === "retry-storm" ? 0.9 : 0.6,
    workload: "checkout",
  };
  console.log(`Executing ${fault} (${duration}s)`);
  const r = await api<Experiment>("experiments", c);
  let latest = r;
  while (latest.status === "running") {
    await delay(1000);
    latest = (await api<Experiment[]>("experiments")).find(
      (x) => x.id === r.id,
    )!;
  }
  assert.equal(latest.status, "completed", latest.error);
  assert(latest.analysisId);
  const a = await api<Analysis>(`analysis?id=${latest.analysisId}`),
    store = new Store(),
    spans = await store.spans({
      workspace: "northstar",
      environment: "commerce",
      start: latest.start,
      end: latest.end!,
    });
  await store.close();
  assert(spans.length > 0, "Persisted real telemetry required");
  assert(
    spans.some((s) => s.kind === 3) && spans.some((s) => s.kind === 2),
    "Client/server instrumentation",
  );
  const lookup = new Set(spans.map((s) => `${s.traceId}:${s.spanId}`));
  assert(
    spans.some(
      (s) => s.parentSpanId && lookup.has(`${s.traceId}:${s.parentSpanId}`),
    ),
    "Trace propagation",
  );
  if (fault === "pool-exhaustion")
    assert(
      spans.some((s) => Number(s.attributes["db.connection.wait_ms"]) > 25),
      "Real connection contention",
    );
  if (fault === "retry-storm")
    assert(
      spans.some((s) => Number(s.attributes["retry.attempt"]) > 0),
      "Real retry amplification",
    );
  if (fault === "queue-backlog")
    assert(
      spans.some((s) => Number(s.attributes["messaging.message.age_ms"]) > 200),
      "Observed backlog",
    );
  if (fault === "bad-deployment")
    assert(
      spans.some((s) => s.attributes["service.version"] === "regression-v2"),
      "Observed configuration regression",
    );
  if (fault === "cascading-timeout")
    assert(
      spans.some((s) => s.attributes["error.type"] === "timeout"),
      "Observed deadline exceeded",
    );
  const result = {
    fault,
    target,
    runId: r.id,
    status: latest.status,
    completedRequests: latest.completedRequests,
    failedRequests: latest.failedRequests,
    spanCount: spans.length,
    edgeCount: a.edges.length,
    anomalies: a.anomalies.length,
    leadingHypothesis: a.hypotheses[0]?.service,
    analysisMs: a.runtime,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/live-verification.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        storage: config.STORAGE_MODE,
        exporterEndpoint:
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "direct receiver",
        results,
      },
      null,
      2,
    ),
  );
  return latest;
}
await run("healthy", "inventory", 20);
const checks: [Fault, Service, number, number?][] = process.argv.includes(
  "--all",
)
  ? [
      ["pool-exhaustion", "inventory", 15],
      ["retry-storm", "payment", 12],
      ["queue-backlog", "notification", 15, 700],
      ["bad-deployment", "payment", 10],
      ["partial-failure", "payment", 5],
      ["cache-degradation", "catalog", 5],
      ["cascading-timeout", "inventory", 5, 1200],
      ["latency", "payment", 5],
      ["unavailable", "payment", 5],
      ["resource-saturation", "inventory", 5],
    ]
  : [
      ["pool-exhaustion", "inventory", 15],
      ["retry-storm", "payment", 12],
      ["queue-backlog", "notification", 15, 700],
    ];
for (const [fault, target, duration, magnitude] of checks)
  await run(fault, target, duration, magnitude);
const r = await api<Experiment>("experiments", {
  name: "Cancellation verification",
  fault: "latency",
  target: "payment",
  duration: 15,
  rate: 5,
  seed: 42,
  magnitude: 500,
  workload: "checkout",
  failureRate: 0.5,
});
await delay(1000);
await api(`experiments/${r.id}/stop`, {});
await delay(3500);
const stopped = (await api<Experiment[]>("experiments")).find(
  (x) => x.id === r.id,
);
assert.equal(stopped?.status, "cancelled");
const healthy = await fetch(`http://${config.DEMO_HOST}:4100/checkout`, {
  method: "POST",
  headers: { "x-internal-control": config.CONTROL_TOKEN },
});
assert(healthy.ok, "Fault reset after cancellation");
const sse = await fetch(`${base}/events`, {
  headers: { Cookie: cookie },
  signal: AbortSignal.timeout(5000),
});
assert.equal(
  sse.headers.get("content-type")?.split(";")[0],
  "text/event-stream",
);
const reader = sse.body!.getReader(),
  event = await reader.read();
assert(new TextDecoder().decode(event.value).includes("event: update"));
await reader.cancel();
console.log(
  "PASS: trace propagation, real ingestion, bounded fault evidence, cancellation/reset, SSE. Results: artifacts/live-verification.json",
);
