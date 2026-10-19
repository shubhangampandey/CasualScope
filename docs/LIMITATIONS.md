# Capability boundaries and unfinished work

This repository contains a substantial functional engineering edition. The original enterprise brief is broader than the verified implementation. The following boundaries are explicit so an interviewer or deployer can distinguish working behavior from preparation or missing work.

## Runtime verification boundary

Verified here: eight real HTTP listeners, actual W3C propagation, SDK protobuf export, native Collector 0.163.1, receiver persistence, local SQLite, bounded fault effects, analysis, scoped API/security tests, browser layouts and report/replay records. PostgreSQL, ClickHouse and Docker configurations/adapters are implemented but **could not run because Docker is unavailable**. Do not equate local SQLite results with full-store validation.

## Implemented with narrower scope

- One seeded organization/environment and fixed ingestion credential scope. Membership/environment predicates and five role permissions exist; account invitations, environment provisioning, role administration, password recovery and SSO do not.
- Application metadata uses composite-key JSONB records, not the comprehensive normalized schema with foreign-key constraints in the original brief. Audit history is incident-centric, not a complete security audit ledger.
- Eight functional listeners share one Node process and one host. They are not eight independent deployment units.
- Custom HTTP instrumentation and protobuf traces only; no generic arbitrary-service auto-instrumentation, OTLP logs/metrics/gRPC or nested attribute model.
- Finite, volatile SDK/Collector buffers; no durable outbox, durable ingestion broker or exactly-once delivery.
- Derived request metrics and programmatic aggregation are real. The UI/worker fix the width at five seconds; a configurable multi-window/baseline editor, seasonal baselines, calibrated change-point models and general metrics query builder are unfinished.
- Replay stores real metric/dependency windows and anomaly references. It does not yet recalculate a ranking per scrub position, expose an event-category lens, or implement a full versioned replay event store. Earlier snapshots without per-edge windows cannot recover nonexistent historical edge counts.
- Graph BFS/DFS/SCC/condensation/path/comparison algorithms exist. The UI exposes local neighborhoods, not every algorithm or a full interactive bounded propagation-path workbench.
- Structural partial-order constraints and generic link associations exist. Explicit Lamport clocks, local logical-sequence instrumentation, a dedicated clock-skew laboratory mode and general asynchronous critical-path inspection do not.
- Trace waterfall supports real positions, selection, zoom, horizontal pan, per-parent collapse and arrow-key inspection. No complete trace-to-trace compare workbench or dense Canvas renderer is implemented.
- Incident lifecycle/notes/snapshots/reports work. Manual incident merge/split, arbitrary saved investigation panels and complete automated incident-correlation semantics remain unfinished. Correlation is a modest recent/shared-service heuristic; it must not be described as full causal grouping.
- Ten bounded fault mechanisms and same-workload pairs work. Missing-span, clock-skew and competing-fault live lab presets, persistent commerce initial-state snapshots, repeated-run uncertainty intervals and strict OS-level determinism are unfinished.
- Evaluations report actual top-1/top-3/MRR/baseline outcomes after prediction. There is no independent held-out corpus, tuning split, calibrated probability, or defensible false-positive/detection-delay measurement protocol yet.
- Reports export deterministic JSON/Markdown. No PDF export. Gemini is consent-gated and optional; no API key was available for a live model request, so that external path is type-checked but unverified.
- SSE is bounded snapshot invalidation with session checks, not a durable, replayable exactly-once event stream.
- Public marketing and responsive product routes are implemented. A richer prerecorded landing experiment, resizable investigation panels, complete command-dialog focus restoration, full WCAG audit and animation frame-budget measurements remain refinement work.
- OpenAPI is a basic endpoint index; comprehensive validated request/response schemas and a generated SDK are unfinished.
- Benchmark results cover generated algorithm data and local storage only. No sustained full-store ingestion/query capacity claim is justified.

## Scaling and security work before production

Use a single API/controller; add a database lease before scaling replicas. Move heavier analysis into worker threads or database-native windows. Optimize remaining repeated per-service/server scans. Normalize identity/membership records and implement indexed, unique identity lookup. Add distributed quotas, complete immutable audit records, durable delivery if required, backup restore tests, production TLS, credential rotation and a security review.

Metadata snapshots currently lack automatic retention, though raw telemetry is pruned/TTL-controlled. Exact quantiles are sorted in memory; no approximate streaming sketches are claimed. Sampling and missing observations can change graph completeness and rankings. The detector's first eligible windows can already contain a fault when no true baseline is available. A single controlled fault success is not proof of causality outside this synthetic setting.
