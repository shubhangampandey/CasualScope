import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
import { span } from "../fixtures.js";
import type { Log } from "../../packages/shared/index.js";

describe.skipIf(!process.env.POSTGRES_TEST_URL)(
  "PostgreSQL telemetry storage",
  () => {
    const workspace = `deployment-check-${randomUUID()}`;
    const otherWorkspace = `deployment-check-${randomUUID()}`;
    const accountId = `registration-check-${randomUUID()}`;
    let store: Store;
    let database: PrismaClient;
    beforeAll(() => {
      process.env.DATABASE_URL = process.env.POSTGRES_TEST_URL;
      store = new Store("postgres");
      database = new PrismaClient();
    });
    afterAll(async () => {
      if (!database) return;
      await database.telemetrySpan.deleteMany({
        where: { workspace: { in: [workspace, otherWorkspace] } },
      });
      await database.telemetryLog.deleteMany({
        where: { workspace: { in: [workspace, otherWorkspace] } },
      });
      await database.storedRecord.deleteMany({
        where: {
          OR: [
            { workspace: { in: [workspace, otherWorkspace] } },
            { workspace: "system", kind: "user", id: accountId },
          ],
        },
      });
      await store.close();
      await database.$disconnect();
    });
    it("creates accounts atomically and looks up normalized email in PostgreSQL", async () => {
      const user = {
        id: accountId,
        name: "Postgres Registration",
        email: `${accountId}@example.test`,
        password: "test-only-hash",
      };
      await store.createAccount(user, {
        id: workspace,
        name: "Postgres Workspace",
      });
      expect(await store.userByEmail(` ${user.email.toUpperCase()} `)).toEqual(
        user,
      );
      expect(await store.userByEmail("missing@example.test")).toBeUndefined();
      await expect(
        store.createAccount(user, {
          id: otherWorkspace,
          name: "Must roll back",
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      expect(
        await store.get(otherWorkspace, "workspace", otherWorkspace),
      ).toBeUndefined();
    });
    it("deduplicates spans and enforces tenant, environment, trace, service and time filters", async () => {
      const observation = span({
        workspace,
        environment: "verification",
        service: "inventory",
      });
      await store.insertSpans([
        observation,
        observation,
        { ...observation, workspace: otherWorkspace },
        { ...observation, environment: "other" },
        { ...observation, spanId: "2".repeat(16), service: "payment" },
      ]);
      const query = {
        workspace,
        environment: "verification",
        start: observation.start - 1,
        end: observation.start + 1,
        traceId: observation.traceId,
        service: "inventory",
      };
      expect(await store.spans(query)).toEqual([observation]);
      expect(await store.spans({ ...query, traceId: "f".repeat(32) })).toEqual(
        [],
      );
      expect(
        await store.spans({
          ...query,
          start: observation.start + 1,
          end: observation.start + 2,
        }),
      ).toEqual([]);
      expect(
        await store.spans({ ...query, service: undefined, limit: 1 }),
      ).toHaveLength(1);
    });
    it("deduplicates correlated logs and keeps environment and tenant boundaries", async () => {
      const observation: Log = {
        id: randomUUID(),
        workspace,
        environment: "verification",
        traceId: "a".repeat(32),
        spanId: "1".repeat(16),
        service: "inventory",
        time: Date.now(),
        level: "info",
        message: "Deployment storage check",
      };
      await store.insertLogs([
        observation,
        observation,
        { ...observation, workspace: otherWorkspace },
        { ...observation, environment: "other" },
      ]);
      const query = {
        workspace,
        environment: "verification",
        start: observation.time - 1,
        end: observation.time + 1,
        traceId: observation.traceId,
        service: "inventory",
      };
      expect(await store.logs(query)).toEqual([observation]);
      expect(await store.logs({ ...query, service: "payment" })).toEqual([]);
      expect(await store.logs({ ...query, traceId: "f".repeat(32) })).toEqual(
        [],
      );
    });
    it("prunes expired telemetry and reports the actual persistent storage mode", async () => {
      const old = Date.now() - (config.RETENTION_DAYS + 1) * 86400000;
      await store.insertSpans([
        span({ workspace, environment: "retention", start: old }),
      ]);
      await store.prune();
      expect(
        await store.spans({
          workspace,
          environment: "retention",
          start: 0,
          end: Date.now(),
        }),
      ).toEqual([]);
      expect((await store.health()).telemetry).toBe("PostgreSQL");
    });
  },
);
