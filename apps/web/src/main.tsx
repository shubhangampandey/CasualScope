import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
  Navigate,
  Outlet,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Box,
  Braces,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  Download,
  FlaskConical,
  GitBranch,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Square,
  Terminal,
  TriangleAlert,
  X,
  SkipBack,
  SkipForward,
  FileText,
  Radio,
  ScanLine,
} from "lucide-react";
import {
  api,
  setCSRF,
  number,
  clock,
  ms,
  type Analysis,
  type Incident,
  type Experiment,
  type Evaluation,
  type Span,
  type Log,
  type TraceRow,
} from "./api.js";
import {
  services,
  faults,
  type ExperimentConfig,
} from "../../../packages/shared/index.js";
import { Topology, MetricChart, Waterfall } from "./visuals.js";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 3000, refetchOnWindowFocus: false },
  },
});
type Me = {
  user: {
    name: string;
    email: string;
    memberships: { workspace: string; role: string }[];
  };
  csrf: string;
  workspace: string;
  environment: string;
  role: string;
};
const Feedback = createContext<(s: string) => void>(() => {});
function useFeedback() {
  return useContext(Feedback);
}
const nav: {
  section: string;
  items: readonly (readonly [string, string, typeof Activity])[];
}[] = [
  {
    section: "OBSERVE",
    items: [
      ["overview", "Overview", LayoutDashboard],
      ["services", "Service map", Network],
      ["traces", "Trace explorer", Layers],
      ["metrics", "Metrics", Activity],
      ["events", "Event explorer", Terminal],
    ],
  },
  {
    section: "INVESTIGATE",
    items: [
      ["incidents", "Incident center", CircleDot],
      ["replay", "Replay studio", ScanLine],
      ["hypotheses", "Hypotheses", GitBranch],
    ],
  },
  {
    section: "EXPERIMENT",
    items: [
      ["lab", "Failure laboratory", FlaskConical],
      ["compare", "Counterfactual lab", Box],
      ["evaluations", "Evaluation center", ChartNoAxesCombined],
      ["analytics", "Analytics", ChartNoAxesCombined],
    ],
  },
  {
    section: "WORKSPACE",
    items: [
      ["developers", "Developer center", Braces],
      ["settings", "Settings", Settings2],
    ],
  },
];
const titles: Record<string, [string, string]> = {
  overview: [
    "Operations overview",
    "A clear view of what your system is telling you.",
  ],
  services: [
    "Service map",
    "Observed interactions. Every connection has a trace.",
  ],
  traces: ["Trace explorer", "Follow a request across the system."],
  metrics: ["Metrics explorer", "Measured behavior, placed in context."],
  events: ["Event explorer", "Structured logs and execution evidence."],
  incidents: [
    "Incident center",
    "Move from symptoms to a defensible explanation.",
  ],
  replay: [
    "Incident replay studio",
    "Reconstruct the sequence. Preserve the uncertainty.",
  ],
  hypotheses: [
    "Root cause explorer",
    "Explanations ranked by observable evidence.",
  ],
  lab: [
    "Failure laboratory",
    "Controlled failures. Real distributed telemetry.",
  ],
  compare: ["Counterfactual lab", "One workload. One controlled change."],
  evaluations: ["Evaluation center", "Measure the investigator, too."],
  analytics: [
    "System analytics",
    "Actual measurements from completed investigations.",
  ],
  developers: [
    "Developer center",
    "Instrument once. Investigate with evidence.",
  ],
  settings: [
    "Workspace settings",
    "The boundaries and configuration of this workspace.",
  ],
};
function Logo() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <i />
        <i />
        <i />
      </span>
      CausalScope<span className="brand-dot">.</span>
    </span>
  );
}
function Empty({
  title = "No observations yet",
  text = "Generate a healthy workload to begin collecting real evidence.",
  action = true,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  return (
    <div className="empty">
      <ScanLine size={27} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Link className="button" to="/app/lab">
          Open failure laboratory <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span />
      Loading persisted evidence…
    </div>
  );
}
function ErrorState({ error }: { error: Error }) {
  return (
    <div className="error-banner">
      <TriangleAlert size={15} />
      {error.message}
    </div>
  );
}
function Badge({
  children,
  solid = false,
}: {
  children: React.ReactNode;
  solid?: boolean;
}) {
  return <span className={`badge ${solid ? "solid" : ""}`}>{children}</span>;
}
function Panel({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        <div className="panel-meta">{meta}</div>
      </div>
      {children}
    </section>
  );
}
function useAnalysis(id?: string) {
  return useQuery({
    queryKey: ["analysis", id],
    queryFn: () => api<Analysis | null>(`analysis${id ? `?id=${id}` : ""}`),
  });
}
function traceLink(trace: string, analysis?: Analysis | null) {
  return `/app/traces?trace=${trace}${analysis ? `&start=${analysis.start}&end=${analysis.end}` : ""}`;
}
function Landing() {
  return (
    <div className="landing">
      <header>
        <Link to="/">
          <Logo />
        </Link>
        <nav>
          <a href="#approach">The approach</a>
          <a href="#architecture">Architecture</a>
          <Link className="button dark" to="/app">
            Enter workspace <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <main>
        <div className="landing-eyebrow">
          <span className="tiny-square" /> DISTRIBUTED SYSTEMS · INCIDENT
          INTELLIGENCE
        </div>
        <h1>
          See the failure
          <br />
          behind the <span>failure.</span>
        </h1>
        <div className="landing-intro">
          <p>
            Symptoms travel. Evidence stays.
            <br />
            Reconstruct distributed incidents from traces, measured behavior,
            and the relationships between them.
          </p>
          <Link className="button dark large" to="/app">
            From symptoms to evidence <ArrowRight size={18} />
          </Link>
        </div>
        <div
          className="architecture-art"
          aria-label="Conceptual architecture, not live telemetry"
        >
          <div>
            <span>01 / OBSERVE</span>
            <b>
              Traces.
              <br />
              Not just symptoms.
            </b>
            <small>OpenTelemetry → Collector → storage</small>
          </div>
          <div className="art-lines">
            ┄┄┄
            <CircleDot size={60} strokeWidth={0.6} />
            ┄┄┄
          </div>
          <div>
            <span>02 / RECONSTRUCT</span>
            <b>
              Relationships.
              <br />
              Not assumptions.
            </b>
            <small>Structural order → anomalies → hypotheses</small>
          </div>
          <div className="art-caption">
            CONCEPTUAL SYSTEM ARCHITECTURE · LIVE EVIDENCE APPEARS IN YOUR
            WORKSPACE
          </div>
        </div>
        <section id="approach" className="landing-section">
          <span className="eyebrow">BUILT FOR INVESTIGATION</span>
          <h2>
            A better question
            <br />
            than “what went wrong?”
          </h2>
          <div className="landing-columns">
            {[
              [
                "01",
                "Follow the request",
                "Cross service boundaries with propagated context. Inspect actual timing, exceptions, and linked asynchronous operations.",
              ],
              [
                "02",
                "Reconstruct the incident",
                "Compare a historical baseline with measured degradation. Replay persisted observations without inventing a sequence.",
              ],
              [
                "03",
                "Challenge the hypothesis",
                "Run bounded synthetic experiments. Compare explainable graph ranking with a simple statistical baseline.",
              ],
            ].map(([n, h, p]) => (
              <article key={n}>
                <span className="mono">{n}</span>
                <h3>{h}</h3>
                <p>{p}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="architecture"
          className="landing-section architecture-bottom"
        >
          <div>
            <span className="eyebrow">ENGINEERING, IN THE OPEN</span>
            <h2>
              Evidence before
              <br />
              explanation.
            </h2>
            <p>
              OpenTelemetry. PostgreSQL. ClickHouse.
              <br />
              Deterministic analysis. Optional AI.
              <br />A synthetic commerce system you can actually break.
            </p>
          </div>
          <div className="architecture-list">
            {[
              "Acquire · W3C trace context",
              "Persist · tenant-scoped observations",
              "Analyze · MAD / EWMA / CUSUM",
              "Investigate · ranked hypotheses",
              "Validate · controlled experiments",
            ].map((t, i) => (
              <div key={t}>
                <span>0{i + 1}</span>
                {t}
                <ArrowRight size={14} />
              </div>
            ))}
            <Link className="button dark" to="/app">
              Open the local workspace <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </main>
      <footer>
        <Logo />
        <span>From symptoms to evidence.</span>
        <span>LOCAL ENGINEERING EDITION / 0.1</span>
      </footer>
    </div>
  );
}
function Login() {
  const [registering, setRegistering] = useState(false),
    [name, setName] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const qc = useQueryClient(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => {
      if (registering && password !== confirmation)
        throw new Error("Passwords do not match.");
      return api<{ csrf: string }>(
        registering ? "auth/register" : "auth/login",
        { email, password, ...(registering ? { name } : {}) },
      );
    },
    onSuccess: (r) => {
      setCSRF(r.csrf);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="login">
      <Link to="/">
        <Logo />
      </Link>
      <div className="login-card">
        <span className="eyebrow">NORTHSTAR ENGINEERING</span>
        <h1>
          Welcome to
          <br />
          your investigation.
        </h1>
        <p>
          {registering
            ? "Create your own isolated synthetic workspace. Passwords need at least 14 characters."
            : "Sign in with your registered account. Demo passwords differ between local and production environments."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          {registering && (
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={registering ? 14 : 1}
              maxLength={200}
              autoComplete={registering ? "new-password" : "current-password"}
            />
          </label>
          {registering && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={14}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
          )}
          {m.error && <ErrorState error={m.error} />}
          <button className="button dark" disabled={m.isPending}>
            {registering ? "Create account" : "Enter workspace"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
        <button
          type="button"
          className="button"
          disabled={m.isPending}
          onClick={() => {
            setRegistering(!registering);
            setPassword("");
            setConfirmation("");
            m.reset();
          }}
        >
          {registering
            ? "Already registered? Sign in"
            : "New here? Create an account"}
        </button>
      </div>
      <div className="login-footer">
        OBSERVATION → CORRELATION → HYPOTHESIS → EXPERIMENT
      </div>
    </div>
  );
}
function Shell() {
  const qc = useQueryClient(),
    me = useQuery({
      queryKey: ["me"],
      queryFn: () =>
        api<(Me & { workspaceName: string }) | null>("auth/session"),
      retry: false,
    }),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),
    [command, setCommand] = useState(false),
    [search, setSearch] = useState("");
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    if (me.data) setCSRF(me.data.csrf);
  }, [me.data]);
  useEffect(() => {
    if (!me.data) return;
    const source = new EventSource("/api/v1/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener("update", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of [
          "analysis",
          "experiments",
          "incidents",
          "evaluations",
          "comparisons",
          "logs",
          "traces",
        ])
          void qc.invalidateQueries({ queryKey: [key] });
      }, 300);
    });
    return () => {
      source.close();
      clearTimeout(timer);
    };
  }, [me.data, qc]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommand((x) => !x);
      }
      if (e.key === "Escape") {
        setCommand(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  if (me.isPending) return <Loading />;
  if (me.isError) return <ErrorState error={me.error} />;
  if (!me.data) return <Login />;
  const key = location.pathname.split("/")[2] || "overview",
    [title, subtitle] = titles[key] || titles.overview!;
  return (
    <Feedback.Provider value={setNotice}>
      <div className="app-shell">
        <aside className={`sidebar ${mobile ? "open" : ""}`}>
          <Link to="/" className="sidebar-brand">
            <Logo />
          </Link>
          <button
            className="workspace-switch"
            onClick={() => navigate("/app/settings")}
          >
            <div className="workspace-letter">N</div>
            <span>
              <b>{me.data.workspaceName}</b>
              <small>Commerce · synthetic</small>
            </span>
            <ChevronDown size={13} />
          </button>
          <button className="search-trigger" onClick={() => setCommand(true)}>
            <Search size={14} />
            Find your way<span>⌘ K</span>
          </button>
          <nav>
            {nav.map((group) => (
              <div className="nav-group" key={group.section}>
                <span>{group.section}</span>
                {group.items.map(([path, label, Icon]) => (
                  <NavLink key={path} to={`/app/${path}`}>
                    <Icon size={15} />
                    {label}
                    {path === "replay" && <small>STUDIO</small>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="avatar">NE</div>
            <div>
              <b>{me.data.user.name}</b>
              <small>{me.data.role} · local workspace</small>
            </div>
            <button
              aria-label="Sign out"
              onClick={() =>
                void api("auth/logout", {}).then(() => {
                  qc.clear();
                  location;
                  window.location.href = "/";
                })
              }
            >
              <LogOut size={14} />
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="app-body">
          <header className="topbar">
            <div>
              <button
                className="mobile-menu icon-button"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={18} />
              </button>
              <span className="crumb">Workspace</span>
              <ChevronRight size={12} />
              <span>{title}</span>
            </div>
            <div>
              <span className="environment-label">
                <span className="tiny-square" /> Northstar Commerce
              </span>
              <Badge>SYNTHETIC</Badge>
            </div>
          </header>
          <main className="app-main">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {key === "overview"
                    ? "SYSTEM INTELLIGENCE"
                    : key === "lab" || key === "compare"
                      ? "CONTROLLED EXPERIMENTATION"
                      : "CAUSALSCOPE / NORTHSTAR"}
                </span>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
              <span className="edition">
                ENGINEERING EDITION <span>v0.1</span>
              </span>
            </div>
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>
              <Shield size={12} /> Evidence-driven. Causality requires
              verification.
            </span>
            <span>NORTHSTAR / LOCAL SYNTHETIC ENVIRONMENT</span>
          </footer>
        </div>
      </div>
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="toast"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CircleDot size={16} />
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {command && (
        <div className="modal-backdrop" onClick={() => setCommand(false)}>
          <div
            className="command-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Navigate workspace"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <Search size={18} />
              <input
                autoFocus
                placeholder="Go to a workspace page…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                aria-label="Close command menu"
                onClick={() => setCommand(false)}
              >
                <X size={17} />
              </button>
            </div>
            {nav
              .flatMap((g) => g.items)
              .filter(([, label]) =>
                label.toLowerCase().includes(search.toLowerCase()),
              )
              .map(([path, label, Icon]) => (
                <button
                  key={path}
                  onClick={() => {
                    navigate(`/app/${path}`);
                    setCommand(false);
                    setSearch("");
                  }}
                >
                  <Icon size={16} />
                  {label}
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
        </div>
      )}
    </Feedback.Provider>
  );
}
function Overview() {
  const { data: a, isPending, error } = useAnalysis(),
    incidents = useQuery({
      queryKey: ["incidents"],
      queryFn: () => api<Incident[]>("incidents"),
    }),
    [selected, setSelected] = useState(""),
    notify = useFeedback(),
    qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => api<Analysis>("analysis", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analysis"] });
      notify("Analysis recomputed from persisted observations.");
    },
    onError: (e) => notify(e.message),
  });
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const metrics = a?.metrics || [],
    latest = metrics.length ? Math.max(...metrics.map((m) => m.time)) : 0,
    recent = metrics.filter((m) => m.time === latest),
    count = recent.reduce((n, m) => n + m.count, 0),
    errors = recent.reduce((n, m) => n + m.errors, 0);
  return (
    <>
      <div className="toolbar">
        <span className="live-label">
          <Radio size={13} />{" "}
          {a ? `Observed through ${clock(a.end)}` : "Awaiting telemetry"}
        </span>
        <div>
          <span className="range-label">5-minute analysis window</span>
          <button
            className="button"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw size={13} className={refresh.isPending ? "spin" : ""} />
            Analyze now
          </button>
        </div>
      </div>
      <div className="stats-row">
        {[
          [
            "Observed services",
            number(a?.nodes.length || 0),
            "Discovered from received spans",
          ],
          [
            "Active incidents",
            number(
              incidents.data?.filter((i) => i.status !== "resolved").length ||
                0,
            ),
            "Open investigation records",
          ],
          [
            "Server throughput",
            `${number(
              recent.reduce((n, m) => n + m.throughput, 0),
              1,
            )}/s`,
            "Latest 5-second observation window",
          ],
          [
            "Observed error rate",
            `${number(count ? (errors / count) * 100 : 0, 1)}%`,
            "Received server spans / latest window",
          ],
        ].map(([label, value, sub], i) => (
          <div className="stat" key={label}>
            <span>
              {label}
              <span className="stat-index">0{i + 1}</span>
            </span>
            <strong>{value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <Panel
        title="The observed system"
        meta={
          <>
            <span className="legend">
              <i />
              Observed dependency
            </span>
            <Link to="/app/services">
              Explore map <ArrowUpRight size={13} />
            </Link>
          </>
        }
      >
        <Topology analysis={a} selected={selected} onSelect={setSelected} />
        <div className="graph-footer">
          <span>
            {a?.edges.length || 0} observed connections · arrows follow call
            direction
          </span>
          <span>
            {selected
              ? `Inspecting ${selected}`
              : "Select a service to isolate its neighborhood"}
          </span>
        </div>
      </Panel>
      <div className="two-columns">
        <Panel
          title="Latency, in context"
          meta={
            <Link to="/app/metrics">
              Metrics <ArrowUpRight size={12} />
            </Link>
          }
        >
          <div className="chart-heading">
            <span>MAXIMUM SERVICE p95</span>
            <strong>{ms(Math.max(0, ...recent.map((m) => m.p95)))}</strong>
            <small>5-second buckets · milliseconds</small>
          </div>
          <MetricChart metrics={metrics} />
        </Panel>
        <Panel
          title="Investigation queue"
          meta={<Badge>{incidents.data?.length || 0} records</Badge>}
        >
          {incidents.data?.length ? (
            <div className="incident-list">
              {incidents.data.slice(0, 4).map((i) => (
                <Link key={i.id} to={`/app/incidents?id=${i.id}`}>
                  <span className="incident-mark">!</span>
                  <div>
                    <b>{i.name}</b>
                    <small>
                      {i.services.slice(0, 3).join(" / ")} · {clock(i.start)}
                    </small>
                  </div>
                  <Badge solid={i.status !== "resolved"}>{i.status}</Badge>
                  <ArrowUpRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="No active investigations"
              text="Detected anomalies will appear here. You can also open an investigation manually."
              action={false}
            />
          )}
        </Panel>
      </div>
      {a && (
        <div className="quality-strip">
          <Shield size={15} />
          <span>
            {a.spanCount} stored spans · {a.quality.missingParents} missing
            parents · {a.quality.skew} clock-skew warnings
          </span>
          <Link to="/app/hypotheses">
            Read evidence limitations <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </>
  );
}
function ServiceMap() {
  const { data: a } = useAnalysis(),
    [service, setService] = useState("");
  const selected = a?.metrics.filter((m) => m.service === service).at(-1);
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          Caller → dependency · derived from propagated span context
        </span>
        <select
          aria-label="Select observed service"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">All observed services</option>
          {a?.nodes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <Panel title="Service dependency topology" meta={<Badge>OBSERVED</Badge>}>
        <Topology analysis={a} selected={service} onSelect={setService} />
      </Panel>
      {service && (
        <div className="two-columns">
          <Panel
            title={service}
            meta={
              <Link to={`/app/traces?service=${service}`}>
                Inspect traces <ArrowUpRight size={14} />
              </Link>
            }
          >
            <div className="detail-grid">
              <div>
                <span>p95 latency</span>
                <strong>{ms(selected?.p95 || 0)}</strong>
              </div>
              <div>
                <span>Error rate</span>
                <strong>{number((selected?.errorRate || 0) * 100, 1)}%</strong>
              </div>
            </div>
            <MetricChart metrics={a?.metrics || []} service={service} />
          </Panel>
          <Panel title="Observed neighborhood">
            <div className="padded">
              <h3>Callers potentially affected</h3>
              {a?.edges
                .filter((e) => e.target === service)
                .map((e) => (
                  <button
                    className="text-row"
                    key={e.source}
                    onClick={() => setService(e.source)}
                  >
                    {e.source}
                    <span>
                      {e.calls} calls <ArrowRight size={12} />
                    </span>
                  </button>
                ))}
              <h3>Dependencies</h3>
              {a?.edges
                .filter((e) => e.source === service)
                .map((e) => (
                  <button
                    className="text-row"
                    key={e.target}
                    onClick={() => setService(e.target)}
                  >
                    {e.target}
                    <span>
                      {ms(e.p95)} <ArrowRight size={12} />
                    </span>
                  </button>
                ))}
              <p className="muted">
                Reachability describes possible impact. It does not prove
                failure propagation.
              </p>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
function Traces() {
  const [params, setParams] = useSearchParams(),
    trace = params.get("trace") || "",
    [service, setService] = useState(params.get("service") || ""),
    [search, setSearch] = useState(""),
    [operation, setOperation] = useState(""),
    [errors, setErrors] = useState(false),
    [minDuration, setMinDuration] = useState(""),
    [page, setPage] = useState(0),
    [span, setSpan] = useState("");
  const queryEnd = Number(params.get("end")) || Date.now();
  const bounds = `start=${params.get("start") || queryEnd - 86400000}&end=${queryEnd}`;
  const q = useQuery({
    queryKey: ["traces", service, search, operation, errors, minDuration, page],
    queryFn: () =>
      api<{ items: TraceRow[]; total: number; bounded: boolean }>(
        `traces?${bounds}&service=${service}&traceId=${search}&operation=${encodeURIComponent(operation)}&error=${errors}&minDuration=${minDuration}&page=${page}`,
      ),
  });
  const detail = useQuery({
    queryKey: ["trace", trace],
    queryFn: () =>
      api<{
        spans: Span[];
        structure: {
          duration: number;
          missing: string[];
          skew: string[];
          constraints: { before: string; after: string; reason: string }[];
          associations: unknown[];
          exclusive: Record<string, number>;
          warning: string;
        };
        logs: Log[];
      }>(`traces/${trace}?${bounds}`),
    enabled: !!trace,
  });
  const selected =
    detail.data?.spans.find((s) => s.spanId === span) || detail.data?.spans[0];
  return (
    <>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={15} />
          <input
            placeholder="Exact trace ID"
            aria-label="Trace ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <input
          className="operation-filter"
          aria-label="Operation filter"
          placeholder="Operation contains…"
          value={operation}
          onChange={(e) => {
            setOperation(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Service filter"
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          className="duration-filter"
          aria-label="Minimum duration in milliseconds"
          type="number"
          min="0"
          placeholder="Min ms"
          value={minDuration}
          onChange={(e) => setMinDuration(e.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={errors}
            onChange={(e) => setErrors(e.target.checked)}
          />
          Errors only
        </label>
      </div>
      <Panel
        title="Captured traces"
        meta={
          <span>{q.data?.total || 0} results · last 24h · 50 per page</span>
        }
      >
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Trace / operation</th>
                  <th>Services</th>
                  <th>Duration</th>
                  <th>Spans</th>
                  <th>Status</th>
                  <th>Observed at</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((t) => (
                  <tr
                    key={t.traceId}
                    onClick={() => {
                      setParams({
                        trace: t.traceId,
                        ...(params.get("start")
                          ? {
                              start: params.get("start")!,
                              end: params.get("end")!,
                            }
                          : {}),
                      });
                      setSpan("");
                    }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setParams({ trace: t.traceId });
                    }}
                  >
                    <td>
                      <b>{t.operation}</b>
                      <small className="mono">{t.traceId.slice(0, 20)}…</small>
                    </td>
                    <td>
                      <span className="service-chips">
                        {t.services.slice(0, 3).join(" / ")}
                        {t.services.length > 3
                          ? ` +${t.services.length - 3}`
                          : ""}
                      </span>
                    </td>
                    <td className="mono">{ms(t.duration)}</td>
                    <td>{t.spans}</td>
                    <td>
                      <Badge solid={t.errors > 0}>
                        {t.errors ? `${t.errors} errors` : "Observed"}
                      </Badge>
                    </td>
                    <td className="mono muted">{clock(t.start)}</td>
                    <td>
                      <ArrowUpRight size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No matching traces" />
        )}
        <div className="pagination">
          <span>
            {q.data?.bounded
              ? "Query reached the 30,000-span bound. Narrow the range."
              : "Results describe captured spans; traces may be incomplete."}
          </span>
          <div>
            <button
              aria-label="Previous trace page"
              disabled={page === 0}
              onClick={() => setPage((x) => x - 1)}
            >
              <ArrowLeft size={14} />
            </button>
            <span>{page + 1}</span>
            <button
              aria-label="Next trace page"
              disabled={(page + 1) * 50 >= (q.data?.total || 0)}
              onClick={() => setPage((x) => x + 1)}
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </Panel>
      {trace && (
        <div className="trace-detail">
          <div className="section-title">
            <div>
              <span className="eyebrow">DISTRIBUTED TRACE</span>
              <h2 className="mono">
                {trace.slice(0, 16)}
                <span className="muted">{trace.slice(16)}</span>
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close trace"
              onClick={() => setParams({})}
            >
              <X size={20} />
            </button>
          </div>
          {detail.isPending ? (
            <Loading />
          ) : detail.error ? (
            <ErrorState error={detail.error} />
          ) : (
            detail.data && (
              <>
                <Panel
                  title="Execution waterfall"
                  meta={
                    <Badge>
                      {detail.data.structure.missing.length} missing parents
                    </Badge>
                  }
                >
                  <Waterfall
                    spans={detail.data.spans}
                    selected={selected?.spanId}
                    onSelect={setSpan}
                  />
                </Panel>
                {selected && (
                  <div className="two-columns">
                    <Panel
                      title="Span inspector"
                      meta={
                        <Badge solid={selected.status === 2}>
                          {selected.status === 2 ? "ERROR" : "OBSERVED"}
                        </Badge>
                      }
                    >
                      <div className="padded">
                        <span className="eyebrow">
                          {selected.service} /{" "}
                          {selected.kind === 3
                            ? "CLIENT"
                            : selected.kind === 2
                              ? "SERVER"
                              : "OPERATION"}
                        </span>
                        <h3>{selected.name}</h3>
                        <dl className="properties">
                          <dt>Span ID</dt>
                          <dd>{selected.spanId}</dd>
                          <dt>Parent span</dt>
                          <dd>{selected.parentSpanId || "Root / no parent"}</dd>
                          <dt>Inclusive time</dt>
                          <dd>{ms(selected.duration)}</dd>
                          <dt>Exclusive local time</dt>
                          <dd>
                            {ms(
                              detail.data.structure.exclusive[
                                selected.spanId
                              ] || 0,
                            )}
                          </dd>
                          <dt>Span links</dt>
                          <dd>{selected.links.length}</dd>
                        </dl>
                        <h4>Attributes</h4>
                        <pre>
                          {JSON.stringify(selected.attributes, null, 2)}
                        </pre>
                        {selected.events.length > 0 && (
                          <>
                            <h4>Recorded span events</h4>
                            <pre>
                              {JSON.stringify(selected.events, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    </Panel>
                    <Panel title="Structural ordering & correlated logs">
                      <div className="padded">
                        <p className="muted">{detail.data.structure.warning}</p>
                        <div className="detail-grid">
                          <div>
                            <span>Structural constraints</span>
                            <strong>
                              {detail.data.structure.constraints.length}
                            </strong>
                          </div>
                          <div>
                            <span>Clock-skew warnings</span>
                            <strong>{detail.data.structure.skew.length}</strong>
                          </div>
                        </div>
                        {detail.data.logs.map((l) => (
                          <div className="log-entry" key={l.id}>
                            <small>
                              {clock(l.time)} / {l.service} / {l.level}
                            </small>
                            <p>{l.message}</p>
                          </div>
                        ))}
                        {!detail.data.logs.length && (
                          <p>
                            No correlated structured logs captured for this
                            trace.
                          </p>
                        )}
                        <details>
                          <summary>Inspect event-order constraints</summary>
                          <pre>
                            {JSON.stringify(
                              detail.data.structure.constraints,
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </div>
                    </Panel>
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
function Metrics() {
  const { data: a } = useAnalysis(),
    [service, setService] = useState(""),
    [field, setField] = useState<
      "p95" | "errorRate" | "throughput" | "dbWait" | "queueAge"
    >("p95");
  return (
    <>
      <div className="toolbar">
        <span>
          5-second windows · fixed first 3 eligible windows as baseline
        </span>
        <div>
          <select
            aria-label="Metric service"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Maximum across services</option>
            {a?.nodes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Metric"
            value={field}
            onChange={(e) => setField(e.target.value as typeof field)}
          >
            {["p95", "errorRate", "throughput", "dbWait", "queueAge"].map(
              (f) => (
                <option key={f}>{f}</option>
              ),
            )}
          </select>
        </div>
      </div>
      <Panel
        title={`${service || "Service maximum"} · ${field}`}
        meta={<Badge>MEASURED</Badge>}
      >
        <MetricChart
          metrics={a?.metrics || []}
          service={service}
          field={field}
        />
      </Panel>
      <Panel title="Detected deviations" meta={<span>MAD · EWMA · CUSUM</span>}>
        {a?.anomalies.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Service / metric</th>
                  <th>Baseline</th>
                  <th>Observed</th>
                  <th>Deviation</th>
                  <th>Detector</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                {a.anomalies
                  .filter((x) => !service || x.service === service)
                  .slice(-100)
                  .reverse()
                  .map((x) => (
                    <tr key={x.id}>
                      <td>
                        <b>{x.service}</b>
                        <small>{x.metric}</small>
                      </td>
                      <td className="mono">{number(x.baseline, 2)}</td>
                      <td className="mono">{number(x.observed, 2)}</td>
                      <td className="mono">{number(x.deviation, 1)} σ*</td>
                      <td>{x.detector}</td>
                      <td>{clock(x.time)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No supported deviations"
            text="A detector needs 3 baseline windows and at least 3 received requests per window. Collect healthy traffic before introducing a fault."
            action={false}
          />
        )}
      </Panel>
      <p className="footnote">
        * Robust standardized deviation with a minimum noise floor; not a
        Gaussian probability. p99 requires 100 samples per service window.
        Missing windows are not imputed.
      </p>
    </>
  );
}
function Hypotheses({ analysis }: { analysis?: Analysis }) {
  const q = useAnalysis(),
    a = analysis || q.data,
    [selected, setSelected] = useState(""),
    notify = useFeedback();
  const explain = useMutation({
    mutationFn: () =>
      api<{ summary: string; label: string }>(`assist/${a?.id}`, {
        consent: true,
      }),
    onError: (e) => notify(e.message),
  });
  const h =
    a?.hypotheses.find((h) => h.service === selected) || a?.hypotheses[0];
  return (
    <>
      <div className="evidence-notice">
        <GitBranch size={19} />
        <p>
          <b>Ranked explanations, with room for doubt.</b>Scores express
          relative ordering. They are not calibrated probabilities. An
          experiment label is never an inference input.
        </p>
        <Badge>HYPOTHESES</Badge>
      </div>
      {a?.hypotheses.length ? (
        <div className="hypothesis-layout">
          <Panel title="Candidate ranking" meta={<span>{a.version}</span>}>
            <div className="ranking-list">
              {a.hypotheses.map((c) => (
                <button
                  key={c.service}
                  className={h?.service === c.service ? "active" : ""}
                  onClick={() => setSelected(c.service)}
                >
                  <span className="ranking-index">
                    {String(c.rank).padStart(2, "0")}
                  </span>
                  <div>
                    <b>{c.service}</b>
                    <small>{c.mode}</small>
                    <span className="score-track">
                      <i style={{ width: `${c.score * 100}%` }} />
                    </span>
                  </div>
                  <span className="mono">{c.score.toFixed(3)}</span>
                </button>
              ))}
            </div>
          </Panel>
          {h && (
            <Panel
              title="Evidence thread"
              meta={<Badge solid={h.rank === 1}>{h.label}</Badge>}
            >
              <div className="evidence-body">
                <h2>
                  {h.service}
                  <ArrowUpRight size={23} />
                </h2>
                <p>{h.mode}</p>
                <div className="evidence-section">
                  <span className="evidence-step">01</span>
                  <div>
                    <h4>Supporting observations</h4>
                    {h.support.length ? (
                      h.support.map((s, i) => <p key={i}>{s}</p>)
                    ) : (
                      <p>No direct observations identify this candidate.</p>
                    )}
                  </div>
                </div>
                <div className="evidence-section">
                  <span className="evidence-step">02</span>
                  <div>
                    <h4>Referenced traces & logs</h4>
                    {h.traces.slice(0, 5).map((t) => (
                      <Link
                        className="evidence-link mono"
                        key={t}
                        to={traceLink(t, a)}
                      >
                        {t.slice(0, 24)}… <ArrowUpRight size={13} />
                      </Link>
                    ))}
                    {h.logIds.map((id) => (
                      <Link
                        className="evidence-link mono"
                        key={id}
                        to={`/app/events?service=${h.service}`}
                      >
                        Log {id.slice(0, 12)} <ArrowUpRight size={13} />
                      </Link>
                    ))}
                    {!h.traces.length && !h.logIds.length && (
                      <p>No referenced trace or structured log.</p>
                    )}
                  </div>
                </div>
                <div className="evidence-section">
                  <span className="evidence-step">03</span>
                  <div>
                    <h4>Contradictions & limitations</h4>
                    {[...h.contradictions, ...h.warnings].map((s, i) => (
                      <p className="muted" key={i}>
                        {s}
                      </p>
                    ))}
                  </div>
                </div>
                <details>
                  <summary>Inspect the scoring factors</summary>
                  <pre>{JSON.stringify(h.factors, null, 2)}</pre>
                </details>
              </div>
            </Panel>
          )}
        </div>
      ) : (
        <Empty
          title="Evidence comes first"
          text="Collect a healthy baseline, then run a controlled fault to produce supported candidate explanations."
        />
      )}
      <details className="assistant-box">
        <summary>Optional Gemini explanation</summary>
        <p>
          With server-side Gemini enabled, this action sends up to 20 synthetic
          service anomaly summaries to Google. No raw traces, logs, credentials,
          or fault labels are sent.
        </p>
        <button
          className="button"
          disabled={!a || explain.isPending}
          onClick={() => explain.mutate()}
        >
          I consent — explain these observations <ArrowUpRight size={14} />
        </button>
        {explain.data && (
          <p>
            <b>{explain.data.label}</b>
            <br />
            {explain.data.summary}
          </p>
        )}
      </details>
    </>
  );
}
function Incidents() {
  const q = useQuery({
      queryKey: ["incidents"],
      queryFn: () => api<Incident[]>("incidents"),
    }),
    [params, setParams] = useSearchParams(),
    id = params.get("id") || "",
    detail = useQuery({
      queryKey: ["incident", id],
      queryFn: () => api<Incident & { analysis: Analysis }>(`incidents/${id}`),
      enabled: !!id,
    }),
    { data: a } = useAnalysis(),
    [note, setNote] = useState(""),
    [name, setName] = useState(""),
    [creating, setCreating] = useState(false),
    notify = useFeedback(),
    qc = useQueryClient();
  const change = useMutation({
    mutationFn: (body: unknown) => api(`incidents/${id}`, body, "PATCH"),
    onSuccess: (_result, body) => {
      if (body && typeof body === "object" && "note" in body)
        setNote((current) => (current === body.note ? "" : current));
      void qc.invalidateQueries({ queryKey: ["incident", id] });
      void qc.invalidateQueries({ queryKey: ["incidents"] });
      notify("Investigation record saved.");
    },
    onError: (e) => notify(e.message),
  });
  const create = useMutation({
    mutationFn: () => api<Incident>("incidents", { name, analysisId: a?.id }),
    onSuccess: (r) => {
      setParams({ id: r.id });
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e) => notify(e.message),
  });
  const next: Record<string, string[]> = {
    detected: ["investigating", "resolved"],
    investigating: ["mitigating", "resolved"],
    mitigating: ["monitoring", "investigating"],
    monitoring: ["resolved", "investigating"],
    resolved: ["investigating"],
  };
  return (
    <>
      <div className="toolbar">
        <span>
          {q.data?.filter((i) => i.status !== "resolved").length || 0} open ·{" "}
          {q.data?.length || 0} recorded
        </span>
        <button
          className="button dark"
          disabled={!a}
          onClick={() => setCreating((x) => !x)}
        >
          <Plus size={14} />
          Open investigation
        </button>
      </div>
      {creating && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            aria-label="Investigation title"
            placeholder="Investigation title"
            minLength={3}
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="button dark" disabled={create.isPending}>
            Create from current evidence
          </button>
          <button
            type="button"
            className="button"
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
        </form>
      )}
      <Panel
        title="Investigation records"
        meta={<span>Persisted lifecycle & evidence</span>}
      >
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data?.length ? (
          <div className="incident-list">
            {q.data.map((i) => (
              <button
                className={id === i.id ? "selected" : ""}
                key={i.id}
                onClick={() => setParams({ id: i.id })}
              >
                <span className="incident-mark">
                  {i.status === "resolved" ? <Check size={16} /> : "!"}
                </span>
                <div>
                  <b>{i.name}</b>
                  <small>
                    {clock(i.start)} · {i.services.join(" / ")}
                  </small>
                </div>
                <Badge solid={i.status !== "resolved"}>{i.status}</Badge>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="A quiet investigation queue"
            text="Anomalies can open an incident automatically. Manual investigations preserve the current analysis snapshot."
          />
        )}
      </Panel>
      {id &&
        (detail.isPending ? (
          <Loading />
        ) : detail.error ? (
          <ErrorState error={detail.error} />
        ) : (
          detail.data && (
            <>
              <div className="section-title">
                <div>
                  <span className="eyebrow">INCIDENT / {id.slice(0, 8)}</span>
                  <h2>{detail.data.name}</h2>
                </div>
                <div className="button-group">
                  <Link className="button" to={`/app/replay?id=${id}`}>
                    <Play size={13} />
                    Replay
                  </Link>
                  <a
                    className="button"
                    href={`/api/v1/reports/${id}?format=markdown`}
                  >
                    <Download size={13} />
                    Markdown
                  </a>
                  <a className="button" href={`/api/v1/reports/${id}`}>
                    <Download size={13} />
                    JSON
                  </a>
                </div>
              </div>
              <div className="two-columns">
                <Panel
                  title="Investigation record"
                  meta={<Badge solid>{detail.data.status}</Badge>}
                >
                  <div className="padded">
                    <p>{detail.data.description}</p>
                    <div className="button-group">
                      {next[detail.data.status]?.map((s) => (
                        <button
                          key={s}
                          className="button"
                          disabled={change.isPending}
                          onClick={() => change.mutate({ status: s })}
                        >
                          Move to {s}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        change.mutate({ note });
                      }}
                    >
                      <label>
                        Investigator note
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Record an observation, question, or decision…"
                          required
                          maxLength={4000}
                        />
                      </label>
                      <button
                        className="button dark"
                        disabled={change.isPending || !note}
                      >
                        Save note
                      </button>
                    </form>
                    {detail.data.notes.map((n, i) => (
                      <div key={i} className="log-entry">
                        <small>
                          {n.author} · {clock(n.at)}
                        </small>
                        <p>{n.text}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Investigation timeline">
                  <div className="timeline-list">
                    {detail.data.timeline.map((e, i) => (
                      <div key={i}>
                        <span className="timeline-point" />
                        <span className="mono muted">{clock(e.at)}</span>
                        <p>{e.text}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
              <Hypotheses analysis={detail.data.analysis} />
            </>
          )
        ))}
    </>
  );
}
type ReplayData = {
  analysis: Analysis;
  incident: Incident;
  frames: {
    at: number;
    metrics: Analysis["metrics"];
    anomalies: Analysis["anomalies"];
    edges: Analysis["edges"];
    nodes: string[];
  }[];
};
function Replay() {
  const incidents = useQuery({
      queryKey: ["incidents"],
      queryFn: () => api<Incident[]>("incidents"),
    }),
    [params, setParams] = useSearchParams(),
    id = params.get("id") || incidents.data?.[0]?.id || "",
    q = useQuery({
      queryKey: ["replay", id],
      queryFn: () => api<ReplayData>(`incidents/${id}/replay`),
      enabled: !!id,
    }),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [service, setService] = useState("");
  const frames = q.data?.frames || [],
    frame = frames[Math.min(index, frames.length - 1)];
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [id]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () =>
        setIndex((i) => {
          if (i >= frames.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1000 / speed,
    );
    return () => clearInterval(t);
  }, [playing, speed, frames.length]);
  const current =
    q.data && frame
      ? {
          ...q.data.analysis,
          nodes: frame.nodes,
          edges: frame.edges,
          anomalies: frame.anomalies,
          metrics: q.data.analysis.metrics.filter((m) => m.time <= frame.at),
        }
      : null;
  return (
    <>
      <div className="toolbar">
        <span className="live-label">
          <Clock3 size={14} />
          Historical evidence · no generated playback states
        </span>
        <select
          aria-label="Replay incident"
          value={id}
          onChange={(e) => setParams({ id: e.target.value })}
        >
          <option value="">Select an incident</option>
          {incidents.data?.map((i) => (
            <option value={i.id} key={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      {!id ? (
        <Empty
          title="An incident worth reconstructing"
          text="Open an investigation to preserve its evidence, then replay the observed sequence here."
        />
      ) : q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        q.data && (
          <>
            <div className="replay-banner">
              <span className="eyebrow">REPLAY / {id.slice(0, 8)}</span>
              <h2>{q.data.incident.name}</h2>
              <span>
                {q.data.analysis.spanCount} captured spans · {frames.length}{" "}
                persisted windows
              </span>
            </div>
            <Panel
              title="Reconstruction canvas"
              meta={<Badge>{frame ? clock(frame.at) : "No frames"}</Badge>}
            >
              <Topology
                analysis={current}
                at={frame?.at || 0}
                selected={service}
                onSelect={setService}
              />
              <div className="replay-controls">
                <div>
                  <button
                    className="icon-button"
                    aria-label="Previous replay frame"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => i - 1)}
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    className="play-button"
                    aria-label={playing ? "Pause replay" : "Play replay"}
                    disabled={!frames.length}
                    onClick={() => setPlaying((x) => !x)}
                  >
                    {playing ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next replay frame"
                    disabled={index >= frames.length - 1}
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    <SkipForward size={16} />
                  </button>
                </div>
                <input
                  aria-label="Temporal lens"
                  type="range"
                  min="0"
                  max={Math.max(0, frames.length - 1)}
                  value={index}
                  onChange={(e) => {
                    setIndex(Number(e.target.value));
                    setPlaying(false);
                  }}
                />
                <select
                  aria-label="Replay speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
                <span className="mono">
                  {index + 1} / {frames.length}
                </span>
              </div>
            </Panel>
            <div className="two-columns">
              <Panel title="Temporal lens · observed latency">
                <MetricChart
                  metrics={current?.metrics || []}
                  service={service || undefined}
                />
              </Panel>
              <Panel title="Evidence revealed so far">
                <div className="padded">
                  {frame?.anomalies.slice(-5).map((a) => (
                    <Link
                      className="evidence-link"
                      key={a.id}
                      to={traceLink(a.traces[0] || "", q.data.analysis)}
                    >
                      {clock(a.time)} · {a.service} · {a.metric}{" "}
                      {number(a.observed, 1)}
                      <ArrowUpRight size={13} />
                    </Link>
                  ))}
                  {!frame?.anomalies.length && (
                    <p>No supported anomalies before the selected window.</p>
                  )}
                  <p className="muted">
                    Playback reveals observed timing. Timestamp sequence alone
                    is not a causal sequence.
                  </p>
                </div>
              </Panel>
            </div>
          </>
        )
      )}
    </>
  );
}
const faultNames: Record<string, string> = {
  healthy: "Healthy workload",
  "pool-exhaustion": "Database pool exhaustion",
  "cascading-timeout": "Cascading timeout",
  "retry-storm": "Retry storm",
  "cache-degradation": "Cache degradation",
  "partial-failure": "Partial service failure",
  "queue-backlog": "Queue backlog",
  latency: "Increased latency",
  "bad-deployment": "Bad deployment",
  unavailable: "Dependency unavailable",
  "resource-saturation": "Resource saturation",
};
function Laboratory({ compare = false }: { compare?: boolean }) {
  const runtime = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ publicDemo: boolean }>("settings"),
  });
  const maxRate = runtime.data?.publicDemo === false ? 20 : 5;
  const maxDuration = runtime.data?.publicDemo === false ? 90 : 30;
  const [form, setForm] = useState<ExperimentConfig>({
      name: compare ? "Controlled comparison" : "Healthy checkout baseline",
      fault: compare ? "pool-exhaustion" : "healthy",
      target: "inventory",
      duration: 20,
      rate: 5,
      seed: 42,
      magnitude: 400,
      failureRate: 0.65,
      workload: "checkout",
    }),
    notify = useFeedback(),
    qc = useQueryClient();
  const runs = useQuery({
      queryKey: ["experiments"],
      queryFn: () => api<Experiment[]>("experiments"),
    }),
    comparisons = useQuery({
      queryKey: ["comparisons"],
      queryFn: () =>
        api<
          { id: string; status: string; baselineId: string; faultId: string }[]
        >("comparisons"),
      enabled: compare,
    }),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const active = runs.data?.find((r) => r.status === "running"),
    start = useMutation({
      mutationFn: () => api(compare ? "comparisons" : "experiments", form),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["experiments"] });
        void qc.invalidateQueries({ queryKey: ["comparisons"] });
        notify(
          compare
            ? "Healthy run started. The matching fault run follows after reset."
            : "Bounded workload started in Northstar Commerce.",
        );
      },
      onError: (e) => notify(e.message),
    });
  const stop = useMutation({
    mutationFn: (id: string) => api(`experiments/${id}/stop`, {}),
    onSuccess: () =>
      notify("Stop requested; faults reset and in-flight requests drain."),
    onError: (e) => notify(e.message),
  });
  function field<K extends keyof ExperimentConfig>(
    key: K,
    value: ExperimentConfig[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  return (
    <>
      <div className="lab-intro">
        <div className="lab-symbol">
          <FlaskConical size={30} strokeWidth={1} />
        </div>
        <div>
          <h2>
            {compare
              ? "Change one variable. Observe the difference."
              : "A system you can safely put under pressure."}
          </h2>
          <p>
            {compare
              ? "Runs the same configured workload and seed first without a fault, then with the selected fault. Runtime scheduling may vary."
              : "All traffic remains inside the local synthetic commerce system. Faults expire automatically. No arbitrary targets."}
          </p>
        </div>
        <Badge>LOCAL TARGETS ONLY</Badge>
      </div>
      <div className="lab-layout">
        <Panel
          title={
            compare ? "Paired run configuration" : "Experiment configuration"
          }
          meta={<span>Explicit execution required</span>}
        >
          <form
            className="lab-form"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <label>
              Run name
              <input
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
                required
                minLength={3}
                maxLength={100}
              />
            </label>
            <div className="form-grid">
              <label>
                Scenario
                <select
                  value={form.fault}
                  onChange={(e) => {
                    field("fault", e.target.value as ExperimentConfig["fault"]);
                    field(
                      "name",
                      faultNames[e.target.value] || "Controlled experiment",
                    );
                    if (e.target.value === "queue-backlog")
                      field("target", "notification");
                    if (e.target.value === "retry-storm")
                      field("target", "payment");
                    if (e.target.value === "cache-degradation")
                      field("target", "catalog");
                    if (e.target.value === "pool-exhaustion")
                      field("target", "inventory");
                    if (e.target.value === "cascading-timeout")
                      field("magnitude", 1200);
                  }}
                >
                  {faults
                    .filter((f) => !compare || f !== "healthy")
                    .map((f) => (
                      <option value={f} key={f}>
                        {faultNames[f]}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Approved target
                <select
                  value={form.target}
                  onChange={(e) =>
                    field(
                      "target",
                      e.target.value as ExperimentConfig["target"],
                    )
                  }
                >
                  {services
                    .filter((s) => {
                      const restricted: Record<string, string> = {
                        "pool-exhaustion": "inventory",
                        "queue-backlog": "notification",
                        "retry-storm": "payment",
                        "cache-degradation": "catalog",
                      };
                      return (
                        !restricted[form.fault] || restricted[form.fault] === s
                      );
                    })
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </label>
              <label>
                Duration (seconds)
                <input
                  type="number"
                  min={5}
                  max={maxDuration}
                  value={form.duration}
                  onChange={(e) => field("duration", Number(e.target.value))}
                />
              </label>
              <label>
                Arrival rate (req/s)
                <input
                  type="number"
                  min={1}
                  max={maxRate}
                  value={form.rate}
                  onChange={(e) => field("rate", Number(e.target.value))}
                />
              </label>
              <label>
                Magnitude (ms)
                <input
                  type="number"
                  min={10}
                  max={1500}
                  value={form.magnitude}
                  onChange={(e) => field("magnitude", Number(e.target.value))}
                />
              </label>
              <label>
                Random seed
                <input
                  type="number"
                  min={1}
                  max={2147483647}
                  value={form.seed}
                  onChange={(e) => field("seed", Number(e.target.value))}
                />
              </label>
              <label>
                Failure fraction
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.failureRate}
                  onChange={(e) => field("failureRate", Number(e.target.value))}
                />
              </label>
              <label>
                Workload
                <select
                  value={form.workload}
                  onChange={(e) =>
                    field(
                      "workload",
                      e.target.value as ExperimentConfig["workload"],
                    )
                  }
                >
                  <option value="checkout">Checkout transactions</option>
                  <option value="mixed">Mixed commerce traffic</option>
                  <option value="browse">Browsing only</option>
                </select>
              </label>
            </div>
            <div className="lab-boundaries">
              <Shield size={15} />
              <span>
                Maximum {maxRate} req/s · {maxDuration} seconds · 20 concurrent
                requests
                <br />
                Pool, queue, and fault duration are bounded.
              </span>
            </div>
            <button
              className="button dark large"
              disabled={start.isPending || !!active}
            >
              <Play size={15} />
              {start.isPending
                ? "Starting…"
                : compare
                  ? "Run controlled comparison"
                  : "Run experiment"}
            </button>
            {active && (
              <span className="muted">
                One workload at a time. Stop the active run to continue.
              </span>
            )}
          </form>
        </Panel>
        <div>
          <Panel
            title="Execution monitor"
            meta={<Badge solid={!!active}>{active ? "RUNNING" : "IDLE"}</Badge>}
          >
            {active ? (
              <div className="padded execution">
                <span className="eyebrow">ACTUAL EXECUTION</span>
                <h2>{active.config.name}</h2>
                <div className="run-progress">
                  <i
                    style={{
                      width: `${Math.min(100, (now - active.start) / (active.config.duration * 10))}%`,
                    }}
                  />
                </div>
                <div className="detail-grid">
                  <div>
                    <span>Completed</span>
                    <strong>{active.completedRequests}</strong>
                  </div>
                  <div>
                    <span>Failed</span>
                    <strong>{active.failedRequests}</strong>
                  </div>
                  <div>
                    <span>Elapsed</span>
                    <strong>
                      {Math.min(
                        active.config.duration,
                        Math.floor((now - active.start) / 1000),
                      )}
                      s
                    </strong>
                  </div>
                  <div>
                    <span>Dropped arrivals</span>
                    <strong>{active.droppedRequests}</strong>
                  </div>
                </div>
                <button
                  className="button"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate(active.id)}
                >
                  <Square size={13} />
                  Stop & reset
                </button>
              </div>
            ) : (
              <div className="padded monitor-empty">
                <span className="scope-symbol">◎</span>
                <h3>Ready for a controlled run.</h3>
                <p>
                  Start with 20 seconds of healthy checkout traffic. Then apply
                  inventory pool exhaustion at {maxRate} req/s to observe
                  contention and upstream symptoms.
                </p>
                <Link to="/app/traces">
                  Inspect captured requests <ArrowUpRight size={14} />
                </Link>
              </div>
            )}
          </Panel>
          <div className="lab-method">
            <span className="eyebrow">THE EXPERIMENTAL CONTRACT</span>
            <p>
              Fault ground truth lives in a separate record. Predictions are
              stored before evaluation reads the target label.
            </p>
            <p>
              A completed run records what happened. It does not automatically
              prove a production root cause.
            </p>
          </div>
        </div>
      </div>
      <Panel
        title="Run history"
        meta={<span>Persisted execution records</span>}
      >
        {runs.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Experiment</th>
                  <th>Target / scenario</th>
                  <th>Execution</th>
                  <th>Requests</th>
                  <th>Failures</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.config.name}</b>
                      <small className="mono">
                        {r.id.slice(0, 8)} · seed {r.config.seed}
                      </small>
                    </td>
                    <td>
                      <b>{r.config.target}</b>
                      <small>{faultNames[r.config.fault]}</small>
                    </td>
                    <td>
                      <Badge solid={r.status === "running"}>{r.status}</Badge>
                      {r.error && <small title={r.error}>{r.error}</small>}
                    </td>
                    <td className="mono">{r.completedRequests}</td>
                    <td className="mono">{r.failedRequests}</td>
                    <td>
                      {r.analysisId ? (
                        <Link to={`/app/analytics?analysis=${r.analysisId}`}>
                          Open analysis <ArrowUpRight size={13} />
                        </Link>
                      ) : (
                        <span className="muted">Awaiting flush</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No executed workloads"
            text="Run history only contains real controller executions."
            action={false}
          />
        )}
      </Panel>
      {compare &&
        comparisons.data?.map((c) => (
          <Comparison key={c.id} record={c} runs={runs.data || []} />
        ))}
    </>
  );
}
function Comparison({
  record,
  runs,
}: {
  record: { id: string; status: string; baselineId: string; faultId: string };
  runs: Experiment[];
}) {
  const baseline = runs.find((r) => r.id === record.baselineId),
    fault = runs.find((r) => r.id === record.faultId),
    a = useAnalysis(baseline?.analysisId),
    b = useAnalysis(fault?.analysisId);
  function summary(analysis: Analysis | undefined | null, run?: Experiment) {
    const metrics =
      analysis?.metrics.filter(
        (m) => run && m.time >= Math.floor(run.start / 5000) * 5000,
      ) || [];
    const count = metrics.reduce((s, m) => s + m.count, 0);
    return {
      p95: Math.max(0, ...metrics.map((m) => m.p95)),
      error: metrics.reduce((s, m) => s + m.errors, 0) / Math.max(1, count),
      count,
    };
  }
  const x = summary(a.data, baseline),
    y = summary(b.data, fault);
  return (
    <Panel
      title={`Paired comparison ${record.id.slice(0, 8)}`}
      meta={<Badge>{record.status}</Badge>}
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Observed measure</th>
              <th>Healthy run</th>
              <th>Fault run</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Maximum service-window p95</td>
              <td>{ms(x.p95)}</td>
              <td>{ms(y.p95)}</td>
              <td>{ms(y.p95 - x.p95)}</td>
            </tr>
            <tr>
              <td>Observed server error fraction</td>
              <td>{number(x.error * 100, 1)}%</td>
              <td>{number(y.error * 100, 1)}%</td>
              <td>{number((y.error - x.error) * 100, 1)} percentage points</td>
            </tr>
            <tr>
              <td>Received server spans</td>
              <td>{x.count}</td>
              <td>{y.count}</td>
              <td>{y.count - x.count}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Single paired run; run-to-run variability has not been estimated. The
        configured seed controls workload selection, not operating-system
        scheduling.
      </p>
    </Panel>
  );
}
function Evaluations() {
  const q = useQuery({
    queryKey: ["evaluations"],
    queryFn: () => api<Evaluation[]>("evaluations"),
  });
  const a = q.data || [],
    mean = (f: (e: Evaluation) => number) =>
      a.length ? a.reduce((s, e) => s + f(e), 0) / a.length : 0;
  return (
    <>
      <div className="evidence-notice">
        <Shield size={20} />
        <p>
          <b>Evaluate only after prediction.</b>These are live synthetic
          experiment outcomes, not an independently held-out accuracy claim. No
          tuning/evaluation split has been established for these runs.
        </p>
      </div>
      <div className="stats-row">
        {[
          ["Evaluated runs", String(a.length)],
          [
            "Top-1 identification",
            a.length ? `${number(mean((e) => Number(e.top1)) * 100, 1)}%` : "—",
          ],
          [
            "Top-3 identification",
            a.length ? `${number(mean((e) => Number(e.top3)) * 100, 1)}%` : "—",
          ],
          [
            "Mean reciprocal rank",
            a.length
              ? number(
                  mean((e) => e.rr),
                  3,
                )
              : "—",
          ],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>
              {a.length
                ? "Measured on completed labeled runs"
                : "Not yet evaluated"}
            </small>
          </div>
        ))}
      </div>
      <Panel
        title="Evidence-aware ranking vs. baseline"
        meta={<span>{a[0]?.version || "Not yet evaluated"}</span>}
      >
        {a.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Experiment</th>
                  <th>Label (evaluation only)</th>
                  <th>Graph top-1</th>
                  <th>Metric baseline top-1</th>
                  <th>Reciprocal rank</th>
                  <th>Analysis time</th>
                </tr>
              </thead>
              <tbody>
                {a.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.experimentId.slice(0, 8)}</td>
                    <td>{e.truth}</td>
                    <td>
                      {e.top1 ? "Identified" : "Missed"} / {e.predicted[0]}
                    </td>
                    <td>{e.baselineTop1 ? "Identified" : "Missed"}</td>
                    <td>{number(e.rr, 3)}</td>
                    <td>{ms(e.runtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Not yet evaluated"
            text="Complete a fault experiment to compare stored predictions with isolated ground truth."
          />
        )}
      </Panel>
      <p className="footnote">
        False-positive rate, detection delay, and false-negative rate require a
        declared labeled observation protocol. They are not inferred from this
        small run collection.
      </p>
    </>
  );
}
function Events() {
  const [params] = useSearchParams(),
    [service, setService] = useState(params.get("service") || ""),
    [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["logs", service],
    queryFn: () => {
      const end = Date.now();
      return api<Log[]>(
        `logs?start=${end - 86400000}&end=${end}&service=${service}`,
      );
    },
  });
  const logs = q.data?.filter((l) =>
    `${l.message} ${l.traceId} ${l.level}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search log text"
            placeholder="Search message, level, or trace ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Log service"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <Panel
        title="Correlated structured logs"
        meta={<span>{logs?.length || 0} records · last 24h · max 3,000</span>}
      >
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : logs?.length ? (
          <div className="log-table">
            {logs.map((l) => (
              <Link to={traceLink(l.traceId)} className="log-line" key={l.id}>
                <span className="mono">{clock(l.time)}</span>
                <Badge solid={l.level === "error"}>{l.level}</Badge>
                <b>{l.service}</b>
                <span>{l.message}</span>
                <span className="mono muted">{l.traceId.slice(0, 8)}</span>
                <ArrowUpRight size={12} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No matching log records"
            text="Structured logs are correlated with active span context. Span exceptions are available inside the trace explorer."
          />
        )}
      </Panel>
    </>
  );
}
function Analytics() {
  const [params] = useSearchParams(),
    q = useAnalysis(params.get("analysis") || undefined),
    a = q.data;
  return (
    <>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !a ? (
        <Empty />
      ) : (
        <>
          <div className="toolbar">
            <span className="mono">
              ANALYSIS {a.id.slice(0, 8)} · {a.version}
            </span>
            <Badge>
              {clock(a.start)} → {clock(a.end)}
            </Badge>
          </div>
          <div className="stats-row">
            {[
              ["Received spans", number(a.spanCount)],
              ["Analysis runtime", ms(a.runtime)],
              ["Metric windows", number(a.metrics.length)],
              ["Supported anomalies", number(a.anomalies.length)],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Measured on persisted observations</small>
              </div>
            ))}
          </div>
          <Hypotheses analysis={a} />
          <Panel title="Analysis provenance">
            <div className="padded">
              <dl className="properties">
                <dt>Window</dt>
                <dd>
                  {new Date(a.start).toISOString()} —{" "}
                  {new Date(a.end).toISOString()}
                </dd>
                <dt>Captured data</dt>
                <dd>
                  {a.spanCount} spans / {a.nodes.length} services
                </dd>
                <dt>Missing parents</dt>
                <dd>{a.quality.missingParents}</dd>
                <dt>Clock skew</dt>
                <dd>{a.quality.skew} structural timing warnings</dd>
                <dt>Algorithm</dt>
                <dd>{a.version}</dd>
              </dl>
              {a.quality.warnings.map((w) => (
                <p className="muted" key={w}>
                  {w}
                </p>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
function Developers() {
  const [copied, setCopied] = useState(false),
    snippet = `// OTLP/HTTP protobuf export to the Collector\nimport { NodeSDK } from '@opentelemetry/sdk-node';\nimport { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';\n\nconst sdk = new NodeSDK({\n  traceExporter: new OTLPTraceExporter({\n    url: 'http://localhost:4318/v1/traces',\n  }),\n});\nsdk.start();\n// Add HTTP instrumentation or propagate W3C context explicitly.\n// See packages/instrumentation for the working synthetic example.`;
  return (
    <>
      <div className="developer-hero">
        <span className="eyebrow">A REQUEST BECOMES EVIDENCE</span>
        <h2>
          Your services speak.
          <br />
          Give them a shared context.
        </h2>
        <p>
          Export real SDK spans with W3C Trace Context. CausalScope supports
          OTLP/HTTP protobuf traces using the official OpenTelemetry v1.9.0
          schema.
        </p>
        <div className="pipeline">
          <span>Service SDK</span>
          <ArrowRight size={15} />
          <span>Collector :4318</span>
          <ArrowRight size={15} />
          <span>Receiver :4319</span>
          <ArrowRight size={15} />
          <span>Persistent evidence</span>
        </div>
      </div>
      <div className="two-columns">
        <Panel
          title="Node.js instrumentation"
          meta={
            <button
              className="text-button"
              onClick={() =>
                void navigator.clipboard.writeText(snippet).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          }
        >
          <pre className="code-block">{snippet}</pre>
        </Panel>
        <Panel title="Supported contract">
          <div className="padded">
            <dl className="properties">
              <dt>Protocol</dt>
              <dd>OTLP/HTTP · protobuf · traces only</dd>
              <dt>Authentication</dt>
              <dd>Environment-scoped bearer token at receiver</dd>
              <dt>Batch bound</dt>
              <dd>4 MiB / 2,000 spans</dd>
              <dt>Delivery</dt>
              <dd>
                At least once on Collector retries; SDK buffers are volatile
              </dd>
              <dt>Deduplication</dt>
              <dd>Workspace + environment + trace ID + span ID</dd>
              <dt>Storage modes</dt>
              <dd>PostgreSQL / ClickHouse or explicit local SQLite</dd>
              <dt>API documentation</dt>
              <dd>
                <a href="/api/v1/openapi" target="_blank" rel="noreferrer">
                  OpenAPI endpoint <ArrowUpRight size={12} />
                </a>
              </dd>
            </dl>
            <p className="muted">
              The example needs HTTP instrumentation to create requests
              automatically. The included demo explicitly instruments
              server/client spans and injects/extracts context.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
function Settings() {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      api<{
        workspace: string;
        environment: string;
        storage: Record<string, string>;
        retentionDays: number;
        roles: { workspace: string; role: string }[];
        detector: Record<string, number>;
        geminiEnabled: boolean;
        publicDemo: boolean;
      }>("settings"),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = q.data;
  return (
    <>
      <div className="two-columns">
        <Panel title="Workspace & access" meta={<Shield size={15} />}>
          <div className="padded">
            <div className="workspace-identity">
              <div className="workspace-letter">N</div>
              <div>
                <h3>Northstar Engineering</h3>
                <p>
                  {s.workspace} / {s.environment}
                </p>
              </div>
            </div>
            <dl className="properties">
              {s.roles.map((r) => (
                <React.Fragment key={r.workspace}>
                  <dt>{r.workspace}</dt>
                  <dd>{r.role}</dd>
                </React.Fragment>
              ))}
              <dt>Sessions</dt>
              <dd>HttpOnly · SameSite Strict · 8 hours</dd>
              <dt>Password hashing</dt>
              <dd>Argon2id</dd>
              <dt>Mutation protection</dt>
              <dd>Session-bound CSRF token + origin checks</dd>
            </dl>
            <p className="muted">
              Owners / administrators manage configuration. SREs can execute
              experiments. Investigators can annotate incidents. Viewers have
              read-only access.
            </p>
          </div>
        </Panel>
        <Panel title="Data & runtime" meta={<Badge>{s.storage.mode}</Badge>}>
          <div className="padded">
            <dl className="properties">
              {Object.entries(s.storage).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </React.Fragment>
              ))}
              <dt>Telemetry retention</dt>
              <dd>{s.retentionDays} days</dd>
              <dt>Gemini assistance</dt>
              <dd>
                {s.geminiEnabled
                  ? "Enabled · consent required per request"
                  : "Disabled · deterministic analytics available"}
              </dd>
              <dt>Public demo limits</dt>
              <dd>{s.publicDemo ? "Enabled" : "Local engineering mode"}</dd>
            </dl>
            <p className="muted">
              Runtime boundaries are configured through environment variables
              and require a process restart. PostgreSQL persists workspace data;
              telemetry uses PostgreSQL or the optional ClickHouse adapter.
            </p>
          </div>
        </Panel>
      </div>
      <Panel
        title="Detector configuration"
        meta={<Badge>ALGORITHM v1.0.0</Badge>}
      >
        <div className="settings-detector">
          {Object.entries(s.detector).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong className="mono">{v}</strong>
            </div>
          ))}
        </div>
        <p className="footnote">
          Baseline is the first three eligible windows in each bounded analysis.
          Statistical assumptions and limitations are documented in
          ALGORITHMS.md.
        </p>
      </Panel>
    </>
  );
}
function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="services" element={<ServiceMap />} />
            <Route path="traces" element={<Traces />} />
            <Route path="metrics" element={<Metrics />} />
            <Route path="events" element={<Events />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="replay" element={<Replay />} />
            <Route path="hypotheses" element={<Hypotheses />} />
            <Route path="lab" element={<Laboratory />} />
            <Route path="compare" element={<Laboratory compare />} />
            <Route path="evaluations" element={<Evaluations />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="developers" element={<Developers />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
