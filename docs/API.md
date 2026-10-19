# API reference

Prefix: `/api/v1`. Use the HttpOnly session from `POST /auth/login`. `GET /auth/me` returns a CSRF token for `X-CSRF-Token` on mutations. Optional `X-Workspace` and `X-Environment` select an authorized membership scope. Unknown scopes return 403; inaccessible records return 404. API errors carry an HTTP status, error string and response correlation header. A basic authenticated OpenAPI index is at `/openapi`; it is not yet a comprehensive request/response schema.

| Method    | Path                           | Behavior                                                                                    |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| GET       | `/health`                      | Actual storage adapter readiness, optional AI availability                                  |
| POST      | `/auth/login`                  | Email/password session; 10 attempts/minute                                                  |
| GET       | `/auth/me`                     | Safe user profile, current scope, CSRF token                                                |
| POST      | `/auth/logout`                 | Delete session, clear cookie                                                                |
| GET       | `/workspaces`, `/environments` | Membership scopes                                                                           |
| GET       | `/analysis?id=UUID`            | Immutable analysis or latest background result                                              |
| POST      | `/analysis?start=MS&end=MS`    | Recompute persisted window; two requests/10 seconds                                         |
| GET       | `/services`, `/topology`       | Observed services/graph, SCC condensation; optional service neighborhoods and bounded paths |
| GET       | `/traces`                      | Trace ID, service, root operation contains, minimum duration, errors and page filters       |
| GET       | `/traces/TRACE_ID`             | Captured spans, structural constraints, exclusive local time, correlated logs               |
| GET       | `/logs`                        | Scope/time/service/trace filters; max 3,000 rows                                            |
| GET/POST  | `/incidents`                   | List or open from an existing analysis                                                      |
| GET/PATCH | `/incidents/ID`                | Detail, validated state transitions, notes/resolution                                       |
| GET       | `/incidents/ID/replay`         | Stored metric/dependency windows and anomaly observations                                   |
| GET       | `/reports/ID?format=markdown`  | Deterministic Markdown or default JSON download                                             |
| GET/POST  | `/experiments`                 | Actual execution history or bounded scenario start                                          |
| POST      | `/experiments/ID/stop`         | Cancel and reset approved synthetic faults                                                  |
| GET/POST  | `/comparisons`                 | Same-seed healthy/fault pair orchestration                                                  |
| GET       | `/evaluations`                 | Post-prediction labels and ranking outcomes for this environment                            |
| GET       | `/settings`                    | Runtime adapter, detector settings, membership role, retention                              |
| POST      | `/assist/ANALYSIS_ID`          | Explicit `{consent:true}`; server-enabled Gemini summary only                               |
| GET       | `/events`                      | Authenticated SSE snapshot notifications, reconnect-safe state invalidation                 |

Observation queries default to the last five minutes, reject reversed/nonfinite ranges and ranges over 24 hours, and cap retrieved spans at 30,000. Trace lists paginate 50 traces/page **after** bounded span retrieval; they are not an unbounded historical search index. Narrow a saturated time range. Service filtering selects matching traces without discarding the other captured spans in their summaries.

Incident states: detected → investigating/resolved; investigating → mitigating/resolved; mitigating → monitoring/investigating; monitoring → resolved/investigating; resolved → investigating. Merge/split and saved multi-panel investigations remain unfinished.

SSE emits complete revision snapshots, not a durable replay log. The client invalidates cached query data at a bounded cadence; reconnect retrieves current state. Event IDs are server timestamps. Exactly-once delivery and cursor replay are not promised. Three connections per session are allowed.
