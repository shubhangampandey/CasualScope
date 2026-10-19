# Controlled synthetic experiments

All scenarios run against the eight Northstar Commerce listeners. The default workload is checkout; mixed traffic also browses and updates the cart. A seeded PRNG selects operations and fault variation, but network scheduling and operating-system timers are not deterministic.

| Scenario               | Mechanism                                                                      | Approved restriction       |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Healthy                | Real normal workload                                                           | Any target label; no fault |
| Pool exhaustion        | Capacity drops from 4 to 1; actual FIFO acquisition, hold delay, queue timeout | Inventory only             |
| Cascading timeout      | Downstream work takes ≥1,000 ms while client deadline is 900 ms                | Service enum               |
| Retry storm            | Order makes up to four real HTTP payment attempts against failing payment      | Payment only               |
| Cache degradation      | Bypass catalog cache path, execute a delayed synthetic backend read            | Catalog only               |
| Partial failure        | Seeded fraction of operations throw                                            | Service enum               |
| Queue backlog          | Notification consumer holds each job for a bounded delay                       | Notification only          |
| Increased latency      | Seeded bounded delay distribution                                              | Service enum               |
| Bad deployment         | Controlled latency regression and observed version attribute                   | Service enum               |
| Unavailable dependency | Synthetic request failure before normal work                                   | Service enum               |
| Resource saturation    | Actual contention on a two-slot resource semaphore                             | Service enum               |

The database pool is a synthetic semaphore, not a PostgreSQL server under load. Cache reads are synthetic backend operations. Payment and identity are fictional. The notification queue is in-memory and reset intentionally discards pending synthetic jobs. Nothing collects payment credentials, authorization headers or customer data.

Bounds: 1–20 arrivals/s, 5–90 seconds, ≤20 in-flight requests, 100 pool waiters with 2-second expiry, 200 queued notifications, bounded fault magnitude ≤1,500 ms. Public demo mode lowers run bounds to 5 req/s and 30 seconds. Only one API/controller should run.

Cancellation stops new arrivals, drains outstanding workload promises and requests a reset. Service-side expiry works even if the controller disappears. Controller restart marks unfinished runs interrupted. Delayed service operations can still finish after a client deadline; their telemetry is an observation, not a second executed workload.

Paired comparison first runs the matching healthy workload, resets, then runs the selected fault. Analysis uses the matching healthy run and current run only. Source IDs/ranges are persisted. One pair does not quantify variance; repeat independent pairs. A completed controlled run does not justify a claim about an intervention on production.

The live verification script checks every mechanism, relationships, cancellation/reset and SSE. It asserts observable fault effects, **not that ranking must always guess the injected target**. Label-driven score tuning is not performed by the verifier. Evaluation may report misses.
