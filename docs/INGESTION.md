# Ingestion contract

Supported: `POST /v1/traces`, `Content-Type: application/x-protobuf`, optional gzip content encoding, OTLP ExportTraceServiceRequest from OpenTelemetry proto v1.9.0. The response is the official protobuf ExportTraceServiceResponse with partial-success rejection counts when individual spans are invalid.

The authenticated credential maps to **northstar / commerce**. This edition provides one configured ingestion scope, not dynamic multi-tenant credential provisioning. Telemetry attributes cannot override it. User API queries are independently membership/environment scoped.

Limits: 4 MiB **decompressed** payload, 2,000 spans/export, 64 attributes/entity, 128-character keys, 2,048-character primitive strings, 32 events/links, bounded service names, timestamps within seven days, ≤1-hour span duration, nonzero 16-byte trace IDs and 8-byte span IDs. Nested attribute arrays/maps are outside the supported subset and are discarded. Nanosecond timestamps remain strings; charts use milliseconds. Secret-like and hidden-label keys are removed. Key-based redaction is not a general content-level DLP system.

At most four persistence operations are in flight. Each environment receives at most 60,000 spans/minute and 128 service names per quota interval, plus a 2,400 trace-request/minute guard (enough for eight independent direct SDK exporters). Log requests have an independent 2,000 request/minute budget so an error storm cannot starve trace exports. These are process-local engineering limits, not distributed quotas. `GET /internal/stats` requires the ingestion credential and exposes accepted batches/spans, rejected spans, quota rejections and storage failures.

Storage is acknowledged only after the adapter finishes. Storage failure returns 503 and Retry-After; overload returns 429/503. The Collector retries within a finite budget. SDK queues and Collector queues are volatile. Acknowledgement by the Collector does not prove database persistence; experiment finalization waits for gateway observations up to ten seconds and reports incomplete capture honestly.

Duplicate spans are idempotent under workspace/environment/trace/span identity. Conflicting payloads for an existing immutable span are unsupported producer behavior: SQLite retains the first; ClickHouse retains the latest ingestion version. This difference is documented rather than described as exactly once.

`POST /internal/logs` is a separate, authenticated synthetic JSON transport with trace/span correlation. It is not an OTLP logs implementation. Receiver transport security is the internal Docker network or local development trust boundary. External TLS, collector authentication and environment-specific credential issuance must be supplied before external ingestion.
