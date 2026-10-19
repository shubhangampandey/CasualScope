import {
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
  type Context,
  type SpanContext,
  type Attributes,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { config } from "../shared/config.js";
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
export const propagator = new W3CTraceContextPropagator();
const providers = new Map<string, BasicTracerProvider>();
export function tracer(service: string) {
  if (!providers.has(service)) {
    const url =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      `http://127.0.0.1:${config.INGEST_PORT}`;
    const exporter = new OTLPTraceExporter({
      url: `${url}/v1/traces`,
      headers: { Authorization: `Bearer ${config.INGEST_TOKEN}` },
      timeoutMillis: 5000,
    });
    providers.set(
      service,
      new BasicTracerProvider({
        resource: resourceFromAttributes({
          "service.name": service,
          "service.namespace": "northstar-commerce",
          "deployment.environment.name": "synthetic",
        }),
        spanProcessors: [
          new BatchSpanProcessor(exporter, {
            maxQueueSize: 4096,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 500,
            exportTimeoutMillis: 6000,
          }),
        ],
      }),
    );
  }
  return providers.get(service)!.getTracer("causalscope.manual-http", "1.0.0");
}
export async function instrument<T>(
  service: string,
  name: string,
  fn: () => Promise<T>,
  opts: {
    kind?: SpanKind;
    attributes?: Attributes;
    parent?: Context;
    links?: SpanContext[];
  } = {},
) {
  return tracer(service).startActiveSpan(
    name,
    {
      kind: opts.kind || SpanKind.INTERNAL,
      attributes: opts.attributes,
      links: opts.links?.map((context) => ({ context })),
    },
    opts.parent || context.active(),
    async (span) => {
      try {
        return await fn();
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e instanceof Error ? e.message : "Request failed",
        });
        span.setAttribute(
          "error.type",
          e instanceof Error && /timeout|abort/i.test(e.message)
            ? "timeout"
            : "dependency_error",
        );
        span.recordException(
          e instanceof Error ? e : new Error("Request failed"),
        );
        await correlatedLog(
          service,
          "error",
          e instanceof Error ? e.message : "Request failed",
        );
        throw e;
      } finally {
        span.end();
      }
    },
  );
}
export function extract(headers: Record<string, unknown>) {
  return propagator.extract(ROOT_CONTEXT, headers, {
    keys: (c) => Object.keys(c),
    get: (c, k) => c[k] as string | undefined,
  });
}
export function headers() {
  const carrier: Record<string, string> = {};
  propagator.inject(context.active(), carrier, {
    set: (c, k, v) => (c[k] = v),
  });
  return carrier;
}
export async function correlatedLog(
  service: string,
  level: "info" | "warn" | "error",
  message: string,
) {
  const sc = trace.getSpan(context.active())?.spanContext();
  if (!sc) return;
  try {
    await fetch(
      `http://${process.env.INGEST_HOST || "127.0.0.1"}:${config.INGEST_PORT}/internal/logs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.INGEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          [{ service, level, message, ...sc, time: Date.now() }].map(
            ({ traceFlags, traceState, isRemote, ...l }) => l,
          ),
        ),
        signal: AbortSignal.timeout(1000),
      },
    );
  } catch {
    /* best effort logs; spans carry exceptions independently */
  }
}
export async function flush() {
  await Promise.all([...providers.values()].map((p) => p.forceFlush()));
}
export { context, trace, SpanKind, ROOT_CONTEXT };
