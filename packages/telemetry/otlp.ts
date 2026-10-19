import protobuf from "protobufjs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Span } from "../shared/index.js";
const root = new protobuf.Root();
root.resolvePath = (_origin, target) =>
  target.startsWith("opentelemetry/")
    ? resolve("infrastructure/proto", target)
    : resolve(target);
root.loadSync(
  resolve(
    "infrastructure/proto/opentelemetry/proto/collector/trace/v1/trace_service.proto",
  ),
);
const request = root.lookupType(
  "opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest",
);
const response = root.lookupType(
  "opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse",
);
type Obj = Record<string, any>;
const primitive = z.union([
  z.string().max(2048),
  z.number().finite(),
  z.boolean(),
]);
const sensitive =
  /password|authorization|cookie|secret|token|credential|credit.card|session/i;
function attrs(entries: Obj[] = []) {
  const out: Record<string, string | number | boolean> = Object.create(null);
  for (const e of entries.slice(0, 64)) {
    if (
      typeof e.key !== "string" ||
      e.key.length > 128 ||
      sensitive.test(e.key) ||
      /^fault\.|^experiment\.target|^ground.truth/.test(e.key)
    )
      continue;
    const v = e.value || {};
    const raw = v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
    if (raw !== undefined) {
      const value = primitive.safeParse(
        typeof raw === "object" ? raw.toString() : raw,
      );
      if (value.success) out[e.key] = value.data;
    }
  }
  return out;
}
const id = (s: unknown) =>
  Buffer.isBuffer(s)
    ? s.toString("hex")
    : typeof s === "string"
      ? Buffer.from(s, "base64").toString("hex")
      : "";
const ns = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};
export function decodeOTLP(
  body: Buffer,
  workspace: string,
  environment: string,
) {
  const decoded = request.toObject(request.decode(body), {
    longs: String,
    bytes: Buffer,
    defaults: false,
  }) as Obj;
  const spans: Span[] = [];
  let rejected = 0,
    total = 0;
  for (const resource of decoded.resourceSpans || []) {
    const resourceAttrs = attrs(resource.resource?.attributes);
    for (const scope of resource.scopeSpans || []) {
      for (const s of scope.spans || []) {
        if (++total > 2000) throw new Error("Batch exceeds 2000 spans");
        const traceId = id(s.traceId),
          spanId = id(s.spanId),
          parentSpanId = id(s.parentSpanId),
          startNs = ns(s.startTimeUnixNano),
          endNs = ns(s.endTimeUnixNano),
          service = String(resourceAttrs["service.name"] || "unknown");
        const start = Number(startNs) / 1e6,
          end = Number(endNs) / 1e6;
        if (
          !/^[a-f0-9]{32}$/.test(traceId) ||
          /^0+$/.test(traceId) ||
          !/^[a-f0-9]{16}$/.test(spanId) ||
          /^0+$/.test(spanId) ||
          (parentSpanId && !/^[a-f0-9]{16}$/.test(parentSpanId)) ||
          endNs < startNs ||
          Math.abs(Date.now() - start) > 7 * 86400000 ||
          end - start > 3600000 ||
          !s.name ||
          s.name.length > 256 ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(service)
        ) {
          rejected++;
          continue;
        }
        spans.push({
          workspace,
          environment,
          traceId,
          spanId,
          parentSpanId,
          service,
          name: s.name,
          kind: s.kind || 0,
          start,
          end,
          startNs: String(startNs),
          endNs: String(endNs),
          duration: Number(endNs - startNs) / 1e6,
          status: s.status?.code || 0,
          attributes: attrs(s.attributes),
          resource: resourceAttrs,
          events: (s.events || []).slice(0, 32).map((e: Obj) => ({
            name: String(e.name).slice(0, 256),
            time: Number(ns(e.timeUnixNano)) / 1e6,
            attributes: attrs(e.attributes),
          })),
          links: (s.links || []).slice(0, 32).map((l: Obj) => ({
            traceId: id(l.traceId),
            spanId: id(l.spanId),
            attributes: attrs(l.attributes),
          })),
          ingested: Date.now(),
        });
      }
    }
  }
  return { spans, rejected };
}
export function encodeResponse(rejected = 0) {
  return Buffer.from(
    response
      .encode(
        response.create(
          rejected
            ? {
                partialSuccess: {
                  rejectedSpans: rejected,
                  errorMessage: "Invalid spans rejected",
                },
              }
            : {},
        ),
      )
      .finish(),
  );
}
