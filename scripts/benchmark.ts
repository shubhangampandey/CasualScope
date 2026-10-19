import { cpus, totalmem, platform, arch } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  analyze,
  buildGraph,
  reconstruct,
  aggregate,
  detect,
  rank,
  percentile,
} from "../packages/analysis/index.js";
import { Store } from "../packages/storage/index.js";
import { span } from "../tests/fixtures.js";
const measures: unknown[] = [];
for (const size of [8, 25, 100]) {
  const data = Array.from({ length: size * 100 }, (_, i) =>
    span({
      traceId: Math.floor(i / size)
        .toString(16)
        .padStart(32, "a"),
      spanId: i.toString(16).padStart(16, "0"),
      parentSpanId: i % size ? (i - 1).toString(16).padStart(16, "0") : "",
      service: `synthetic-service-${i % size}`,
      kind: i % 2 ? 2 : 3,
      start: Date.now() - 100000 + i * 5,
      end: Date.now() - 100000 + i * 5 + 10,
      duration: 10 + (i % 17),
    }),
  );
  const metrics = aggregate(data),
    anomalies = detect(metrics);
  for (const [operation, fn] of Object.entries({
    graph: () => buildGraph(data),
    reconstruction: () => reconstruct(data),
    aggregation: () => aggregate(data),
    detection: () => detect(metrics),
    ranking: () => rank(data, metrics, anomalies),
    analysis: () => analyze(data, "northstar", "commerce", 0, Date.now()),
  })) {
    const times: number[] = [];
    fn();
    for (let n = 0; n < 10; n++) {
      const t = performance.now();
      fn();
      times.push(performance.now() - t);
    }
    measures.push({
      kind: "synthetic algorithm input (not deployed microservices)",
      services: size,
      spans: data.length,
      operation,
      iterations: 10,
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      p99Ms: percentile(times, 0.99),
    });
  }
}
const store = new Store("local", `.data/benchmark-${Date.now()}`),
  data = Array.from({ length: 5000 }, (_, i) =>
    span({
      traceId: i.toString(16).padStart(32, "a"),
      spanId: i.toString(16).padStart(16, "b"),
    }),
  );
let t = performance.now();
await store.insertSpans(data);
const insertMs = performance.now() - t;
t = performance.now();
const queried = await store.spans({
  workspace: "northstar",
  environment: "commerce",
  start: 0,
  end: Date.now(),
});
const queryMs = performance.now() - t;
await store.close();
measures.push({
  kind: "local SQLite (not ClickHouse)",
  operation: "insert + bounded read",
  rows: data.length,
  insertMs,
  queryMs,
  rowsRead: queried.length,
  rowsPerSecond: data.length / (insertMs / 1000),
});
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/benchmarks.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      environment: {
        platform: platform(),
        arch: arch(),
        node: process.version,
        cpu: cpus()[0]?.model,
        logicalCPUs: cpus().length,
        totalMemoryBytes: totalmem(),
      },
      measures,
      limitations:
        "10 iterations; algorithm-only generated data. No production ingestion throughput, HTTP latency, Collector durability, or ClickHouse performance claim.",
    },
    null,
    2,
  ),
);
console.log("Measured results written to artifacts/benchmarks.json");
