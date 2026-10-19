import { Store } from "../../packages/storage/index.js";
import { analyze } from "../../packages/analysis/index.js";
import type { Analysis, Incident } from "../../packages/shared/index.js";
import { createHash } from "node:crypto";
export async function runAnalysis(
  store: Store,
  workspace: string,
  environment: string,
  start = Date.now() - 300000,
  end = Date.now(),
  reuseUnchanged = false,
) {
  const [spans, logs] = await Promise.all([
    store.spans({ workspace, environment, start, end }),
    store.logs({ workspace, environment, start, end }),
  ]);
  const fingerprint = createHash("sha256")
    .update(
      spans
        .map((s) => `${s.traceId}:${s.spanId}`)
        .sort()
        .join("|") + logs.length,
    )
    .digest("hex");
  const pointer = await store.get<{ analysisId: string }>(
      workspace,
      "latest",
      `analysis:${environment}`,
    ),
    previous = pointer
      ? await store.get<Analysis>(workspace, "analysis", pointer.analysisId)
      : undefined;
  if (reuseUnchanged && previous?.inputHash === fingerprint) return previous;
  const analysis = analyze(spans, workspace, environment, start, end, logs);
  analysis.inputHash = fingerprint;
  await store.put(workspace, "analysis", analysis);
  await store.put(workspace, "latest", {
    id: `analysis:${environment}`,
    analysisId: analysis.id,
  });
  const recent = analysis.anomalies.filter((a) => a.time > end - 20000);
  if (recent.length) {
    const existing = (await store.list<Incident>(workspace, "incident")).find(
      (i) =>
        i.environment === environment &&
        i.status !== "resolved" &&
        end - i.start < 120000 &&
        i.services.some((s) => recent.some((a) => a.service === s)),
    );
    if (existing) {
      existing.analysisId = analysis.id;
      existing.services = [
        ...new Set([...existing.services, ...recent.map((a) => a.service)]),
      ];
      await store.put(workspace, "incident", existing);
    }
    if (!existing) {
      const top = analysis.hypotheses[0],
        incident: Incident = {
          id: crypto.randomUUID(),
          workspace,
          environment,
          name: `${top?.service || "Service"} degradation observed`,
          description:
            "Automatically grouped anomalies connected by observed service dependencies. Investigate supporting observations.",
          status: "detected",
          severity: recent.some((a) => a.severity === "high")
            ? "high"
            : "moderate",
          start: Math.min(...recent.map((a) => a.time)),
          analysisId: analysis.id,
          services: [...new Set(recent.map((a) => a.service))],
          notes: [],
          timeline: [
            {
              at: Date.now(),
              type: "detection",
              text: `${recent.length} metric anomalies detected; ranking remains a hypothesis.`,
            },
          ],
        };
      await store.put(workspace, "incident", incident);
    }
  }
  return analysis;
}
