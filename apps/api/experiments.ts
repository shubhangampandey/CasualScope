import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
import {
  scope,
  type Experiment,
  type ExperimentConfig,
  type Evaluation,
} from "../../packages/shared/index.js";
import { analyze } from "../../packages/analysis/index.js";
import { delay } from "../demo-system/pool.js";
const controlURL = () => `http://${config.DEMO_HOST}:4100`;
export class Experiments {
  current?: { id: string; cancelled: boolean };
  constructor(private store: Store) {}
  async recover() {
    for (const run of await this.store.list<Experiment>(
      scope.workspace,
      "experiment",
    ))
      if (run.status === "running") {
        run.status = "interrupted";
        run.end = Date.now();
        run.error = "Controller restarted; demo faults expire independently.";
        await this.store.put(scope.workspace, "experiment", run);
      }
    await this.control({ action: "reset" }).catch(() => {});
  }
  private async control(body: unknown) {
    const r = await fetch(`${controlURL()}/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-control": config.CONTROL_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Synthetic service controller unavailable");
  }
  async start(
    workspace: string,
    environment: string,
    c: ExperimentConfig,
    comparisonId?: string,
  ) {
    if (
      config.FAULT_LAB_ENABLED !== "true" ||
      workspace !== scope.workspace ||
      environment !== scope.environment
    )
      throw new Error("Fault lab is limited to Northstar synthetic targets");
    if (this.current) throw new Error("A bounded workload is already running");
    if (config.PUBLIC_DEMO === "true" && (c.rate > 5 || c.duration > 30))
      throw new Error("Public demo limit: 5 req/s, 30 seconds");
    const run: Experiment = {
      id: crypto.randomUUID(),
      workspace,
      environment,
      config: c,
      status: "running",
      start: Date.now(),
      completedRequests: 0,
      failedRequests: 0,
      droppedRequests: 0,
      comparisonId,
    };
    this.current = { id: run.id, cancelled: false };
    try {
      await this.control(c);
      await this.store.put(workspace, "experiment", run);
      await this.store.truth(workspace, run.id, {
        target: c.target,
        fault: c.fault,
        seed: c.seed,
      });
    } catch (error) {
      this.current = undefined;
      await this.control({ action: "reset" }).catch(() => {});
      throw error;
    }
    void this.execute(run).catch((e) =>
      console.error("Experiment finalize failed", e),
    );
    return run;
  }
  async stop(id: string) {
    if (this.current?.id === id) this.current.cancelled = true;
    await this.control({ action: "reset" });
  }
  private async execute(run: Experiment) {
    const c = run.config;
    let rng = c.seed;
    const random = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    const inFlight = new Set<Promise<void>>();
    let lastPersist = 0;
    try {
      const deadline = run.start + c.duration * 1000;
      while (Date.now() < deadline && !this.current?.cancelled) {
        if (inFlight.size < 20) {
          const r = random(),
            path =
              c.workload === "checkout"
                ? "/checkout"
                : c.workload === "browse"
                  ? "/browse"
                  : r < 0.6
                    ? "/checkout"
                    : r < 0.85
                      ? "/browse"
                      : "/cart";
          const work = fetch(`${controlURL()}${path}`, {
            method: path === "/browse" ? "GET" : "POST",
            headers: { "x-internal-control": config.CONTROL_TOKEN },
            signal: AbortSignal.timeout(3500),
          })
            .then(async (r) => {
              await r.arrayBuffer();
              run.completedRequests++;
              if (!r.ok) run.failedRequests++;
            })
            .catch(() => {
              run.completedRequests++;
              run.failedRequests++;
            })
            .finally(() => inFlight.delete(work));
          inFlight.add(work);
        } else run.droppedRequests++;
        if (Date.now() - lastPersist > 1000) {
          await this.store.put(run.workspace, "experiment", run);
          lastPersist = Date.now();
        }
        await delay(1000 / c.rate);
      }
      await Promise.all(inFlight);
      run.status = this.current?.cancelled ? "cancelled" : "completed";
    } catch (e) {
      run.status = "failed";
      run.error = e instanceof Error ? e.message : "Experiment failed";
    } finally {
      await this.control({ action: "reset" }).catch(() => {
        run.error =
          "Reset request failed; independent service expiry still applies.";
      });
      await this.control({ action: "flush" }).catch(() => {});
      run.end = Date.now();
      // Collector acceptance is not persistence acknowledgement. Wait for the
      // single-controller workload's gateway observations, with a finite budget.
      const exportDeadline = Date.now() + 10000;
      let captured = 0;
      do {
        await delay(300);
        try {
          captured = (
            await this.store.spans({
              workspace: run.workspace,
              environment: run.environment,
              start: run.start,
              end: run.end,
              service: "gateway",
            })
          ).filter((s) => s.kind === 2).length;
        } catch {
          /* Retry a transient storage failure within the bounded finalization window. */
        }
      } while (captured < run.completedRequests && Date.now() < exportDeadline);
      if (captured < run.completedRequests)
        run.error = `Telemetry incomplete at finalization: ${captured}/${run.completedRequests} gateway observations. Late data may still arrive.`;
      try {
        // Select a completed healthy workload, never a preceding fault interval.
        // Only its persisted observations enter the inference function.
        const baseline =
          c.fault === "healthy"
            ? undefined
            : (
                await this.store.list<Experiment>(run.workspace, "experiment")
              ).find(
                (e) =>
                  e.environment === run.environment &&
                  e.status === "completed" &&
                  e.config.fault === "healthy" &&
                  e.config.seed === c.seed &&
                  e.config.workload === c.workload &&
                  e.config.rate === c.rate &&
                  e.end &&
                  run.start - e.end < 3600000 &&
                  (!run.comparisonId || e.comparisonId === run.comparisonId),
              );
        const sourceRuns = [
          ...(baseline && baseline.end
            ? [{ id: baseline.id, start: baseline.start, end: baseline.end }]
            : []),
          { id: run.id, start: run.start, end: run.end },
        ];
        const observations = await Promise.all(
          sourceRuns.map((r) =>
            this.store.spans({
              workspace: run.workspace,
              environment: run.environment,
              start: r.start,
              end: r.end,
            }),
          ),
        );
        const logs = (
          await Promise.all(
            sourceRuns.map((r) =>
              this.store.logs({
                workspace: run.workspace,
                environment: run.environment,
                start: r.start,
                end: r.end,
              }),
            ),
          )
        ).flat();
        const analysis = analyze(
          observations.flat(),
          run.workspace,
          run.environment,
          sourceRuns[0]!.start,
          run.end,
          logs,
        );
        analysis.sourceRuns = sourceRuns;
        if (!baseline && c.fault !== "healthy")
          analysis.quality.warnings.push(
            "No matching healthy workload. Initial windows may already contain a fault.",
          );
        await this.store.put(run.workspace, "analysis", analysis);
        run.analysisId = analysis.id;
        await this.store.put(run.workspace, "experiment", run);
        // Predictions are persisted before the evaluator can read isolated labels.
        if (c.fault !== "healthy" && run.status === "completed") {
          const truth = await this.store.truth(run.workspace, run.id);
          if (truth) {
            const predicted = analysis.hypotheses.map((h) => h.service),
              rank = predicted.indexOf(truth.target) + 1;
            const result: Evaluation = {
              id: crypto.randomUUID(),
              environment: run.environment,
              experimentId: run.id,
              version: analysis.version,
              created: Date.now(),
              top1: rank === 1,
              top3: rank > 0 && rank <= 3,
              rr: rank > 0 ? 1 / rank : 0,
              baselineTop1: analysis.baselineRanking[0] === truth.target,
              predicted,
              truth: truth.target,
              runtime: analysis.runtime,
              dataset: "live-experiment",
            };
            await this.store.put(run.workspace, "evaluation", result);
          }
        }
      } catch (e) {
        run.error = `Analysis unavailable: ${e instanceof Error ? e.message : "error"}`;
        await this.store.put(run.workspace, "experiment", run);
      } finally {
        this.current = undefined;
      }
    }
  }
  async compare(workspace: string, environment: string, c: ExperimentConfig) {
    const id = crypto.randomUUID();
    const baseline = await this.start(
      workspace,
      environment,
      { ...c, name: `${c.name} / baseline`, fault: "healthy" },
      id,
    );
    const record = {
      id,
      workspace,
      environment,
      status: "running",
      baselineId: baseline.id,
      faultId: "",
    };
    await this.store.put(workspace, "comparison", record);
    void (async () => {
      try {
        while (this.current?.id === baseline.id) await delay(500);
        const base = await this.store.get<Experiment>(
          workspace,
          "experiment",
          baseline.id,
        );
        if (base?.status !== "completed")
          throw new Error("Baseline was not completed");
        const fault = await this.start(workspace, environment, c, id);
        record.faultId = fault.id;
        await this.store.put(workspace, "comparison", record);
        while (this.current?.id === fault.id) await delay(500);
        record.status = "completed";
      } catch {
        record.status = "failed";
      }
      await this.store.put(workspace, "comparison", record);
    })();
    return record;
  }
}
