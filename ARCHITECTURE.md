# Architecture

## Boundaries

`apps/demo-system` runs eight independently addressed HTTP listeners in one Node process. These are functional synthetic services, not eight containers or eight failure-isolated processes. Gateway validates identity through auth; browsing calls catalog; cart calls catalog; checkout calls order → cart → inventory → payment → notification. Queued notification processing starts a consumer trace with a genuine link to its enqueue context. No link is converted into a fabricated parent.

`packages/instrumentation` maintains one SDK provider/resource per service. An AsyncLocalStorage context manager and explicit W3C injection/extraction preserve context across fetch/Express boundaries. Manual instrumentation makes server, client, pool, retry, consumer and exception behavior inspectable. This does not claim arbitrary application auto-instrumentation.

`apps/ingest` validates a bounded protobuf export request using the vendored official schema. Credentials select the fixed Northstar/commerce scope; client-supplied tenant attributes do not authorize a scope. Attribute keys that suggest secrets or fault-label leakage are excluded. Spans preserve nanosecond strings and millisecond projection for chart calculations. Ingestion time is distinct from event time.

`packages/storage` exposes scoped metadata and telemetry operations. Full mode uses Prisma/PostgreSQL for JSONB domain records and isolated fault labels; ClickHouse stores telemetry in ReplacingMergeTree tables. All ClickHouse reads use FINAL for query-time deduplication. Local mode is a persistent SQLite adapter for verification without container infrastructure. The API reports the actual adapter.

`apps/analyzer` reads at most 30,000 observations from a five-minute window every five seconds. Its input contains observations, not experiment configuration. Analysis records retain version, parameters on anomalies, references, metric windows, dependency windows, input fingerprint, runtime and quality warnings. Unchanged background inputs reuse an existing result. Ad-hoc and experiment results remain immutable snapshots. The worker updates an active incident's current snapshot, retaining prior analysis records.

`apps/api/experiments` owns controller access and isolated ground truth. Matching completed healthy traffic is selected by workload, seed and rate. Each experiment analysis combines that baseline's actual spans with only the current run's spans; previous faults cannot silently contaminate the baseline. Source run ranges are recorded on the analysis. Predictions are saved before the evaluator reads target labels. Missing healthy runs produce an explicit warning.

`apps/api` handles sessions, authorization, incident state, trace queries, comparisons, reports, optional explanations and SSE. Every observation query includes workspace **and** environment. Fault controllers accept an approved service enum, never an arbitrary hostname or URL.

`apps/web` uses ordinary cached HTTP queries and one authenticated SSE connection. Updates invalidate relevant queries at a bounded cadence. Custom SVG renders observed dependencies, real span positions and metric curves. Historical replay reveals stored dependency/metric windows rather than generating states. Motion is reduced when requested.

## Persistence and consistency

- Span identity is `(workspace, environment, traceId, spanId)`; repeated exports do not multiply analytical counts.
- SQLite keeps the first immutable observation. ClickHouse retains the latest ingested version with a replacing engine; data producers are expected not to mutate ended spans.
- Event timestamps determine time partitions in ClickHouse; TTL is seven days in the supplied SQL. Changing `RETENTION_DAYS` changes SQLite pruning only; change the ClickHouse TTL explicitly for full mode.
- Metadata records are composite tenant-key JSONB documents with TypeScript domain models and Zod mutation validation. This is a deliberate engineering-edition simplification, not a fully normalized foreign-key-rich enterprise schema.
- Derived records and telemetry do not participate in a cross-database ACID transaction. Failed analysis finalization leaves a persisted run with an error; data can be re-analyzed. Collector retries and idempotent identities cover duplicate delivery, not every failure window.
- SDK and Collector queues are bounded, volatile buffers. A process crash or expired retry budget can lose telemetry. This is not exactly-once delivery or a durable message bus.
- Logs are bounded, best-effort correlated JSON with independent failure handling. They do not use an experimental OpenTelemetry logs SDK.

## Operational constraints

One controller instance owns local workload execution. Its in-process reservation is not a distributed lease; run only one API/controller replica until a database lease is implemented. A restart marks running experiments interrupted and requests a reset. The service-side expiry remains independent of the API process.

The Collector applies batching and a memory limiter, a finite export queue and a finite retry deadline. The receiver rejects overload instead of acknowledging data it cannot persist. Readiness checks query storage. Network partitions across databases can leave eventually consistent derived evidence. Future scale work requires ClickHouse-native aggregation, worker leases/cursors, normalized control tables, durable queues where required, and explicit data-quality accounting across all stages.
