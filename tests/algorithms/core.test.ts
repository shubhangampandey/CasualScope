import { describe, it, expect } from "vitest";
import {
  buildGraph,
  components,
  adjacency,
  traverse,
  paths,
  compareGraphs,
  reconstruct,
  intervalUnion,
  median,
  mad,
  ewma,
  cusum,
  detect,
  aggregate,
  rank,
  analyze,
} from "../../packages/analysis/index.js";
import { span } from "../fixtures.js";
describe("structural graph algorithms", () => {
  it("creates only observed client → server cross-service edges", () => {
    const s = [
      span({ spanId: "1".repeat(16), kind: 2 }),
      span({ spanId: "2".repeat(16), parentSpanId: "1".repeat(16), kind: 3 }),
      span({
        service: "inventory",
        spanId: "3".repeat(16),
        parentSpanId: "2".repeat(16),
        kind: 2,
      }),
      span({
        service: "fake",
        spanId: "4".repeat(16),
        kind: 1,
        parentSpanId: "1".repeat(16),
      }),
    ];
    expect(buildGraph(s).edges.map((e) => [e.source, e.target])).toEqual([
      ["gateway", "inventory"],
    ]);
  });
  it("handles cycles through SCC condensation and preserves a DAG order", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
      { source: "b", target: "c" },
    ];
    const result = components(["a", "b", "c"], edges);
    expect(result.cyclic).toBe(true);
    expect(
      result.components.some((c) => c.includes("a") && c.includes("b")),
    ).toBe(true);
    for (const e of result.edges)
      expect(result.order.indexOf(e.source)).toBeLessThan(
        result.order.indexOf(e.target),
      );
    expect(traverse("a", adjacency(["a", "b", "c"], edges))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      traverse("a", adjacency(["a", "b", "c"], edges), "dfs"),
    ).toHaveLength(3);
    expect(paths("a", "c", adjacency(["a", "b", "c"], edges))).toEqual([
      ["a", "b", "c"],
    ]);
    expect(compareGraphs([], edges).added).toHaveLength(3);
  });
  it("preserves structural ordering despite clock skew without ordering unrelated or linked spans", () => {
    const s = [
      span({ start: 100, end: 200 }),
      span({
        spanId: "2".repeat(16),
        parentSpanId: "1".repeat(16),
        service: "payment",
        start: 50,
        end: 80,
      }),
      span({
        traceId: "b".repeat(32),
        spanId: "3".repeat(16),
        start: 30,
        end: 60,
        links: [{ traceId: "a".repeat(32), spanId: "1".repeat(16) }],
      }),
    ];
    const r = reconstruct(s);
    expect(r.skew).toHaveLength(1);
    expect(
      r.constraints.some(
        (e) =>
          e.before.endsWith(`${"1".repeat(16)}:start`) &&
          e.after.endsWith(`${"2".repeat(16)}:start`),
      ),
    ).toBe(true);
    expect(r.associations).toHaveLength(1);
    expect(
      r.constraints.some(
        (e) =>
          e.after.startsWith("b".repeat(32)) &&
          e.before.startsWith("a".repeat(32)),
      ),
    ).toBe(false);
  });
  it("does not sum overlapping child intervals or invent missing parents", () => {
    expect(
      intervalUnion([
        [0, 10],
        [5, 15],
        [20, 25],
      ]),
    ).toBe(20);
    const r = reconstruct([span({ parentSpanId: "9".repeat(16) })]);
    expect(r.missing).toHaveLength(1);
    expect(r.constraints).toHaveLength(1);
  });
});
describe("statistical detectors", () => {
  const series = (values: number[]) =>
    values.map((p95, i) => ({
      ...aggregate(
        Array.from({ length: 5 }, (_, j) =>
          span({
            spanId: (i * 10 + j).toString(16).padStart(16, "0"),
            start: i * 5000 + 1,
            end: i * 5000 + p95 + 1,
            duration: p95,
          }),
        ),
      )[0]!,
      p95,
      time: i * 5000,
    }));
  it("computes robust statistics, smoothing and persistent shifts", () => {
    expect(median([1, 2, 3, 100])).toBe(2.5);
    expect(mad([10, 10, 10])).toBe(0);
    expect(ewma([10, 20], 0.5)).toEqual([10, 15]);
    expect(cusum([10, 10, 30, 30], 10, 2, 20).at(-1)?.changed).toBe(true);
    expect(() => ewma([1], 0)).toThrow();
  });
  it("handles normal, constant, sparse, isolated outlier and gradual shifts", () => {
    expect(detect(series([10, 11, 10, 11, 10, 10]))).toHaveLength(0);
    expect(detect(series([10, 10, 10, 10, 10]))).toHaveLength(0);
    expect(detect(series([10, 10]))).toHaveLength(0);
    expect(detect(series([10, 10, 10, 300, 10]))).toHaveLength(1);
    expect(detect(series([10, 10, 10, 30, 80, 160]))).toHaveLength(3);
    expect(
      detect(series([10, 10, 10, 300]).map((m) => ({ ...m, count: 1 }))),
    ).toHaveLength(0);
  });
  it("withholds p99 for low sample counts and deduplicates before analysis", () => {
    const s = span();
    expect(aggregate([s])[0]?.p99).toBeNull();
    expect(
      analyze([s, s], "northstar", "commerce", 0, Date.now()).spanCount,
    ).toBe(1);
  });
  it("keeps unknown explanations and does not label a ranking a probability", () => {
    const s = span();
    const h = rank([s], aggregate([s]), []);
    expect(h[0]?.service).toBe("unknown");
    expect(h[0]?.label).toBe("Leading hypothesis");
    expect(
      h.some((x) => x.warnings.some((w) => w.includes("Unobserved"))),
    ).toBe(true);
  });
});
