# Interview guide

## What problem does this solve?

A failed checkout can produce errors in gateway, order and payment without identifying the origin. CausalScope preserves observations, builds the observed call graph, compares metric windows to a baseline and ranks explanations with supporting and contradictory evidence. The engineering achievement is the data pipeline and explainable analysis; AI is optional.

## How does a request become a trace?

Gateway extracts W3C context or starts a root server span. Its outgoing client span injects that context into real HTTP headers. The downstream service extracts it and creates a server span. Distinct service resources preserve identity. SDK batch export sends protobuf to the Collector, which forwards to the authenticated receiver. Span identity includes trace/span IDs and scope. A queued notification consumer uses a span link, not a false parent.

## Where does the graph come from?

An observed downstream server span whose parent is an observed upstream client span establishes a directed caller-to-dependency edge. Internal operations do not. Point to `buildGraph`, then Tarjan SCC/condensation. Explain why a service graph may contain cycles and why sorting a cyclic graph directly is wrong.

## How are anomalies detected?

Demonstrate request-derived percentiles in real five-second buckets. The first three eligible windows supply median/MAD history. A noise floor handles a zero MAD. A robust and relative-deviation rule gates findings; EWMA/CUSUM corroborate persistent changes. Sparse data is not treated as normal. The current baseline is intentionally simple and does not handle daily seasonality.

## How does ranking work?

Open a stored hypothesis. Explain each numerical factor: observed deviation, direct wait/error evidence, local latency share, reverse-reachable caller impact, an observed configuration version, and missing-parent penalty. Scores order candidates and are not probabilities. Show the unknown candidate and a real ranking miss rather than promising universal accuracy.

## How is ground-truth leakage prevented?

The inference function signature accepts spans, metrics, anomalies, logs and quality warnings. It has no fault-target parameter. Labels are stored separately; evaluation reads them after predictions are saved. The controller selects actual healthy-run observations as a baseline and records source run IDs. Fault parameters never become ranking attributes.

## Missing spans and clock skew?

Use the algorithm tests. A child timestamp earlier than its propagated parent is flagged, but the structural constraint remains. Two unrelated traces are not ordered causally just because their clocks sort. A generic link remains an association. Missing parents do not create inferred fake edges. Inclusive duration, exclusive local time and wall duration differ. The product does not yet implement a fully general asynchronous critical path or complete logical clocks.

## Why two databases?

PostgreSQL owns control metadata; ClickHouse is prepared for analytical event storage and deduplicated reads. There is no shared ACID transaction. The demonstration host used an explicitly labeled persistent SQLite adapter because Docker was absent. Be precise about which path was actually verified. Prisma stores composite-key JSONB domain records in this edition; full relational normalization is remaining work.

## What is the best live demo?

Run 20 seconds of healthy checkout at 8 req/s, seed 42. Then run 15 seconds of inventory pool contention at 400 ms with the same workload. Show the actual bounded pool code, persisted connection-wait attributes and caller errors. Open the completed run's analysis and its trace references. Compare a retry-storm run and inspect increased outgoing attempts. Replay an incident, save a note and export the report. No AI key is needed.

## How does it scale?

Current windows cap observations and request time ranges; event queues and load are bounded. Discuss the actual benchmark file and hardware. Do not claim its 100-service generated graph is 100 deployed services. Next steps are ClickHouse-native aggregation, persistent worker cursors and leases, bounded worker threads, normalized metadata and a durable collector queue if the delivery objective requires one.

## What should you volunteer as limitations?

Single controller, volatile telemetry buffers, sampled/incomplete topology, limited baseline calibration, local synthetic queue reset semantics, no independent held-out accuracy claim, unverified Docker database path on this host, basic OpenAPI index, and unfinished advanced incident merge/split, critical paths and enterprise account management. The complete list is in `docs/LIMITATIONS.md`.
