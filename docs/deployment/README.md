# Deployment preparation

## Free Render deployment

`STORAGE_MODE=postgres` stores both metadata and telemetry in PostgreSQL. It preserves tenant and environment filtering, duplicate rejection, bounded queries, and configured retention without requiring a paid ClickHouse service. The existing `STORAGE_MODE=production` option continues to use PostgreSQL plus ClickHouse.

Generate Prisma before building, deploy all migrations, and start `node --import tsx scripts/render-start.ts`. This entry point runs the API, loopback OTLP receiver, synthetic services, and bounded analyzer in one instance. Set `NODE_ENV=production`, unique production secrets and password, `PUBLIC_DEMO=true`, and the exact Vercel HTTPS origin. It validates production settings before migrating. Vercel proxies `/api` to Render to preserve same-origin sessions.

When sharing a free PostgreSQL instance with another application, use a separate database schema in `DATABASE_URL` (for example, `?schema=casualscope`) to isolate Prisma migrations and tables. Render free databases expire after 30 days; migrate or upgrade before the expiry shown in the dashboard. Free web services sleep when inactive. This configuration is intended for a small portfolio workload, not ClickHouse-scale telemetry.

## Full ClickHouse deployment

Use `docker compose up --build -d` for the alternative local full-storage stack. Perform a real Compose acceptance run before treating the container path as validated.

The Dockerfile builds the Vite frontend and TypeScript-checks the sources, generates Prisma, then runs a non-root Node user. The current runtime retains the build dependencies and runs TypeScript through tsx; a smaller compiled-server image is a future optimization. The migrate job must complete before dependent application services start. Full Compose serves the built UI from API port 4400 with a matching origin.

For public deployment, provide an HTTPS reverse proxy, independent non-placeholder secrets and seed password, `NODE_ENV=production`, `STORAGE_MODE=production`, an exact HTTPS `WEB_ORIGIN`, and real database credentials. Do not publish ClickHouse/PostgreSQL/Collector/receiver/demo control ports. Apply production secret management rather than committing `.env`. The default Compose file deliberately sets development mode and loopback published ports.

Set `PUBLIC_DEMO=true` to bound workloads more tightly. Synthetic records only. Keep one controller replica until a distributed lease exists. Disable `FAULT_LAB_ENABLED` if the host cannot afford live synthetic experimentation; do not represent prerecorded data as live.

Plan capacity for ClickHouse, Postgres and Node independently. Compose includes CPU/memory guidance, not a measured capacity allocation. Request/read bounds, Collector memory limits and bounded synthetic queues protect local execution but do not replace host quotas or production overload testing.

Backup PostgreSQL with a tested database-native backup/restore protocol; protect credentials and retention. ClickHouse retention is seven days in `infrastructure/clickhouse/init.sql`; adjust and migrate TTL explicitly. SQLite retention follows `RETENTION_DAYS`, while derived analysis/metadata snapshots currently require manual lifecycle management. Test restore consistency of telemetry references and metadata snapshots.

Health endpoints check actual adapter connectivity. Readiness does not prove the Collector has delivered every span or the analytical model is statistically valid. Watch receiver rejection/storage failure counters, Collector retry/drop logs, incomplete experiment capture warnings and worker errors. CI includes type/build/tests and browser checks; container-backed CI acceptance remains to be added after the full path is exercised.
