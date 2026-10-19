import "dotenv/config";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createClient } from "@clickhouse/client";

process.env.API_PORT = process.env.PORT || process.env.API_PORT || "4400";
process.env.INGEST_HOST = "127.0.0.1";
process.env.DEMO_HOST = "127.0.0.1";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${process.env.INGEST_PORT || "4319"}`;
const { config } = await import("../packages/shared/config.js");
const migrate = spawn(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", windowsHide: true },
);
await new Promise<void>((done, reject) => {
  migrate.on("error", reject);
  migrate.on("exit", (code) =>
    code === 0 ? done() : reject(new Error("Database migration failed")),
  );
});
if (process.env.VERIFY_STORAGE_ON_START === "true") {
  const verify = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "tests/integration/postgres-storage.test.ts",
    ],
    {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "test",
        POSTGRES_TEST_URL: process.env.DATABASE_URL,
      },
    },
  );
  await new Promise<void>((done, reject) => {
    verify.on("error", reject);
    verify.on("exit", (code) =>
      code === 0
        ? done()
        : reject(new Error("PostgreSQL storage verification failed")),
    );
  });
}
if (config.STORAGE_MODE === "production") {
  const clickhouse = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER || "causalscope",
    password: process.env.CLICKHOUSE_PASSWORD,
    request_timeout: 30000,
  });
  try {
    const schema = await readFile("infrastructure/clickhouse/init.sql", "utf8");
    for (const query of schema
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean))
      await clickhouse.command({ query });
  } finally {
    await clickhouse.close();
  }
}
const { Store } = await import("../packages/storage/index.js");
const { scope } = await import("../packages/shared/index.js");
const { seed } = await import("../apps/api/auth.js");
const { createApp } = await import("../apps/api/app.js");
const { createIngest } = await import("../apps/ingest/main.js");
const { startDemo } = await import("../apps/demo-system/main.js");
const { runAnalysis } = await import("../apps/analyzer/worker.js");
const store = new Store();
await store.health();
await seed(store);
const ingest = createIngest(store).listen(config.INGEST_PORT, "127.0.0.1");
const demo = await startDemo();
const { app, experiments } = createApp(store);
await experiments.recover();
const server = app.listen(config.API_PORT, "0.0.0.0", () =>
  console.log(
    "CausalScope API, ingestion, synthetic services and analyzer are ready",
  ),
);
let analyzing = false;
const timer = setInterval(async () => {
  if (analyzing) return;
  analyzing = true;
  try {
    await runAnalysis(
      store,
      scope.workspace,
      scope.environment,
      Date.now() - 300000,
      Date.now(),
      true,
    );
    await store.prune();
  } catch (error) {
    console.error(
      "Analysis failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  } finally {
    analyzing = false;
  }
}, 5000);
let closing = false;
async function stop(exitCode = 0) {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  setTimeout(() => process.exit(1), 10000).unref();
  if (experiments.current)
    await experiments.stop(experiments.current.id).catch(() => {});
  await Promise.all([
    new Promise<void>((done) => server.close(() => done())),
    new Promise<void>((done) => ingest.close(() => done())),
    demo.close(),
  ]);
  await store.close();
  process.exit(exitCode);
}
server.on("error", () => void stop(1));
ingest.on("error", () => void stop(1));
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
