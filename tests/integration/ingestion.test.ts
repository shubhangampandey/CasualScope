import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import protobuf from "protobufjs";
import { gzipSync } from "node:zlib";
import { resolve, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
import { createIngest } from "../../apps/ingest/main.js";
const dir = mkdtempSync(join(tmpdir(), "causalscope-ingest-")),
  store = new Store("local", dir),
  app = createIngest(store);
const root = new protobuf.Root();
root.resolvePath = (_o, p) =>
  p.startsWith("opentelemetry/")
    ? resolve("infrastructure/proto", p)
    : resolve(p);
root.loadSync(
  resolve(
    "infrastructure/proto/opentelemetry/proto/collector/trace/v1/trace_service.proto",
  ),
);
const type = root.lookupType(
  "opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest",
);
afterAll(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("real OTLP protobuf receiver", () => {
  it("a throttled log stream cannot starve trace ingestion", async () => {
    const limited = createIngest(store, { logRequestsPerMinute: 1 });
    const send = () =>
      request(limited)
        .post("/internal/logs")
        .set("Authorization", `Bearer ${config.INGEST_TOKEN}`)
        .send([]);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    const trace = await request(limited)
      .post("/v1/traces")
      .set("Authorization", `Bearer ${config.INGEST_TOKEN}`)
      .set("Content-Type", "application/x-protobuf")
      .send(Buffer.alloc(0));
    expect(trace.status).toBe(200);
  });
  it("accepts official-schema protobuf, gzip, arbitrary tenants are ignored, and repeated batches deduplicate", async () => {
    const start = BigInt(Date.now() - 100) * 1000000n;
    const payload = Buffer.from(
      type
        .encode(
          type.fromObject({
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    {
                      key: "service.name",
                      value: { stringValue: "inventory" },
                    },
                    { key: "workspace", value: { stringValue: "other" } },
                  ],
                },
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId: Buffer.from("a".repeat(32), "hex"),
                        spanId: Buffer.from("b".repeat(16), "hex"),
                        name: "inventory.reserve",
                        kind: 2,
                        startTimeUnixNano: String(start),
                        endTimeUnixNano: String(start + 10000000n),
                        attributes: [
                          {
                            key: "authorization",
                            value: { stringValue: "do-not-persist" },
                          },
                          {
                            key: "fault.target",
                            value: { stringValue: "payment" },
                          },
                          {
                            key: "db.connection.wait_ms",
                            value: { doubleValue: 120 },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        )
        .finish(),
    );
    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post("/v1/traces")
        .set("Authorization", `Bearer ${config.INGEST_TOKEN}`)
        .set("Content-Type", "application/x-protobuf")
        .set("Content-Encoding", "gzip")
        .send(gzipSync(payload));
      expect(r.status).toBe(200);
    }
    const stored = await store.spans({
      workspace: "northstar",
      environment: "commerce",
      start: 0,
      end: Date.now(),
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.attributes).toEqual({ "db.connection.wait_ms": 120 });
    expect(stored[0]!.duration).toBe(10);
    expect(
      await store.spans({
        workspace: "other",
        environment: "commerce",
        start: 0,
        end: Date.now(),
      }),
    ).toHaveLength(0);
  });
  it("rejects unauthenticated, oversized, malformed and unsupported ingestion", async () => {
    expect((await request(app).post("/v1/traces").send({})).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/v1/traces")
          .set("Authorization", `Bearer ${config.INGEST_TOKEN}`)
          .send({ resourceSpans: [] })
      ).status,
    ).toBe(415);
    expect(
      (
        await request(app)
          .post("/v1/traces")
          .set("Authorization", `Bearer ${config.INGEST_TOKEN}`)
          .set("Content-Type", "application/x-protobuf")
          .send(Buffer.alloc(5 * 1024 * 1024))
      ).status,
    ).toBe(400);
  });
});
