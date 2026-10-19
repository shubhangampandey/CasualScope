import { z } from "zod";
export const services = [
  "gateway",
  "auth",
  "catalog",
  "cart",
  "inventory",
  "payment",
  "order",
  "notification",
] as const;
export type Service = (typeof services)[number];
export const faults = [
  "healthy",
  "pool-exhaustion",
  "cascading-timeout",
  "retry-storm",
  "cache-degradation",
  "partial-failure",
  "queue-backlog",
  "latency",
  "bad-deployment",
  "unavailable",
  "resource-saturation",
] as const;
export type Fault = (typeof faults)[number];
export const experimentSchema = z
  .object({
    name: z.string().min(3).max(100),
    fault: z.enum(faults),
    target: z.enum(services),
    duration: z.number().int().min(5).max(90),
    rate: z.number().int().min(1).max(20),
    seed: z.number().int().min(1).max(2147483647),
    magnitude: z.number().min(10).max(1500).default(400),
    failureRate: z.number().min(0).max(1).default(0.5),
    workload: z.enum(["mixed", "checkout", "browse"]).default("mixed"),
  })
  .strict()
  .superRefine((v, ctx) => {
    const required: Partial<Record<Fault, Service>> = {
      "pool-exhaustion": "inventory",
      "queue-backlog": "notification",
      "retry-storm": "payment",
      "cache-degradation": "catalog",
    };
    if (required[v.fault] && v.target !== required[v.fault])
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: `${v.fault} requires ${required[v.fault]}`,
      });
    if (v.fault === "cascading-timeout" && v.magnitude < 1000)
      ctx.addIssue({
        code: "custom",
        path: ["magnitude"],
        message: "Use at least 1000 ms to exceed the 900 ms client deadline",
      });
  });
export type ExperimentConfig = z.infer<typeof experimentSchema>;
export interface Span {
  workspace: string;
  environment: string;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  service: string;
  name: string;
  kind: number;
  start: number;
  end: number;
  startNs: string;
  endNs: string;
  duration: number;
  status: number;
  attributes: Record<string, string | number | boolean>;
  resource: Record<string, string | number | boolean>;
  events: {
    name: string;
    time: number;
    attributes: Record<string, string | number | boolean>;
  }[];
  links: {
    traceId: string;
    spanId: string;
    attributes?: Record<string, string | number | boolean>;
  }[];
  ingested: number;
}
export interface Log {
  id: string;
  workspace: string;
  environment: string;
  traceId: string;
  spanId: string;
  service: string;
  time: number;
  level: string;
  message: string;
}
export interface Edge {
  source: string;
  target: string;
  calls: number;
  errors: number;
  p95: number;
  traces: string[];
  lastSeen: number;
  windows?: {
    time: number;
    calls: number;
    errors: number;
    p95: number;
    traces: string[];
  }[];
  type: "observed";
}
export interface Metric {
  service: string;
  time: number;
  count: number;
  errors: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number | null;
  throughput: number;
  retries: number;
  timeouts: number;
  dbWait: number;
  queueDepth: number;
  queueAge: number;
  traces: string[];
}
export interface Anomaly {
  id: string;
  service: string;
  metric: string;
  time: number;
  baseline: number;
  observed: number;
  deviation: number;
  detector: string;
  severity: "moderate" | "high";
  traces: string[];
  parameters: Record<string, number>;
}
export interface Hypothesis {
  service: string;
  mode: string;
  rank: number;
  score: number;
  rawScore: number;
  label: string;
  support: string[];
  contradictions: string[];
  warnings: string[];
  traces: string[];
  anomalyIds: string[];
  logIds: string[];
  factors: Record<string, number>;
}
export interface Analysis {
  id: string;
  workspace: string;
  environment: string;
  version: string;
  start: number;
  end: number;
  created: number;
  runtime: number;
  inputHash?: string;
  sourceRuns?: { id: string; start: number; end: number }[];
  spanCount: number;
  nodes: string[];
  edges: Edge[];
  metrics: Metric[];
  anomalies: Anomaly[];
  hypotheses: Hypothesis[];
  baselineRanking: string[];
  quality: {
    missingParents: number;
    skew: number;
    samples: number;
    warnings: string[];
  };
}
export const states = [
  "detected",
  "investigating",
  "mitigating",
  "monitoring",
  "resolved",
] as const;
export type IncidentState = (typeof states)[number];
export interface Incident {
  id: string;
  workspace: string;
  environment: string;
  name: string;
  description: string;
  status: IncidentState;
  severity: string;
  start: number;
  end?: number;
  analysisId: string;
  services: string[];
  notes: { text: string; at: number; author: string }[];
  timeline: { at: number; type: string; text: string }[];
  resolution?: string;
  experimentId?: string;
}
export interface Experiment {
  id: string;
  workspace: string;
  environment: string;
  config: ExperimentConfig;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  start: number;
  end?: number;
  completedRequests: number;
  failedRequests: number;
  droppedRequests: number;
  analysisId?: string;
  error?: string;
  comparisonId?: string;
}
export interface Evaluation {
  id: string;
  environment: string;
  experimentId: string;
  version: string;
  created: number;
  top1: boolean;
  top3: boolean;
  rr: number;
  baselineTop1: boolean;
  predicted: string[];
  truth: string;
  runtime: number;
  dataset: "live-experiment";
}
export const algorithmVersion = "evidence-graph/1.0.0";
export const scope = { workspace: "northstar", environment: "commerce" };
