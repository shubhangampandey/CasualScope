import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Analysis, Span, Metric } from "./api.js";
import { ms, clock, number } from "./api.js";
import {
  ArrowUpRight,
  Layers,
  Link2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
export function Topology({
  analysis,
  selected,
  onSelect,
  at = Infinity,
}: {
  analysis: Analysis | null | undefined;
  selected?: string;
  onSelect?: (s: string) => void;
  at?: number;
}) {
  const [hover, setHover] = useState("");
  const [now, setNow] = useState(Date.now());
  const nodes = analysis?.nodes || [],
    edges = analysis?.edges || [];
  useEffect(() => {
    const last = Math.max(0, ...(analysis?.edges || []).map((e) => e.lastSeen));
    setNow(Date.now());
    if (Date.now() - last >= 3500) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time - last >= 3500) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [analysis?.id]);
  const positions: Record<string, [number, number]> = Object.assign(
    Object.create(null),
    {
      gateway: [80, 200],
      auth: [310, 70],
      order: [310, 270],
      cart: [545, 70],
      inventory: [545, 205],
      payment: [545, 340],
      catalog: [780, 70],
      notification: [780, 270],
    },
  );
  nodes
    .filter((n) => !positions[n])
    .forEach(
      (n, i) =>
        (positions[n] = [80 + (i % 4) * 230, 440 + Math.floor(i / 4) * 100]),
    );
  const active = selected || hover;
  const connected = new Set([
    active,
    ...edges
      .filter((e) => e.source === active || e.target === active)
      .flatMap((e) => [e.source, e.target]),
  ]);
  if (!nodes.length)
    return (
      <div className="graph-empty">
        <div className="scope-symbol">◎</div>
        <h3>Your system begins with a request.</h3>
        <p>
          Run a healthy workload in the Failure Laboratory.
          <br />
          The map will grow from captured service interactions.
        </p>
        <Link className="button dark" to="/app/lab">
          Generate real telemetry <ArrowUpRight size={15} />
        </Link>
      </div>
    );
  return (
    <div className="topology-wrap">
      <svg
        viewBox="0 0 970 440"
        className="topology"
        role="img"
        aria-label="Observed service dependency graph. Arrows point from caller to dependency."
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L8 4L0 8" fill="#8a8a8a" />
          </marker>
          <pattern
            id="dots"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#dedede" />
          </pattern>
        </defs>
        <rect width="970" height="440" fill="url(#dots)" />
        {edges.map((e) => {
          const [x, y] = positions[e.source] || [0, 0],
            [tx, ty] = positions[e.target] || [0, 0],
            dim =
              (active && !connected.has(e.source)) ||
              (active && !connected.has(e.target));
          return (
            <g key={e.source + e.target} opacity={dim ? 0.16 : 1}>
              <path
                d={`M${x + 130},${y} C${x + 185},${y} ${tx - 55},${ty} ${tx},${ty}`}
                fill="none"
                stroke={e.errors ? "#333" : "#aaa"}
                strokeWidth={e.errors ? 1.8 : 1}
                markerEnd="url(#arrow)"
              />
              <text
                x={(x + 130 + tx) / 2}
                y={(y + ty) / 2 - 9}
                fill="#777"
                fontSize="9"
                textAnchor="middle"
              >
                {e.calls} calls · {ms(e.p95)}
              </text>
              {now - e.lastSeen < 3500 && at === Infinity && (
                <path
                  className="traffic-pulse"
                  d={`M${x + 130},${y} C${x + 185},${y} ${tx - 55},${ty} ${tx},${ty}`}
                  fill="none"
                  stroke="#111"
                  strokeDasharray="5 200"
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
        {nodes.map((service) => {
          const [x, y] = positions[service]!,
            anomalies = analysis!.anomalies.filter(
              (a) => a.service === service && a.time <= at,
            ),
            bad = anomalies.length > 0,
            metric = analysis!.metrics
              .filter((m) => m.service === service && m.time <= at)
              .at(-1);
          return (
            <g
              key={service}
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${service}`}
              onClick={() => onSelect?.(service)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect?.(service);
              }}
              onMouseEnter={() => setHover(service)}
              onMouseLeave={() => setHover("")}
              className="service-node"
              opacity={active && !connected.has(service) ? 0.3 : 1}
            >
              <rect
                x={x}
                y={y - 27}
                width="130"
                height="54"
                fill={selected === service ? "#111" : "#fff"}
                stroke={bad ? "#111" : "#ccc"}
                strokeWidth={bad ? 1.5 : 1}
              />
              <rect
                x={x + 10}
                y={y - 12}
                width="5"
                height="5"
                fill={selected === service ? "white" : bad ? "#111" : "#aaa"}
              />
              <text
                x={x + 23}
                y={y - 7}
                fill={selected === service ? "white" : "#222"}
                fontSize="12"
                fontWeight="550"
              >
                {service}
              </text>
              <text
                x={x + 11}
                y={y + 13}
                fill={selected === service ? "#bbb" : "#777"}
                fontSize="9"
              >
                {metric
                  ? `${ms(metric.p95)} / ${number(metric.errorRate * 100, 1)}% err`
                  : "Observed service"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mobile-topology">
        {nodes.map((n) => (
          <button
            key={n}
            onClick={() => onSelect?.(n)}
            className={selected === n ? "selected" : ""}
          >
            <span>{n}</span>
            <span>
              {edges
                .filter((e) => e.source === n)
                .map((e) => e.target)
                .join(" · ") || "No observed outbound edge"}{" "}
              <ArrowUpRight size={12} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function MetricChart({
  metrics,
  service,
  field = "p95",
}: {
  metrics: Metric[];
  service?: string;
  field?: "p95" | "errorRate" | "throughput" | "dbWait" | "queueAge";
}) {
  const a = metrics.filter((m) => !service || m.service === service);
  const times = [...new Set(a.map((m) => m.time))].sort((a, b) => a - b);
  const points = times.map((time) => ({
    time,
    value: Math.max(
      0,
      ...a.filter((m) => m.time === time).map((m) => m[field]),
    ),
  }));
  if (!points.length)
    return (
      <div className="chart-empty">Waiting for observed metric windows</div>
    );
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.15,
    start = times[0]!,
    end = times.at(-1)!;
  const x = (t: number) =>
      48 + ((t - start) / Math.max(5000, end - start)) * 690,
    y = (v: number) => 175 - (v / max) * 140;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.time)} ${y(p.value)}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 780 220"
      className="metric-chart"
      role="img"
      aria-label={`${service || "Maximum across services"} ${field} over time`}
    >
      <title>
        {points
          .map((p) => `${clock(p.time)}: ${p.value.toFixed(2)}`)
          .join("; ")}
      </title>
      {[0, 0.5, 1].map((q) => (
        <g key={q}>
          <path
            d={`M48 ${y(q * max)}H740`}
            stroke="#e9e9e9"
            strokeDasharray={q ? "2 3" : undefined}
          />
          <text
            x="38"
            y={y(q * max) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#888"
          >
            {number(q * max, 1)}
          </text>
        </g>
      ))}
      <path
        d={`${path} L${x(points.at(-1)!.time)} 175 L48 175Z`}
        fill="#f2f2f2"
      />
      <path d={path} stroke="#222" strokeWidth="1.8" fill="none" />
      {points.map((p) => (
        <circle key={p.time} cx={x(p.time)} cy={y(p.value)} r="2" fill="#111">
          <title>
            {clock(p.time)} · {number(p.value, 2)}
          </title>
        </circle>
      ))}
      <text x="48" y="205" fill="#888" fontSize="10">
        {clock(start)}
      </text>
      <text x="740" y="205" textAnchor="end" fill="#888" fontSize="10">
        {clock(end)}
      </text>
    </svg>
  );
}
export function Waterfall({
  spans,
  selected,
  onSelect,
}: {
  spans: Span[];
  selected?: string;
  onSelect: (s: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sorted = useMemo(
    () => [...spans].sort((a, b) => a.start - b.start),
    [spans],
  );
  const start = Math.min(...spans.map((s) => s.start)),
    duration = Math.max(...spans.map((s) => s.end)) - start;
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  function depth(s: Span) {
    let d = 0,
      p = s.parentSpanId;
    const seen = new Set<string>();
    while (p && byId.has(p) && !seen.has(p) && d < 20) {
      seen.add(p);
      p = byId.get(p)!.parentSpanId;
      d++;
    }
    return d;
  }
  const visible = sorted.filter((s) => {
    let p = s.parentSpanId;
    const seen = new Set<string>();
    while (p && byId.has(p) && !seen.has(p)) {
      if (collapsed.has(p)) return false;
      seen.add(p);
      p = byId.get(p)!.parentSpanId;
    }
    return true;
  });
  return (
    <>
      <div className="waterfall-tools">
        <span>
          <Layers size={14} /> {spans.length} captured spans · {ms(duration)}{" "}
          wall time
        </span>
        <label>
          Zoom{" "}
          <input
            aria-label="Waterfall zoom"
            type="range"
            min="1"
            max="5"
            step=".2"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="waterfall-scroll">
        <div
          className="waterfall"
          style={{ minWidth: 600 * zoom }}
          tabIndex={0}
          aria-label="Span waterfall. Use arrow keys to inspect spans."
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const current = visible.findIndex((s) => s.spanId === selected),
                next = Math.max(
                  0,
                  Math.min(
                    visible.length - 1,
                    current + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                );
              if (visible[next]) onSelect(visible[next]!.spanId);
            }
          }}
        >
          <div className="waterfall-ruler">
            <span>Operation / service</span>
            <span>0</span>
            <span>{ms(duration / 2)}</span>
            <span>{ms(duration)}</span>
          </div>
          {visible.map((s) => (
            <div className="span-line" key={s.spanId}>
              {spans.some((c) => c.parentSpanId === s.spanId) ? (
                <button
                  className="span-fold"
                  aria-label={`${collapsed.has(s.spanId) ? "Expand" : "Collapse"} ${s.service} ${s.name}`}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(s.spanId)) next.delete(s.spanId);
                      else next.add(s.spanId);
                      return next;
                    })
                  }
                >
                  {collapsed.has(s.spanId) ? (
                    <ChevronRight size={10} />
                  ) : (
                    <ChevronDown size={10} />
                  )}
                </button>
              ) : (
                <span className="span-fold" />
              )}
              <button
                key={s.spanId}
                className={`span-row ${selected === s.spanId ? "selected" : ""}`}
                onClick={() => onSelect(s.spanId)}
                title={`${s.service}: ${s.name} — ${ms(s.duration)}`}
              >
                <span
                  className="span-name"
                  style={{ paddingLeft: 12 + depth(s) * 12 }}
                >
                  {s.status === 2 ? (
                    <AlertTriangle size={10} />
                  ) : s.links.length ? (
                    <Link2 size={10} />
                  ) : (
                    <span className="tiny-square" />
                  )}
                  <b>{s.service}</b>
                  <small>{s.name}</small>
                </span>
                <span className="span-track">
                  <span
                    className={`span-bar ${s.status === 2 ? "error" : ""}`}
                    style={{
                      left: `${Math.max(0, ((s.start - start) / Math.max(1, duration)) * 100)}%`,
                      width: `${Math.max(0.4, (s.duration / Math.max(1, duration)) * 100)}%`,
                    }}
                  />
                  <span className="span-duration">{ms(s.duration)}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
