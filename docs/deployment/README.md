# Deployment preparation

No external deployment was performed. Use `docker compose up --build -d` for the prepared local full-storage stack. Docker was absent on the implementation host, so perform a real Compose acceptance run before treating this path as validated.

The Dockerfile builds the Vite frontend and TypeScript-checks the sources, generates Prisma, then runs a non-root Node user. The current runtime retains the build dependencies and runs TypeScript through tsx; a smaller compiled-server image is a future optimization. The migrate job must complete before dependent application services start. Full Compose serves the built UI from API port 4400 with a matching origin.

For public deployment, provide an HTTPS reverse proxy, independent non-placeholder secrets and seed password, `NODE_ENV=production`, `STORAGE_MODE=production`, an exact HTTPS `WEB_ORIGIN`, and real database credentials. Do not publish ClickHouse/PostgreSQL/Collector/receiver/demo control ports. Apply production secret management rather than committing `.env`. The default Compose file deliberately sets development mode and loopback published ports.

Set `PUBLIC_DEMO=true` to bound workloads more tightly. Synthetic records only. Keep one controller replica until a distributed lease exists. Disable `FAULT_LAB_ENABLED` if the host cannot afford live synthetic experimentation; do not represent prerecorded data as live.

Plan capacity for ClickHouse, Postgres and Node independently. Compose includes CPU/memory guidance, not a measured capacity allocation. Request/read bounds, Collector memory limits and bounded synthetic queues protect local execution but do not replace host quotas or production overload testing.

Backup PostgreSQL with a tested database-native backup/restore protocol; protect credentials and retention. ClickHouse retention is seven days in `infrastructure/clickhouse/init.sql`; adjust and migrate TTL explicitly. SQLite retention follows `RETENTION_DAYS`, while derived analysis/metadata snapshots currently require manual lifecycle management. Test restore consistency of telemetry references and metadata snapshots.

Health endpoints check actual adapter connectivity. Readiness does not prove the Collector has delivered every span or the analytical model is statistically valid. Watch receiver rejection/storage failure counters, Collector retry/drop logs, incomplete experiment capture warnings and worker errors. CI includes type/build/tests and browser checks; container-backed CI acceptance remains to be added after the full path is exercised.
