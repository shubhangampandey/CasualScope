CREATE TABLE "TelemetrySpan" (
    "workspace" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "TelemetrySpan_pkey" PRIMARY KEY ("workspace", "environment", "traceId", "spanId")
);
CREATE INDEX "TelemetrySpan_workspace_environment_start_idx" ON "TelemetrySpan"("workspace", "environment", "start");
CREATE INDEX "TelemetrySpan_workspace_environment_traceId_start_idx" ON "TelemetrySpan"("workspace", "environment", "traceId", "start");
CREATE INDEX "TelemetrySpan_workspace_environment_service_start_idx" ON "TelemetrySpan"("workspace", "environment", "service", "start");
CREATE INDEX "TelemetrySpan_start_idx" ON "TelemetrySpan"("start");
CREATE TABLE "TelemetryLog" (
    "workspace" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "time" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "TelemetryLog_pkey" PRIMARY KEY ("workspace", "environment", "id")
);
CREATE INDEX "TelemetryLog_workspace_environment_time_idx" ON "TelemetryLog"("workspace", "environment", "time");
CREATE INDEX "TelemetryLog_workspace_environment_traceId_time_idx" ON "TelemetryLog"("workspace", "environment", "traceId", "time");
CREATE INDEX "TelemetryLog_time_idx" ON "TelemetryLog"("time");
