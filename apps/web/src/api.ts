import type {
  Analysis,
  Incident,
  Experiment,
  Evaluation,
  Span,
  Log,
  Metric,
} from "../../../packages/shared/index.js";
export type { Analysis, Incident, Experiment, Evaluation, Span, Log, Metric };
let csrf = "";
export function setCSRF(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const r = await fetch(`/api/v1/${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data as T;
}
export const number = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
export const clock = (n: number) =>
  new Date(n).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
export const ms = (n: number) =>
  n >= 1000 ? `${number(n / 1000, 2)} s` : `${number(n, 1)} ms`;
export type TraceRow = {
  traceId: string;
  start: number;
  duration: number;
  spans: number;
  services: string[];
  errors: number;
  operation: string;
};
