import type { Span, Edge } from "../shared/index.js";
export function buildGraph(spans: Span[]) {
  const byId = new Map(spans.map((s) => [`${s.traceId}:${s.spanId}`, s]));
  const accum = new Map<
    string,
    { source: string; target: string; spans: Span[] }
  >();
  for (const s of spans) {
    const p = byId.get(`${s.traceId}:${s.parentSpanId}`);
    if (s.kind !== 2 || !p || p.kind !== 3 || p.service === s.service) continue;
    const key = `${p.service}\0${s.service}`;
    if (!accum.has(key))
      accum.set(key, { source: p.service, target: s.service, spans: [] });
    accum.get(key)!.spans.push(s);
  }
  const edges: Edge[] = [...accum.values()].map((v) => ({
    source: v.source,
    target: v.target,
    calls: v.spans.length,
    errors: v.spans.filter((s) => s.status === 2).length,
    p95: percentile(
      v.spans.map((s) => s.duration),
      0.95,
    ),
    traces: [...new Set(v.spans.map((s) => s.traceId))].slice(0, 20),
    lastSeen: Math.max(...v.spans.map((s) => s.start)),
    windows: [
      ...new Set(v.spans.map((s) => Math.floor(s.start / 5000) * 5000)),
    ].map((time) => {
      const observed = v.spans.filter(
        (s) => Math.floor(s.start / 5000) * 5000 === time,
      );
      return {
        time,
        calls: observed.length,
        errors: observed.filter((s) => s.status === 2).length,
        p95: percentile(
          observed.map((s) => s.duration),
          0.95,
        ),
        traces: [...new Set(observed.map((s) => s.traceId))].slice(0, 20),
      };
    }),
    type: "observed",
  }));
  return { nodes: [...new Set(spans.map((s) => s.service))].sort(), edges };
}
export function percentile(values: number[], q: number) {
  if (!values.length) return 0;
  const a = [...values].sort((a, b) => a - b);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  return a[lo]! + (a[Math.ceil(i)]! - a[lo]!) * (i - lo);
}
export function adjacency(
  nodes: string[],
  edges: Pick<Edge, "source" | "target">[],
  reverse = false,
) {
  const m = new Map(nodes.map((n) => [n, [] as string[]]));
  for (const e of edges) {
    const a = reverse ? e.target : e.source,
      b = reverse ? e.source : e.target;
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push(b);
  }
  return m;
}
export function traverse(
  start: string,
  g: Map<string, string[]>,
  mode: "bfs" | "dfs" = "bfs",
) {
  const seen = new Set<string>(),
    pending = [start];
  while (pending.length) {
    const n = mode === "bfs" ? pending.shift()! : pending.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    pending.push(...(g.get(n) || []));
  }
  return [...seen];
}
export function components(
  nodes: string[],
  edges: Pick<Edge, "source" | "target">[],
) {
  const g = adjacency(nodes, edges),
    indices = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    on = new Set<string>(),
    result: string[][] = [];
  let i = 0;
  function visit(v: string) {
    indices.set(v, i);
    low.set(v, i++);
    stack.push(v);
    on.add(v);
    for (const w of g.get(v) || []) {
      if (!indices.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, indices.get(w)!));
    }
    if (low.get(v) === indices.get(v)) {
      const c: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        c.push(w);
      } while (w !== v);
      result.push(c);
    }
  }
  for (const n of nodes) if (!indices.has(n)) visit(n);
  const group = new Map(
    result.flatMap((c, i) => c.map((n) => [n, i] as const)),
  );
  const condensed = [
    ...new Set(
      edges
        .filter((e) => group.get(e.source) !== group.get(e.target))
        .map((e) => `${group.get(e.source)}:${group.get(e.target)}`),
    ),
  ].map((k) => {
    const [source, target] = k.split(":").map(Number);
    return { source: source!, target: target! };
  });
  const indegree = result.map(() => 0);
  for (const e of condensed) indegree[e.target]!++;
  const queue = indegree.flatMap((d, i) => (d === 0 ? [i] : [])),
    order: number[] = [];
  while (queue.length) {
    const v = queue.shift()!;
    order.push(v);
    for (const e of condensed.filter((e) => e.source === v))
      if (--indegree[e.target] === 0) queue.push(e.target);
  }
  return {
    components: result,
    edges: condensed,
    order,
    cyclic:
      result.some((c) => c.length > 1) ||
      edges.some((e) => e.source === e.target),
  };
}
export function paths(
  start: string,
  end: string,
  g: Map<string, string[]>,
  maxDepth = 8,
  maxPaths = 30,
) {
  const out: string[][] = [];
  function walk(path: string[]) {
    const n = path.at(-1)!;
    if (n === end) {
      out.push(path);
      return;
    }
    if (path.length >= maxDepth || out.length >= maxPaths) return;
    for (const next of g.get(n) || [])
      if (!path.includes(next)) walk([...path, next]);
  }
  walk([start]);
  return out;
}
export function compareGraphs(
  a: Pick<Edge, "source" | "target">[],
  b: Pick<Edge, "source" | "target">[],
) {
  const key = (e: Pick<Edge, "source" | "target">) =>
      `${e.source} → ${e.target}`,
    x = new Set(a.map(key)),
    y = new Set(b.map(key));
  return {
    added: [...y].filter((k) => !x.has(k)),
    removed: [...x].filter((k) => !y.has(k)),
  };
}
export function intervalUnion(intervals: [number, number][]) {
  let total = 0,
    end = -Infinity;
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    if (b > a) {
      total += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
  }
  return total;
}
export function reconstruct(spans: Span[]) {
  const ids = new Map(spans.map((s) => [`${s.traceId}:${s.spanId}`, s]));
  const constraints: { before: string; after: string; reason: string }[] = [],
    associations: { source: string; target: string; type: string }[] = [],
    missing: string[] = [],
    skew: string[] = [];
  for (const s of spans) {
    const id = `${s.traceId}:${s.spanId}`;
    constraints.push({
      before: `${id}:start`,
      after: `${id}:end`,
      reason: "local execution",
    });
    const p = ids.get(`${s.traceId}:${s.parentSpanId}`);
    if (s.parentSpanId && !p) missing.push(s.spanId);
    if (p) {
      constraints.push({
        before: `${p.traceId}:${p.spanId}:start`,
        after: `${id}:start`,
        reason: "propagated parent context",
      });
      if (s.start < p.start - 5) skew.push(s.spanId);
    }
    for (const l of s.links) {
      const linked = ids.get(`${l.traceId}:${l.spanId}`);
      associations.push({
        source: `${l.traceId}:${l.spanId}`,
        target: id,
        type: linked ? "span link (association)" : "span link (source missing)",
      });
    }
  }
  const children = new Map<string, Span[]>();
  for (const s of spans) {
    const key = `${s.traceId}:${s.parentSpanId}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(s);
  }
  const exclusive = Object.fromEntries(
    spans.map((s) => [
      s.spanId,
      Math.max(
        0,
        s.duration -
          intervalUnion(
            (children.get(`${s.traceId}:${s.spanId}`) || [])
              .filter((c) => c.service === s.service)
              .map((c) => [Math.max(c.start, s.start), Math.min(c.end, s.end)]),
          ),
      ),
    ]),
  );
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const duration = spans.length
    ? Math.max(...spans.map((s) => s.end)) -
      Math.min(...spans.map((s) => s.start))
    : 0;
  return {
    constraints,
    associations,
    missing,
    skew,
    exclusive,
    timestampOrder: ordered.map((s) => s.spanId),
    duration,
    warning:
      "Cross-host timestamps do not establish causality. Links are associations; unordered events may be concurrent or unknown.",
  };
}
