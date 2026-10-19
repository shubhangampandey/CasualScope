import express from "express";
import rateLimit from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
import { scope, type Log } from "../../packages/shared/index.js";
import { decodeOTLP, encodeResponse } from "../../packages/telemetry/otlp.js";
export const ingestionStats = {
  batches: 0,
  received: 0,
  rejected: 0,
  storageFailures: 0,
  inFlight: 0,
  quotaRejected: 0,
};
export function tokenEqual(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createIngest(
  store: Store,
  limits: { logRequestsPerMinute?: number } = {},
) {
  const app = express();
  const discovered = new Set<string>();
  let quotaAt = Date.now(),
    quotaCount = 0;
  app.disable("x-powered-by");
  app.get("/health", async (_req, res) => {
    try {
      res.json(await store.health());
    } catch {
      res.status(503).json({ status: "storage unavailable" });
    }
  });
  app.use(
    "/v1/traces",
    rateLimit({
      windowMs: 60000,
      limit: 2400,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  // Best-effort error logs cannot consume the trace receiver's retry budget.
  app.use(
    "/internal/logs",
    rateLimit({
      windowMs: 60000,
      limit: limits.logRequestsPerMinute ?? 2000,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use((req, res, next) => {
    if (
      !tokenEqual(
        req.get("authorization") || "",
        `Bearer ${config.INGEST_TOKEN}`,
      )
    ) {
      res.status(401).json({ error: "Invalid ingestion credential" });
      return;
    }
    next();
  });
  app.get("/internal/stats", (_req, res) => res.json(ingestionStats));
  app.post(
    "/v1/traces",
    express.raw({
      type: "application/x-protobuf",
      limit: "4mb",
      inflate: true,
    }),
    async (req, res, next) => {
      if (!Buffer.isBuffer(req.body)) {
        res
          .status(415)
          .json({ error: "Only OTLP/HTTP protobuf traces are supported" });
        return;
      }
      if (ingestionStats.inFlight >= 4) {
        res.set("Retry-After", "1").status(503).end();
        return;
      }
      ingestionStats.inFlight++;
      try {
        const { spans, rejected } = decodeOTLP(
          req.body,
          scope.workspace,
          scope.environment,
        );
        if (Date.now() - quotaAt >= 60000) {
          quotaAt = Date.now();
          quotaCount = 0;
          discovered.clear();
        }
        const nextServices = new Set([
          ...discovered,
          ...spans.map((s) => s.service),
        ]);
        if (quotaCount + spans.length > 60000 || nextServices.size > 128) {
          ingestionStats.quotaRejected += spans.length;
          res
            .set("Retry-After", "60")
            .status(429)
            .json({ error: "Environment ingestion quota exceeded" });
          return;
        }
        quotaCount += spans.length;
        for (const s of nextServices) discovered.add(s);
        await store.insertSpans(spans);
        ingestionStats.batches++;
        ingestionStats.received += spans.length;
        ingestionStats.rejected += rejected;
        res.type("application/x-protobuf").send(encodeResponse(rejected));
      } catch (e) {
        if (
          e instanceof Error &&
          /Batch|index out|invalid wire|buffer/.test(e.message)
        ) {
          res.status(400).json({ error: "Invalid OTLP batch" });
        } else {
          ingestionStats.storageFailures++;
          res
            .set("Retry-After", "2")
            .status(503)
            .json({ error: "Telemetry could not be persisted" });
        }
      } finally {
        ingestionStats.inFlight--;
      }
    },
  );
  const logSchema = z
    .object({
      traceId: z.string().regex(/^[a-f0-9]{32}$/),
      spanId: z.string().regex(/^[a-f0-9]{16}$/),
      service: z.string().max(80),
      time: z.number().finite(),
      level: z.enum(["info", "warn", "error"]),
      message: z.string().max(2000),
    })
    .strict();
  app.post(
    "/internal/logs",
    express.json({ limit: "128kb" }),
    async (req, res) => {
      const p = z.array(logSchema).max(100).safeParse(req.body);
      if (!p.success) {
        res.status(400).json({ error: "Invalid logs" });
        return;
      }
      const logs: Log[] = p.data.map((l) => ({
        ...l,
        ...scope,
        id: crypto.randomUUID(),
      }));
      try {
        await store.insertLogs(logs);
        res.json({ accepted: logs.length });
      } catch {
        res.status(503).json({ error: "Storage unavailable" });
      }
    },
  );
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res.status(400).json({
        error: err.message.includes("large")
          ? "Payload too large"
          : "Malformed request",
      }),
  );
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const store = new Store();
  createIngest(store).listen(config.INGEST_PORT, "0.0.0.0", () =>
    console.log(`OTLP receiver :${config.INGEST_PORT}`),
  );
}
