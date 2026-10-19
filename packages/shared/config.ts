import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.string().default("development"),
  STORAGE_MODE: z.enum(["local", "production", "postgres"]).default("local"),
  API_PORT: z.coerce.number().default(4400),
  INGEST_PORT: z.coerce.number().default(4319),
  WEB_ORIGIN: z.string().default("http://localhost:5180"),
  INGEST_TOKEN: z.string().default("local-synthetic-ingest-token-replace"),
  CONTROL_TOKEN: z.string().default("local-synthetic-control-token-replace"),
  DEMO_HOST: z.enum(["127.0.0.1", "demo"]).default("127.0.0.1"),
  FAULT_LAB_ENABLED: z.string().default("true"),
  PUBLIC_DEMO: z.string().default("false"),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});
export const config = schema.parse(process.env);
export function isWebOrigin(origin?: string) {
  if (origin === config.WEB_ORIGIN) return true;
  if (!origin || config.NODE_ENV === "production") return false;
  try {
    const expected = new URL(config.WEB_ORIGIN);
    const actual = new URL(origin);
    const loopbacks = ["localhost", "127.0.0.1", "[::1]"];
    return (
      actual.origin === origin &&
      actual.protocol === expected.protocol &&
      actual.port === expected.port &&
      loopbacks.includes(actual.hostname) &&
      loopbacks.includes(expected.hostname)
    );
  } catch {
    return false;
  }
}
if (config.NODE_ENV === "production") {
  if (config.STORAGE_MODE === "local")
    throw new Error("Production requires persistent PostgreSQL storage");
  for (const name of [
    "SESSION_SECRET",
    "INGEST_TOKEN",
    "CONTROL_TOKEN",
    "DATABASE_URL",
    ...(config.STORAGE_MODE === "production" ? ["CLICKHOUSE_PASSWORD"] : []),
  ])
    if (
      !process.env[name] ||
      /replace|local_only|local-synthetic/.test(process.env[name]!)
    )
      throw new Error(`Set production ${name}`);
  if (!config.WEB_ORIGIN.startsWith("https://"))
    throw new Error("Production WEB_ORIGIN must use HTTPS");
  if (
    !process.env.DEMO_PASSWORD ||
    process.env.DEMO_PASSWORD === "Northstar-local-2026!" ||
    process.env.DEMO_PASSWORD.length < 12
  )
    throw new Error(
      "Set a unique production DEMO_PASSWORD of at least 12 characters",
    );
}
export const dataDir = process.env.DATA_DIR || ".data";
