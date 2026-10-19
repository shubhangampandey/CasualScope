# Algorithms

The executable implementation is in `packages/analysis`. Outputs are deterministic for a fixed observation set, except IDs, creation timestamps and measured runtime.

## Observed dependency graph

Index spans by trace/span ID. For each server span, resolve its parent. Add an edge only when the parent is an observed **client span in another service**. Local operations and arbitrary timestamp proximity cannot create edges. Edge observations aggregate calls, errors, latency quantiles, trace references and five-second windows. The directed edge means caller → dependency; callers potentially affected by a failing dependency are reached through the **reverse** graph.

Indexing/construction is O(n), with exact percentile sorting O(n log n) in aggregate. Memory is O(n + V + E). BFS/DFS is O(V+E); Tarjan SCC is O(V+E). Cycles are condensed into components before Kahn ordering. Path enumeration is deliberately bounded by depth 8 and 30 paths; exhaustive path enumeration can be exponential. Graph comparison returns added/removed directed relationships.

## Partial order and time

Each span contributes `start → end`. A resolved parent contributes `parent.start → child.start`, even when service clocks make timestamps appear reversed. A parent is not assumed to complete after every asynchronous child. Span links remain typed associations; a generic OpenTelemetry link alone does not establish happens-before. Unrelated events remain unordered. Missing parents and child-start-before-parent-start warnings are reported.

Trace wall duration is `max(end) − min(start)`, subject to clock quality. Exclusive local duration subtracts the **union**, not the sum, of overlapping same-service child intervals. This is not an exact distributed critical path. A true latency-critical-path algorithm under asynchronous links, missing spans and clock skew remains unfinished. OpenTelemetry is not claimed to provide complete Lamport clocks.

## Windows and baselines

Observed server and consumer spans are grouped into nonempty five-second buckets. Counters, error fraction, throughput, interpolated p50/p95, and p99 only with at least 100 samples are computed. Retries, timeouts, maximum connection wait, queue depth and message age come from explicitly instrumented attributes. Empty windows are absent, not silently filled with zero.

`aggregate(spans, windowMs)` accepts different programmatic window widths; the current UI and worker use five seconds. The first **three eligible** windows (each with ≥3 observations) form a frozen median/MAD reference. This is not a seasonality model or independently certified healthy baseline. Experiment analysis uses an explicitly executed matching healthy run where available.

```text
baseline = median(first three eligible windows)
scale = max(1.4826 * MAD(history), noise floor)
robustDeviation = (current − baseline) / scale
relativeDeviation = (current − baseline) / max(baseline, metric floor)
emit if count ≥3, robustDeviation ≥3.5 and relativeDeviation ≥0.30
```

The latency/wait floor is max(5 ms, 10% of baseline); the error-fraction floor is 0.02. EWMA uses α=0.3. One-sided CUSUM accumulates `max(0, previous + value − baseline − scale)` and marks a shift above `8*scale`. These corroborate an eligible MAD/relative-deviation finding; they are not three independent votes. Error fractions need a different floor from latency. Constant data, sparse samples and a zero MAD are explicitly handled.

Aggregation uses bucket indexes plus percentile sorts; detection is O(service windows) apart from per-service grouping and small baseline sorting. These are bounded-window engineering algorithms, not production online sketches.

## Ranking

For each observed service, compute:

| Factor                                                                              | Contribution                  |
| ----------------------------------------------------------------------------------- | ----------------------------- |
| Largest robust deviation / 20, capped at 1                                          | 2 × magnitude                 |
| Direct pool wait / 150 ms, message age / 1 s, or server error fraction, capped at 1 | 3 × direct                    |
| Exclusive local share × anomaly magnitude                                           | 1.5 × local share × magnitude |
| Reverse reachable caller fraction × anomaly magnitude                               | 1 × impact × magnitude        |
| Observed controlled version regression attribute                                    | 0.5 × change                  |
| Missing-parent fraction                                                             | −2 × missing fraction         |

Clamp below at zero, include candidates with observations, add an **unknown/outside-system** candidate, and normalize by the sum of ranking scores. Normalized scores are **not calibrated causal probabilities**. Candidate failure modes summarize observable wait/error/retry/version behavior. A local-time contradiction is displayed when most duration is waiting for dependencies.

The baseline strategy sorts maximum statistical deviation. The graph strategy uses the above additional evidence. Temporal structural constraints are displayed and clock quality affects warnings; supported precedence is **not yet a separate calibrated ranking feature**. Logs provide reference IDs, not untrusted prose instructions or opaque AI features. Centrality alone cannot establish cause.

Ranking uses bounded per-service scans and client-child lookups; the present implementation includes per-server child scans and is not optimized for millions of spans. Benchmarks measure its actual runtime. Do not infer asymptotic enterprise capacity from the small synthetic suite.

## Evaluation

Each completed fault run stores predictions before isolated ground truth is read. Top-1, top-3, reciprocal rank and baseline top-1 are calculated for those runs. Healthy runs are excluded from cause-identification metrics. The UI calls these live synthetic experiment results, not held-out generalization accuracy. Ranking misses are valid outcomes and remain in the records.

Clock-skew and missing-parent correctness are unit-tested. A larger independent, labeled protocol for false-positive rates, false negatives, detection delay, multiple simultaneous faults, missing-telemetry sweeps and calibration remains future work. No fabricated accuracy metric substitutes for that evaluation.
