CREATE DATABASE IF NOT EXISTS causalscope;
CREATE TABLE IF NOT EXISTS causalscope.otel_spans (
  workspace LowCardinality(String), environment LowCardinality(String),
  traceId String, spanId String, service LowCardinality(String),
  start Float64, ingested Float64, data String,
  event_date Date DEFAULT toDate(fromUnixTimestamp64Milli(toInt64(start)))
) ENGINE=ReplacingMergeTree(ingested)
PARTITION BY event_date ORDER BY (workspace,environment,traceId,spanId)
TTL event_date + INTERVAL 7 DAY DELETE;
CREATE TABLE IF NOT EXISTS causalscope.correlated_logs (
  workspace LowCardinality(String), environment LowCardinality(String),
  id String, time Float64, data String,
  event_date Date DEFAULT toDate(fromUnixTimestamp64Milli(toInt64(time)))
) ENGINE=ReplacingMergeTree
PARTITION BY event_date ORDER BY (workspace,environment,id)
TTL event_date + INTERVAL 7 DAY DELETE;
