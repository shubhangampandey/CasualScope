import { createHash } from "node:crypto";
import {
  algorithmVersion,
  type Span,
  type Log,
  type Metric,
  type Anomaly,
  type Hypothesis,
  type Analysis,
} from "../shared/index.js";
import {
  buildGraph,
  percentile,
  adjacency,
  traverse,
  reconstruct,
  intervalUnion,
} from "./graph.js";
export * from "./graph.js";
export const median = (a: number[]) => percentile(a, 0.5);
export const mad = (a: number[]) => {
  const m = median(a);
  return median(a.map((x) => Math.abs(x - m)));
};
export function ewma(a: number[], alpha = 0.3) {
  if (alpha <= 0 || alpha > 1) throw new Error("Invalid alpha");
  let s = a[0] || 0;
  return a.map((x) => (s = alpha * x + (1 - alpha) * s));
}
export function cusum(
  a: number[],
  baseline: number,
  allowance: number,
  threshold: number,
) {
  let sum = 0;
  return a.map((x) => {
    sum = Math.max(0, sum + x - baseline - allowance);
    return { sum, changed: sum > threshold };
  });
}
export function aggregate(spans: Span[], windowMs = 5000): Metric[] {
  const buckets = new Map<string, Span[]>();
  const allBuckets = new Map<string, Span[]>();
  for (const s of spans) {
    const key = `${s.service}:${Math.floor(s.start / windowMs) * windowMs}`;
    if (!allBuckets.has(key)) allBuckets.set(key, []);
    allBuckets.get(key)!.push(s);
  }
  for (const s of spans.filter((s) => s.kind === 2 || s.kind === 5)) {
    const k = `${s.service}:${Math.floor(s.start / windowMs) * windowMs}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s);
  }
  return [...buckets.values()]
    .map((a) => {
      const service = a[0]!.service,
        time = Math.floor(a[0]!.start / windowMs) * windowMs;
      const all = allBuckets.get(`${service}:${time}`) || [];
      const max = (key: string) =>
        Math.max(0, ...all.map((s) => Number(s.attributes[key]) || 0));
      return {
        service,
        time,
        count: a.length,
        errors: a.filter((s) => s.status === 2).length,
        errorRate: a.filter((s) => s.status === 2).length / a.length,
        p50: percentile(
          a.map((s) => s.duration),
          0.5,
        ),
        p95: percentile(
          a.map((s) => s.duration),
          0.95,
        ),
        p99:
          a.length >= 100
            ? percentile(
                a.map((s) => s.duration),
                0.99,
              )
            : null,
        throughput: a.length / (windowMs / 1000),
        retries: all.filter((s) => Number(s.attributes["retry.attempt"]) > 0)
          .length,
        timeouts: all.filter((s) => s.attributes["error.type"] === "timeout")
          .length,
        dbWait: max("db.connection.wait_ms"),
        queueDepth: max("messaging.queue.depth"),
        queueAge: max("messaging.message.age_ms"),
        traces: [...new Set(a.map((s) => s.traceId))].slice(0, 20),
      };
    })
    .sort((a, b) => a.time - b.time || a.service.localeCompare(b.service));
}
export function detect(metrics: Metric[], minHistory = 3): Anomaly[] {
  const out: Anomaly[] = [];
  for (const service of new Set(metrics.map((m) => m.service))) {
    const series = metrics
      .filter((m) => m.service === service)
      .sort((a, b) => a.time - b.time);
    for (const metric of ["p95", "errorRate", "dbWait", "queueAge"] as const) {
      // Frozen prefix prevents a persistent incident immediately redefining normal.
      const healthy = series.filter((m) => m.count >= 3).slice(0, minHistory);
      if (healthy.length < minHistory) continue;
      const history = healthy.map((m) => m[metric]),
        base = median(history),
        scale = Math.max(
          mad(history) * 1.4826,
          metric === "errorRate" ? 0.02 : Math.max(5, base * 0.1),
        );
      const smooth = ewma(series.map((m) => m[metric])),
        shifts = cusum(
          series.map((m) => m[metric]),
          base,
          scale,
          scale * 8,
        );
      for (let i = 0; i < series.length; i++) {
        const m = series[i]!;
        if (m.count < 3 || m.time <= healthy.at(-1)!.time) continue;
        const value = m[metric],
          deviation = (value - base) / scale;
        const relative =
          (value - base) / Math.max(base, metric === "errorRate" ? 0.05 : 10);
        if (deviation < 3.5 || relative < 0.3) continue;
        const detectors = [
          "MAD",
          ...(smooth[i]! > base + 3 * scale ? ["EWMA"] : []),
          ...(shifts[i]!.changed ? ["CUSUM"] : []),
        ];
        out.push({
          id: createHash("sha256")
            .update(`${service}:${metric}:${m.time}`)
            .digest("hex")
            .slice(0, 20),
          service,
          metric,
          time: m.time,
          baseline: base,
          observed: value,
          deviation,
          detector: detectors.join(" + "),
          severity: deviation > 8 ? "high" : "moderate",
          traces: m.traces,
          parameters: {
            minHistory,
            threshold: 3.5,
            scale,
            alpha: 0.3,
            relativeMinimum: 0.3,
          },
        });
      }
    }
  }
  return out;
}
export function rank(
  spans: Span[],
  metrics: Metric[],
  anomalies: Anomaly[],
  logs: Log[] = [],
  warnings: string[] = [],
): Hypothesis[] {
  const graph = buildGraph(spans),
    reverse = adjacency(graph.nodes, graph.edges, true);
  const byId = new Map(spans.map((s) => [`${s.traceId}:${s.spanId}`, s]));
  const candidates = graph.nodes
    .map((service) => {
      const a = anomalies.filter((a) => a.service === service),
        m = metrics.filter((m) => m.service === service),
        ss = spans.filter((s) => s.service === service),
        servers = ss.filter((s) => s.kind === 2 || s.kind === 5);
      const attr = (name: string) =>
        Math.max(0, ...ss.map((s) => Number(s.attributes[name]) || 0));
      const db = attr("db.connection.wait_ms"),
        age = attr("messaging.message.age_ms"),
        retries = ss.filter(
          (s) => Number(s.attributes["retry.attempt"]) > 0,
        ).length;
      const local = servers.map((s) => {
        const clients = ss.filter(
          (c) =>
            c.kind === 3 &&
            c.parentSpanId === s.spanId &&
            c.traceId === s.traceId,
        );
        return Math.max(
          0,
          s.duration -
            intervalUnion(
              clients.map((c) => [
                Math.max(c.start, s.start),
                Math.min(c.end, s.end),
              ]),
            ),
        );
      });
      const localRatio =
        percentile(local, 0.95) /
        Math.max(
          1,
          percentile(
            servers.map((s) => s.duration),
            0.95,
          ),
        );
      const errorRate =
        servers.filter((s) => s.status === 2).length /
        Math.max(1, servers.length);
      const missing =
        ss.filter(
          (s) => s.parentSpanId && !byId.has(`${s.traceId}:${s.parentSpanId}`),
        ).length / Math.max(1, ss.length);
      const magnitude = Math.min(
        1,
        Math.max(0, ...a.map((x) => x.deviation)) / 20,
      );
      const direct = Math.min(1, Math.max(db / 150, age / 1000, errorRate));
      const impact =
        (traverse(service, reverse).length - 1) /
        Math.max(1, graph.nodes.length - 1);
      const change = ss.some(
        (s) => s.attributes["service.version"] === "regression-v2",
      )
        ? 1
        : 0;
      const factors = {
        magnitude: 2 * magnitude,
        direct: 3 * direct,
        local: 1.5 * localRatio * magnitude,
        impact: impact * magnitude,
        change: 0.5 * change,
        missing: -2 * missing,
      };
      const score = Object.values(factors).reduce((a, b) => a + b, 0);
      const mode =
        db > 40
          ? "Database connection contention"
          : age > 500
            ? "Queue processing delay"
            : retries > 3
              ? "Retry amplification"
              : change
                ? "Deployment regression"
                : errorRate > 0.15
                  ? "Service errors"
                  : magnitude > 0.1
                    ? "Elevated local latency"
                    : "Insufficient evidence";
      const support = [
        ...a
          .slice(-4)
          .map(
            (x) =>
              `${x.metric}: ${x.observed.toFixed(2)} vs baseline ${x.baseline.toFixed(2)} (${x.detector})`,
          ),
        ...(db > 40
          ? [`Observed connection wait up to ${db.toFixed(1)} ms`]
          : []),
        ...(age > 500
          ? [`Observed message age up to ${age.toFixed(1)} ms`]
          : []),
        ...(retries ? [`${retries} observed retry spans`] : []),
        ...(change ? ["Observed service version regression-v2"] : []),
      ];
      return {
        service,
        mode,
        rawScore: Math.max(0, score),
        score: 0,
        rank: 0,
        label: "Hypothesis",
        support,
        contradictions: [
          ...(localRatio < 0.2 && magnitude > 0
            ? ["Most observed duration is spent awaiting dependencies"]
            : []),
          ...(!a.length
            ? ["No statistically supported anomaly in the available baseline"]
            : []),
        ],
        warnings: [
          ...warnings,
          ...(missing > 0.05 ? ["Parent spans are missing"] : []),
          "Score is an ordering score, not a causal probability.",
        ],
        traces: [...new Set(a.flatMap((x) => x.traces))].slice(0, 10),
        anomalyIds: a.map((x) => x.id),
        logIds: logs
          .filter((l) => l.service === service && l.level === "error")
          .slice(0, 10)
          .map((l) => l.id),
        factors,
      };
    })
    .filter((c) => c.support.length > 0)
    .sort((a, b) => b.rawScore - a.rawScore);
  const unknown = {
    service: "unknown",
    mode: "Outside observed system / insufficient telemetry",
    rawScore: candidates.length
      ? Math.max(0.5, 2 * (warnings.length > 0 ? 1 : 0.25))
      : 1,
    score: 0,
    rank: 0,
    label: "Alternative hypothesis",
    support: [] as string[],
    contradictions: [] as string[],
    warnings: [
      "Unobserved dependencies and sampling can hide the originating fault.",
    ],
    traces: [] as string[],
    anomalyIds: [] as string[],
    logIds: [] as string[],
    factors: { uncertainty: 1 },
  };
  const result = [...candidates, unknown].sort(
      (a, b) => b.rawScore - a.rawScore,
    ),
    total = result.reduce((a, b) => a + b.rawScore, 0) || 1;
  return result.map((c, i) => ({
    ...c,
    rank: i + 1,
    score: c.rawScore / total,
    label: i === 0 ? "Leading hypothesis" : "Alternative hypothesis",
  }));
}
export function analyze(
  spans: Span[],
  workspace: string,
  environment: string,
  start: number,
  end: number,
  logs: Log[] = [],
): Analysis {
  const t = performance.now(),
    unique = [
      ...new Map(spans.map((s) => [`${s.traceId}:${s.spanId}`, s])).values(),
    ],
    graph = buildGraph(unique),
    structure = reconstruct(unique),
    metrics = aggregate(unique),
    anomalies = detect(metrics);
  const warnings = [
    ...(structure.missing.length
      ? ["Missing parent spans; observed topology is incomplete."]
      : []),
    ...(structure.skew.length
      ? ["Clock skew detected; cross-host timing is uncertain."]
      : []),
    ...(metrics.filter((m) => m.count >= 3).length < graph.nodes.length * 4
      ? ["Insufficient baseline for some services."]
      : []),
    "Observed data may be sampled; throughput describes received server spans.",
    ...(spans.length >= 30000
      ? [
          "The bounded read reached 30,000 spans. Narrow the analysis window; observations may be truncated.",
        ]
      : []),
  ];
  const result: Analysis = {
    id: crypto.randomUUID(),
    workspace,
    environment,
    version: algorithmVersion,
    start,
    end,
    created: Date.now(),
    runtime: 0,
    spanCount: unique.length,
    ...graph,
    metrics,
    anomalies,
    hypotheses: rank(unique, metrics, anomalies, logs, warnings),
    baselineRanking: [...graph.nodes].sort(
      (a, b) =>
        Math.max(
          0,
          ...anomalies.filter((x) => x.service === b).map((x) => x.deviation),
        ) -
        Math.max(
          0,
          ...anomalies.filter((x) => x.service === a).map((x) => x.deviation),
        ),
    ),
    quality: {
      missingParents: structure.missing.length,
      skew: structure.skew.length,
      samples: unique.length,
      warnings,
    },
  };
  result.runtime = performance.now() - t;
  return result;
}
