import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { createClient } from "@clickhouse/client";
import { PrismaClient } from "@prisma/client";
import { config, dataDir } from "../shared/config.js";
import type { Span, Log } from "../shared/index.js";
export interface RecordValue {
  id: string;
  [key: string]: unknown;
}
export type TelemetryQuery = {
  workspace: string;
  environment: string;
  start: number;
  end: number;
  traceId?: string;
  service?: string;
  limit?: number;
};
export class Store {
  private db?: DatabaseSync;
  private prisma?: PrismaClient;
  private ch?: ReturnType<typeof createClient>;
  constructor(mode = config.STORAGE_MODE, path = dataDir) {
    if (mode === "local") {
      mkdirSync(path, { recursive: true });
      this.db = new DatabaseSync(`${path}/causalscope.sqlite`);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(workspace TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,updated REAL NOT NULL,PRIMARY KEY(workspace,kind,id));
      CREATE TABLE IF NOT EXISTS spans(workspace TEXT NOT NULL,environment TEXT NOT NULL,traceId TEXT NOT NULL,spanId TEXT NOT NULL,service TEXT NOT NULL,start REAL NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace,environment,traceId,spanId));
      CREATE INDEX IF NOT EXISTS spans_time ON spans(workspace,environment,start); CREATE INDEX IF NOT EXISTS spans_trace ON spans(workspace,environment,traceId);
      CREATE TABLE IF NOT EXISTS logs(workspace TEXT NOT NULL,environment TEXT NOT NULL,id TEXT NOT NULL,time REAL NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace,environment,id));
      CREATE TABLE IF NOT EXISTS ground_truth(workspace TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace,id));`);
    } else {
      this.prisma = new PrismaClient();
      this.ch = createClient({
        url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
        username: process.env.CLICKHOUSE_USER || "causalscope",
        password: process.env.CLICKHOUSE_PASSWORD,
        database: "causalscope",
        request_timeout: 10000,
        clickhouse_settings: {
          max_execution_time: 8,
          max_result_rows: "50000",
          result_overflow_mode: "throw",
        },
      });
    }
  }
  async put<T extends { id: string }>(
    workspace: string,
    kind: string,
    value: T,
  ) {
    if (this.db)
      this.db
        .prepare(
          "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(workspace,kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated",
        )
        .run(workspace, kind, value.id, JSON.stringify(value), Date.now());
    else
      await this.prisma!.storedRecord.upsert({
        where: { workspace_kind_id: { workspace, kind, id: value.id } },
        create: {
          workspace,
          kind,
          id: value.id,
          data: JSON.parse(JSON.stringify(value)),
        },
        update: { data: JSON.parse(JSON.stringify(value)) },
      });
    return value;
  }
  async get<T>(
    workspace: string,
    kind: string,
    id: string,
  ): Promise<T | undefined> {
    if (this.db) {
      const row = this.db
        .prepare(
          "SELECT data FROM records WHERE workspace=? AND kind=? AND id=?",
        )
        .get(workspace, kind, id);
      return row ? (JSON.parse(row.data as string) as T) : undefined;
    }
    const row = await this.prisma!.storedRecord.findUnique({
      where: { workspace_kind_id: { workspace, kind, id } },
    });
    return row?.data as T | undefined;
  }
  async list<T>(workspace: string, kind: string, limit = 200): Promise<T[]> {
    if (this.db)
      return this.db
        .prepare(
          "SELECT data FROM records WHERE workspace=? AND kind=? ORDER BY updated DESC LIMIT ?",
        )
        .all(workspace, kind, Math.min(500, limit))
        .map((r) => JSON.parse(r.data as string) as T);
    const rows = await this.prisma!.storedRecord.findMany({
      where: { workspace, kind },
      orderBy: { updated: "desc" },
      take: Math.min(500, limit),
    });
    return rows.map((r) => r.data as T);
  }
  async remove(workspace: string, kind: string, id: string) {
    if (this.db)
      this.db
        .prepare("DELETE FROM records WHERE workspace=? AND kind=? AND id=?")
        .run(workspace, kind, id);
    else
      await this.prisma!.storedRecord.deleteMany({
        where: { workspace, kind, id },
      });
  }
  async insertSpans(spans: Span[]) {
    if (!spans.length) return;
    if (this.db) {
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO spans VALUES(?,?,?,?,?,?,?)",
      );
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (const s of spans)
          insert.run(
            s.workspace,
            s.environment,
            s.traceId,
            s.spanId,
            s.service,
            s.start,
            JSON.stringify(s),
          );
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    } else
      await this.ch!.insert({
        table: "otel_spans",
        values: spans.map((s) => ({
          workspace: s.workspace,
          environment: s.environment,
          traceId: s.traceId,
          spanId: s.spanId,
          service: s.service,
          start: s.start,
          ingested: s.ingested,
          data: JSON.stringify(s),
        })),
        format: "JSONEachRow",
      });
  }
  async spans(q: TelemetryQuery): Promise<Span[]> {
    const limit = Math.min(q.limit || 30000, 50000);
    if (this.db) {
      let sql =
        "SELECT data FROM spans WHERE workspace=? AND environment=? AND start>=? AND start<=?";
      const args: (string | number)[] = [
        q.workspace,
        q.environment,
        q.start,
        q.end,
      ];
      if (q.traceId) {
        sql += " AND traceId=?";
        args.push(q.traceId);
      }
      if (q.service) {
        sql += " AND service=?";
        args.push(q.service);
      }
      sql += " ORDER BY start DESC LIMIT ?";
      args.push(limit);
      return this.db
        .prepare(sql)
        .all(...args)
        .map((r) => JSON.parse(r.data as string) as Span);
    }
    const result = await this.ch!.query({
      query: `SELECT data FROM otel_spans FINAL WHERE workspace={workspace:String} AND environment={environment:String} AND start>={start:Float64} AND start<={end:Float64} ${q.traceId ? "AND traceId={traceId:String}" : ""} ${q.service ? "AND service={service:String}" : ""} ORDER BY start DESC LIMIT {limit:UInt32}`,
      query_params: { ...q, limit },
      format: "JSONEachRow",
    });
    return (await result.json<{ data: string }>()).map(
      (r) => JSON.parse(r.data) as Span,
    );
  }
  async insertLogs(logs: Log[]) {
    if (!logs.length) return;
    if (this.db) {
      const stmt = this.db.prepare(
        "INSERT OR IGNORE INTO logs VALUES(?,?,?,?,?)",
      );
      for (const l of logs)
        stmt.run(l.workspace, l.environment, l.id, l.time, JSON.stringify(l));
    } else
      await this.ch!.insert({
        table: "correlated_logs",
        values: logs.map((l) => ({
          workspace: l.workspace,
          environment: l.environment,
          id: l.id,
          time: l.time,
          data: JSON.stringify(l),
        })),
        format: "JSONEachRow",
      });
  }
  async logs(q: TelemetryQuery): Promise<Log[]> {
    let result: Log[];
    if (this.db)
      result = this.db
        .prepare(
          "SELECT data FROM logs WHERE workspace=? AND environment=? AND time>=? AND time<=? ORDER BY time DESC LIMIT 3000",
        )
        .all(q.workspace, q.environment, q.start, q.end)
        .map((r) => JSON.parse(r.data as string));
    else {
      const r = await this.ch!.query({
        query:
          "SELECT data FROM correlated_logs FINAL WHERE workspace={workspace:String} AND environment={environment:String} AND time>={start:Float64} AND time<={end:Float64} ORDER BY time DESC LIMIT 3000",
        query_params: q,
        format: "JSONEachRow",
      });
      result = (await r.json<{ data: string }>()).map((r) =>
        JSON.parse(r.data),
      );
    }
    return result.filter(
      (l) =>
        (!q.traceId || l.traceId === q.traceId) &&
        (!q.service || l.service === q.service),
    );
  }
  // Experiment/evaluator only. The analysis package never imports this method.
  async truth(
    workspace: string,
    id: string,
    value?: unknown,
  ): Promise<{ target: string; fault: string; seed: number } | undefined> {
    if (this.db) {
      if (value)
        this.db
          .prepare("INSERT OR REPLACE INTO ground_truth VALUES(?,?,?)")
          .run(workspace, id, JSON.stringify(value));
      const row = this.db
        .prepare("SELECT data FROM ground_truth WHERE workspace=? AND id=?")
        .get(workspace, id);
      return row ? JSON.parse(row.data as string) : undefined;
    }
    if (value)
      await this.prisma!.faultGroundTruth.upsert({
        where: { workspace_id: { workspace, id } },
        create: { workspace, id, data: JSON.parse(JSON.stringify(value)) },
        update: { data: JSON.parse(JSON.stringify(value)) },
      });
    const row = await this.prisma!.faultGroundTruth.findUnique({
      where: { workspace_id: { workspace, id } },
    });
    return row?.data as
      { target: string; fault: string; seed: number } | undefined;
  }
  async prune() {
    if (this.db) {
      const cutoff = Date.now() - config.RETENTION_DAYS * 86400000;
      this.db.prepare("DELETE FROM spans WHERE start<?").run(cutoff);
      this.db.prepare("DELETE FROM logs WHERE time<?").run(cutoff);
    }
  }
  async health() {
    if (this.db) {
      this.db.prepare("SELECT 1").get();
      return {
        mode: "local",
        metadata: "SQLite",
        telemetry: "SQLite",
        collector: "not required in direct SDK mode",
      };
    }
    await this.prisma!.$queryRaw`SELECT 1`;
    const h = await this.ch!.ping();
    if (!h.success) throw new Error("ClickHouse unavailable");
    return {
      mode: "production",
      metadata: "PostgreSQL",
      telemetry: "ClickHouse",
      collector: "configured separately",
    };
  }
  async close() {
    this.db?.close();
    await this.prisma?.$disconnect();
    await this.ch?.close();
  }
}
