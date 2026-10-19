import type { Span } from "../packages/shared/index.js";
import { scope } from "../packages/shared/index.js";
// Algorithm-only synthetic observations, never installed in the application database.
export function span(overrides: Partial<Span> = {}): Span {
  return {
    ...scope,
    traceId: "a".repeat(32),
    spanId: "1".repeat(16),
    parentSpanId: "",
    service: "gateway",
    name: "GET /checkout",
    kind: 2,
    start: Date.now() - 1000,
    end: Date.now() - 990,
    startNs: "1",
    endNs: "2",
    duration: 10,
    status: 0,
    attributes: {},
    resource: {},
    events: [],
    links: [],
    ingested: Date.now(),
    ...overrides,
  };
}
