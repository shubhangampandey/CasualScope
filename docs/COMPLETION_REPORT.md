# Implementation and verification report

Verified **18 October 2026 (Asia/Kolkata)** in `C:\projects\casualScope_cv`. This is a functional engineering edition with substantial implementation and explicit remaining scope, not an assertion that every enterprise requirement is finished.

## 1. Implemented

pnpm/TypeScript workspace; React/Vite monochrome product and landing page; Express session API; Argon2id authentication, CSRF and role/scope checks; persistent metadata/telemetry adapters; official-schema OTLP protobuf receiver; real SDK instrumentation; service graph; trace search/waterfall; derived metrics/detectors; evidence-aware ranking; incident notes/lifecycle; historical window replay; deterministic JSON/Markdown reports; failure lab; paired controller; post-prediction evaluations; SSE snapshots; consent-gated optional Gemini integration; Docker/Collector/SQL/Prisma/CI configurations; benchmark scripts and technical documentation.

The UI exposes 14 product views plus landing/login. The backend drives their data. No trace fixture was installed to imitate a live system.

## 2. Running services

| Process / listener                                                                    | Port                | Verified                                      |
| ------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| React development server                                                              | 5180                | yes                                           |
| API                                                                                   | 4400                | yes                                           |
| Ingestion receiver                                                                    | 4319                | yes                                           |
| Background analyzer                                                                   | no HTTP listener    | yes                                           |
| Commerce gateway / auth / catalog / cart / inventory / payment / order / notification | 4100–4107           | yes, eight real HTTP listeners in one process |
| Native OpenTelemetry Collector 0.163.1                                                | 4318; health 13133  | yes                                           |
| PostgreSQL / ClickHouse                                                               | Compose 5432 / 8123 | configured; not run on this host              |

Actual verification used **persistent local SQLite**, not the prepared full-storage adapters. Other existing projects on 4000/5173 were left running.

## 3. Analytical algorithms

Implemented and tested: observed client/server dependency construction; BFS/DFS; upstream/downstream reachability; Tarjan SCC; cycle detection; condensation DAG/Kahn ordering; bounded paths; graph comparison; structural span constraints; link associations; missing-parent/skew warnings; interval union/exclusive local time; exact percentiles; window aggregation; median/MAD; EWMA; one-sided CUSUM; relative-deviation gating; interpretable service/failure-mode ranking; unknown candidate; metric-deviation baseline comparison.

Not complete: general asynchronous critical-path calculation, full logical clocks, calibrated temporal-precedence scoring, independent causal identification, seasonality and a large held-out evaluation protocol. Details and complexity are in `ALGORITHMS.md`.

## 4. Actual OTLP result

**Works:** service SDK → native Collector → gzip OTLP/HTTP protobuf receiver → persisted spans → API/analysis/frontend. W3C parent relationships and actual client/server spans were checked. Official OpenTelemetry proto v1.9.0 is vendored with its Apache license. Direct SDK-to-receiver local mode also uses genuine protobuf SDK export.

**Not verified:** Collector → ClickHouse in Docker, OTLP logs/metrics/gRPC/JSON, durable telemetry recovery or production throughput.

## 5. Live fault verification

The final complete run is saved in `artifacts/live-verification.json`:

| Scenario               | Completed requests | Failed requests | Captured run spans | Leading hypothesis           |
| ---------------------- | -----------------: | --------------: | -----------------: | ---------------------------- |
| Healthy checkout       |                152 |               0 |              2,584 | unknown / no supported cause |
| Pool exhaustion        |                111 |             104 |              1,369 | inventory                    |
| Retry storm            |                 91 |              54 |              1,797 | payment                      |
| Queue backlog          |                112 |               0 |              1,812 | notification                 |
| Bad deployment         |                 76 |               0 |              1,291 | payment                      |
| Partial failure        |                 38 |              21 |                583 | payment                      |
| Cache degradation      |                 38 |               0 |                682 | catalog                      |
| Cascading timeout      |                 37 |              37 |                441 | inventory                    |
| Increased latency      |                 38 |               0 |                645 | payment                      |
| Unavailable dependency |                 37 |              37 |                518 | payment                      |
| Resource saturation    |                 38 |              31 |                521 | inventory                    |

The suite checked observed waits, retries, message ages, version regression, timeout attributes, persisted propagation, cancellation/reset and an actual SSE update. These ten correct leading-service rankings describe **this small synthetic run**, not held-out accuracy. Earlier ranking misses remain in the persisted evaluation history; weights were not tuned by the verifier to force the target.

A separate paired-run orchestration check passed: 39 healthy requests with zero failures, then 38 fault requests with 33 failures. The stored analysis references exactly its healthy/fault source runs. This short smoke test does not supply a sufficiently long statistical baseline; see `artifacts/pair-verification.json`.

## 6. Passing automated checks

- `pnpm build`: strict TypeScript and production frontend bundle passed; runtime/validation/motion chunks are separated.
- `pnpm test`: **19 tests across four files passed**. Covers graph cycles/condensation, structural order/skew/links/missing spans, interval overlap, statistics/sparse data, deduplication, unknown ranking, genuine pool contention, official protobuf/gzip, ingestion scope/redaction, log/trace throttle separation, authentication, workspace/environment isolation, CSRF, roles, bounds, ground-truth separation, report provenance, replay and lifecycle validation.
- `pnpm test:e2e`: **5 passed**, including every product route at 1440/1024/768/390 px with overflow and API-error checks, plus a real captured trace → collapse/keyboard inspection → incident creation → status change → saved note → report → command navigation workflow.
- `pnpm verify:live --all`: all ten bounded fault mechanisms plus healthy traffic, propagation, storage, cancellation/reset and SSE passed against the native Collector path.
- `pnpm exec tsx scripts/verify-pair.ts`: healthy/fault orchestration and source isolation passed.

## 7. Failures and checks that could not run

No outstanding failure remains in the executed final build, unit/integration/security or browser suites. Earlier verification found and corrected Collector gzip handling, error logs starving trace exports, contaminated preceding-fault baselines, port conflicts, a trace/log query-range bug, and a status-update race that could clear an unsaved investigator note. The stronger browser workflow verifies the corrected behavior.

Could not run: Docker/PostgreSQL/ClickHouse acceptance, production TLS/backup/restore, a live Gemini request without a key, independent held-out fault accuracy, sustained full-store ingestion/query benchmarks, comprehensive accessibility/security audit, and animation frame-time profiling. Basic success on this host does not substitute for these checks.

## 8. Benchmarks actually executed

`pnpm benchmark` measured generated algorithm inputs and separate local SQLite storage on Windows x64, Node 24.21.0, Intel i5-12450H, 12 logical CPUs, approximately 16 GB RAM. Ten timed samples after warm-up:

| Generated topology / observations | Full analysis p50 |       p95 |       p99 |
| --------------------------------- | ----------------: | --------: | --------: |
| 8 services / 800 spans            |           5.54 ms |   8.91 ms |   9.28 ms |
| 25 services / 2,500 spans         |          20.27 ms |  22.60 ms |  22.92 ms |
| 100 services / 10,000 spans       |          83.53 ms | 100.07 ms | 100.78 ms |

Local SQLite: 5,000 rows inserted in 43.15 ms and queried in 9.42 ms. The JSON includes graph/reconstruction/aggregation/detection/ranking breakdowns and environment information. This is not HTTP ingestion throughput or ClickHouse capacity; ten samples are insufficient for stable tail estimates. See `artifacts/benchmarks.json`.

## 9. Exact local startup

The application is left running at **http://localhost:5180/app**. After stopping existing CausalScope processes, a fresh direct-local start is:

```powershell
cd C:\projects\casualScope_cv
pnpm install
pnpm db:generate
Copy-Item .env.example .env # first setup only; preserve your existing settings
pnpm db:seed
pnpm dev
```

Login: `engineer@northstar.local` / `Northstar-local-2026!`. Set unique credentials before first seed if desired. For Collector mode, start the Collector using `infrastructure/collector/local.yaml`, set its `INGEST_TOKEN`, then set `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in the application terminal before `pnpm dev`. The host verification binary is available locally under `.data/tools/otelcol.exe`; it is not a source dependency or a committed asset.

Full-storage preparation: `docker compose up --build -d`; open http://localhost:4400 after health checks. This path must first be validated on a Docker-capable host.

## 10. Remaining limitations

See `docs/LIMITATIONS.md` for the complete matrix. Material gaps include unverified full-store containers; simplified JSONB metadata; one controller; volatile telemetry buffers; account/environment administration; incident merge/split; advanced critical paths/logical clocks; richer replay/propagation interfaces; independent evaluation/calibration; comprehensive OpenAPI schemas; production hardening; metadata retention and sustained-load benchmarks.

## 11. Best reproducible interview demonstration

Run 20 seconds of healthy checkout, seed 42, 8 requests/s. Run 15 seconds of inventory pool exhaustion at 400 ms with the same workload. Show the actual bounded FIFO pool, persisted wait attributes and upstream errors. Open the run's analysis, explain numerical ranking factors and uncertainty, follow a real referenced trace, inspect overlapping spans and structural ordering, replay an incident, save a note and export a report. Finish with a paired run and a visible ranking miss from another historical execution to show that the system records evidence rather than guaranteeing an answer.
