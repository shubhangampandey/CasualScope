# Benchmark protocol

Run `pnpm benchmark`. The script writes `artifacts/benchmarks.json` with timestamp, OS, architecture, Node version, CPU model, logical CPUs, RAM and measured timings.

Algorithm inputs are generated test observations with 8, 25 or 100 named services and 800, 2,500 or 10,000 spans. These are **not deployed service counts**. Graph construction, structural reconstruction, aggregation, detection, ranking and full analysis each receive one warm-up and ten measured iterations. Exact interpolated p50/p95/p99 are reported, but ten samples do not support a stable tail-latency capacity claim.

The database measurement inserts 5,000 synthetic spans into a separate local SQLite database and reads them through the adapter. Rows/s describes one local storage transaction, not HTTP ingestion, end-to-end latency, or ClickHouse capacity. Actual Collector-path workload results live in `artifacts/live-verification.json` and remain separate.

Not measured: production PostgreSQL/ClickHouse query latency, sustained ingestion saturation, p99 over a long independent load run, database recovery, replay retrieval load, distributed backpressure durability or rendering frame budgets. Do not substitute algorithm numbers for these unfinished benchmarks. Other local applications may influence this host's timings.
