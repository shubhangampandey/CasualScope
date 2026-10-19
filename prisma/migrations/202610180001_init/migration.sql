CREATE TABLE "StoredRecord" ("workspace" TEXT NOT NULL,"kind" TEXT NOT NULL,"id" TEXT NOT NULL,"data" JSONB NOT NULL,"updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("workspace","kind","id"));
CREATE INDEX "StoredRecord_workspace_kind_updated_idx" ON "StoredRecord"("workspace","kind","updated");
CREATE TABLE "FaultGroundTruth" ("workspace" TEXT NOT NULL,"id" TEXT NOT NULL,"data" JSONB NOT NULL, PRIMARY KEY("workspace","id"));
