import express from "express";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import type { SpanContext } from "@opentelemetry/api";
import {
  instrument,
  headers,
  extract,
  trace,
  context,
  SpanKind,
  ROOT_CONTEXT,
  correlatedLog,
  flush,
} from "../../packages/instrumentation/index.js";
import {
  services,
  experimentSchema,
  type ExperimentConfig,
  type Service,
} from "../../packages/shared/index.js";
import { config } from "../../packages/shared/config.js";
import { tokenEqual } from "../ingest/main.js";
import { BoundedPool, delay } from "./pool.js";
const ports = Object.fromEntries(
  services.map((s, i) => [s, 4100 + i]),
) as Record<Service, number>;
export const serviceURL = (s: Service) =>
  `http://${config.DEMO_HOST}:${ports[s]}`;
let fault: ExperimentConfig | undefined,
  expires = 0;
let randomState = 1;
const random = () => {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
const pool = new BoundedPool(4),
  resource = new BoundedPool(2),
  carts = new Map<string, number>();
const products = [
  {
    id: "ns-001",
    name: "Northstar mechanical keyboard",
    price: 129,
    stock: 1000,
  },
  { id: "ns-002", name: "Studio monitor arm", price: 89, stock: 1000 },
];
let queue: { context: SpanContext; at: number; orderId: string }[] = [],
  processed = 0;
function active() {
  if (expires < Date.now()) fault = undefined;
  return fault;
}
function reset() {
  fault = undefined;
  expires = 0;
  pool.capacity = 4;
  carts.clear();
  queue = [];
  processed = 0;
}
async function call(
  source: Service,
  target: Service,
  path: string,
  method = "GET",
  attempt = 0,
): Promise<any> {
  return instrument(
    source,
    `${method} ${target}${path}`,
    async () => {
      const r = await fetch(`${serviceURL(target)}${path}`, {
        method,
        headers: { ...headers(), "x-internal-control": config.CONTROL_TOKEN },
        signal: AbortSignal.timeout(900),
      });
      trace
        .getSpan(context.active())
        ?.setAttribute("http.response.status_code", r.status);
      if (!r.ok) throw new Error(`${target} returned ${r.status}`);
      return r.json();
    },
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "server.address": target,
        "http.request.method": method,
        "retry.attempt": attempt,
      },
    },
  );
}
async function applyFault(service: Service) {
  const f = active();
  if (!f || f.target !== service) return;
  const span = trace.getSpan(context.active());
  if (f.fault === "unavailable")
    throw new Error("Synthetic dependency unavailable");
  if (
    (f.fault === "partial-failure" || f.fault === "retry-storm") &&
    random() < f.failureRate
  )
    throw new Error("Synthetic operation failed");
  if (["latency", "cascading-timeout", "bad-deployment"].includes(f.fault)) {
    if (f.fault === "bad-deployment")
      span?.setAttribute("service.version", "regression-v2");
    await delay(f.magnitude * (0.8 + random() * 0.4));
  }
  if (f.fault === "resource-saturation") {
    await instrument(service, "resource.capacity.acquire", async () => {
      const lease = await resource.acquire();
      try {
        span?.setAttribute("resource.wait_ms", lease.wait);
        await delay(f.magnitude);
      } finally {
        lease.release();
      }
    });
  }
}
export async function startDemo() {
  const servers: Server[] = [];
  for (const service of services) {
    const app = express();
    app.use(express.json({ limit: "16kb" }));
    app.get("/health", (_req, res) => res.json({ service, status: "ready" }));
    if (service === "gateway") {
      app.post("/control", async (req, res) => {
        if (
          !tokenEqual(req.get("x-internal-control") || "", config.CONTROL_TOKEN)
        ) {
          res.sendStatus(401);
          return;
        }
        if (req.body.action === "reset") {
          reset();
          res.json({ reset: true });
          return;
        }
        if (req.body.action === "flush") {
          await flush();
          res.json({ flushed: true });
          return;
        }
        const p = experimentSchema.safeParse(req.body);
        if (!p.success) {
          res.status(400).json({ error: "Invalid bounded scenario" });
          return;
        }
        reset();
        fault = p.data;
        randomState = p.data.seed;
        expires = Date.now() + p.data.duration * 1000;
        if (fault.fault === "pool-exhaustion") pool.capacity = 1;
        setTimeout(
          () => {
            if (expires <= Date.now()) reset();
          },
          p.data.duration * 1000 + 100,
        ).unref();
        res.json({ expires });
      });
    }
    app.use((req, res, next) => {
      if (
        !tokenEqual(req.get("x-internal-control") || "", config.CONTROL_TOKEN)
      ) {
        res.sendStatus(401);
        return;
      }
      next();
    });
    app.all("/{*path}", async (req, res) => {
      try {
        const result = await instrument(
          service,
          `${req.method} ${req.path}`,
          async () => {
            const span = trace.getSpan(context.active())!;
            span.setAttributes({
              "http.request.method": req.method,
              "http.route": req.path,
            });
            await delay(2 + random() * 5);
            await applyFault(service);
            switch (service) {
              case "gateway": {
                await call("gateway", "auth", "/validate");
                if (req.path === "/browse")
                  return call("gateway", "catalog", "/products");
                if (req.path === "/cart")
                  return call("gateway", "cart", "/cart", "POST");
                return call("gateway", "order", "/checkout", "POST");
              }
              case "auth":
                return { user: "synthetic-customer", valid: true };
              case "catalog": {
                if (
                  active()?.fault === "cache-degradation" &&
                  active()?.target === "catalog"
                ) {
                  span.setAttribute("cache.hit", false);
                  await instrument(
                    "catalog",
                    "catalog.database.read",
                    async () => {
                      await delay(active()?.magnitude || 50);
                    },
                  );
                } else span.setAttribute("cache.hit", true);
                return { products };
              }
              case "cart": {
                const count = Math.min(
                  10,
                  (carts.get("synthetic-customer") || 0) +
                    (req.method === "POST" ? 1 : 0),
                );
                carts.set("synthetic-customer", count);
                await call("cart", "catalog", "/products");
                return {
                  items: [
                    { productId: "ns-001", quantity: Math.max(1, count) },
                  ],
                };
              }
              case "inventory":
                return instrument(
                  "inventory",
                  "inventory.reserve",
                  async () => {
                    const lease = await pool.acquire();
                    try {
                      span.setAttribute("db.connection.wait_ms", lease.wait);
                      span.setAttribute("db.pool.active", pool.active);
                      await delay(
                        active()?.fault === "pool-exhaustion" &&
                          active()?.target === "inventory"
                          ? active()!.magnitude
                          : 8,
                      );
                      return { reserved: true, sku: "ns-001" };
                    } finally {
                      lease.release();
                    }
                  },
                  {
                    attributes: { "db.system.name": "synthetic-bounded-pool" },
                  },
                );
              case "payment":
                return {
                  paymentId: crypto.randomUUID(),
                  status: "authorized",
                  synthetic: true,
                };
              case "order": {
                await call("order", "cart", "/cart");
                await call("order", "inventory", "/reserve", "POST");
                let payment;
                const attempts = active()?.fault === "retry-storm" ? 4 : 1;
                for (let attempt = 0; attempt < attempts; attempt++) {
                  try {
                    payment = await call(
                      "order",
                      "payment",
                      "/authorize",
                      "POST",
                      attempt,
                    );
                    break;
                  } catch (e) {
                    if (attempt === attempts - 1) throw e;
                    await correlatedLog(
                      "order",
                      "warn",
                      `Retrying payment; attempt ${attempt + 1}`,
                    );
                  }
                }
                const orderId = crypto.randomUUID();
                await call("order", "notification", "/enqueue", "POST");
                return { orderId, payment, status: "created" };
              }
              case "notification": {
                if (queue.length >= 200)
                  throw new Error("Bounded notification queue full");
                queue.push({
                  context: span.spanContext(),
                  at: Date.now(),
                  orderId: crypto.randomUUID(),
                });
                span.setAttribute("messaging.queue.depth", queue.length);
                return { queued: true, depth: queue.length, processed };
              }
            }
          },
          { kind: SpanKind.SERVER, parent: extract(req.headers) },
        );
        res.json(result);
      } catch (e) {
        await correlatedLog(
          service,
          "error",
          e instanceof Error ? e.message : "Request failed",
        );
        res.status(503).json({ error: "Synthetic operation failed" });
      }
    });
    servers.push(
      await new Promise<Server>((resolve) => {
        const server = app.listen(ports[service], "0.0.0.0", () =>
          resolve(server),
        );
      }),
    );
  }
  let working = false;
  const timer = setInterval(async () => {
    if (working || !queue.length) return;
    working = true;
    const item = queue.shift()!;
    try {
      await instrument(
        "notification",
        "notification.process",
        async () => {
          const span = trace.getSpan(context.active())!;
          span.setAttributes({
            "messaging.queue.depth": queue.length,
            "messaging.message.age_ms": Date.now() - item.at,
            "messaging.operation.type": "process",
          });
          await delay(
            active()?.fault === "queue-backlog" &&
              active()?.target === "notification"
              ? active()!.magnitude
              : 5,
          );
          processed++;
          await correlatedLog(
            "notification",
            "info",
            "Synthetic notification processed",
          );
        },
        {
          kind: SpanKind.CONSUMER,
          parent: ROOT_CONTEXT,
          links: [item.context],
        },
      );
    } finally {
      working = false;
    }
  }, 20);
  timer.unref();
  return {
    servers,
    close: async () => {
      clearInterval(timer);
      reset();
      await flush();
      await Promise.all(
        servers.map((s) => new Promise<void>((r) => s.close(() => r()))),
      );
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await startDemo();
  console.log("Northstar Commerce: 8 HTTP services on :4100–4107");
}
