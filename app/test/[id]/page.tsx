"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { API_URL, WS_URL } from "@/lib/config";

const NeuralBackground = dynamic(
  () => import("@/components/ui/flow-field-background"),
  { ssr: false }
);
import { useScene } from "@/components/three/SceneContext";
import CounterLoader from "@/components/ui/counter-loader";
import { ScoreCard } from "@/components/ui/score-card";
import { SparkLine } from "@/components/ui/spark-line";
import { StatsCard } from "@/components/ui/stats-card";
import { ReportFolder } from "@/components/ui/report-folder";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Shield, Eye, Smartphone, Gauge, Users, AlertTriangle,
  CheckCircle2, XCircle, ChevronDown, ExternalLink, Copy, Printer, Sparkles,
} from "lucide-react";
import { LiveBrowserViewer } from "@/components/ui/live-browser-viewer";
import { DEMO_AGENTS, DEMO_REPORT, DEMO_CRAWL_DATA, DEMO_LOGS, DEMO_URL } from "@/lib/demo-data";

// ── Types ──────────────────────────────────────────────────────
type Phase = "connecting" | "crawling" | "swarming" | "reporting" | "done";

interface StepData {
  step: number;
  action: string;
  target: string;
  result: string;
  target_size?: { width: number; height: number };
  timestamp_ms?: number;
}

interface Finding {
  type: string;
  category: string;
  title: string;
  detail: string;
  evidence_step?: number;
  measured_value?: string;
  expected_value?: string;
}

interface AgentData {
  id: string;
  name: string;
  age: number | null;
  category: string;
  description: string;
  status: "waiting" | "running" | "complete" | "blocked" | "stuck";
  outcome?: string;
  taskCompleted?: boolean;
  timeMs?: number;
  issuesFound?: number;
  steps: StepData[];
  findings: Finding[];
}

interface LogEntry {
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

interface CrawlData {
  page_title?: string;
  links_count?: number;
  forms_count?: number;
  buttons_count?: number;
  images_missing_alt?: number;
  accessibility_violations_count?: number;
  load_time_ms?: number;
}

interface CategoryScore {
  score: number;
  reasoning: string;
  key_evidence?: string[];
}

interface PersonaVerdict {
  persona_id: string;
  persona_name: string;
  name?: string;
  would_recommend: boolean;
  narrative: string;
  outcome: string;
  category?: string;
  primary_barrier: string | null;
}

interface TopIssue {
  rank: number;
  title: string;
  severity: string;
  category: string;
  description: string;
  affected_personas?: string[];
  fix?: string;
  impact_estimate?: string;
}

interface Report {
  score?: { overall: number; reasoning?: string; confidence?: number };
  stats?: {
    total: number;
    completed: number;
    blocked: number;
    struggled: number;
    blocked_names?: string[];
    struggled_names?: string[];
    fine_names?: string[];
  };
  category_scores?: Record<string, CategoryScore>;
  narrative?: {
    executive_summary?: string;
    persona_verdicts?: PersonaVerdict[];
    top_issues?: TopIssue[];
    what_works?: Array<{ title: string; detail: string; personas_who_benefited?: string[] }>;
    what_doesnt_work?: Array<{ title: string; detail: string; personas_who_suffered?: string[] }>;
    accessibility_audit?: {
      total_violations?: number;
      critical?: number;
      serious?: number;
      moderate?: number;
      minor_count?: number;
      images_missing_alt?: number;
      details?: string[];
    };
    chaos_test_summary?: {
      inputs_tested?: number;
      inputs_rejected?: number;
      inputs_accepted_incorrectly?: number;
      server_errors?: number;
      worst_finding?: string;
    };
    recommendations?: Array<string | { rank: number; action: string; impact: string }>;
  };
  sessions_summary?: Array<{
    persona_id: string;
    persona_name: string;
    screenshots: Array<{ step: number; description: string; screenshot_url?: string; screenshot_b64?: string | null }>;
  }>;
  fix_prompt?: string;
  annotated_screenshot_url?: string;
}

// ── Helpers ────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function catColor(cat: string) {
  switch (cat) {
    case "accessibility": return "var(--cat-accessibility)";
    case "chaos": return "var(--cat-security)";
    case "security": return "var(--cat-security)";
    case "demographic": return "var(--cat-ai-seo)";
    case "behavioral": return "var(--cat-usability)";
    case "usability": return "var(--cat-usability)";
    case "mobile": return "var(--cat-mobile)";
    case "performance": return "var(--cat-performance)";
    case "portfolio": return "var(--accent)";
    default: return "var(--text-muted)";
  }
}

function initials(name: string | undefined) {
  if (!name) return "??";
  return name.replace(/[^A-Za-z ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function scoreColor(score: number) {
  if (score >= 60) return "var(--status-pass)";
  if (score >= 30) return "var(--status-warn)";
  return "var(--status-fail)";
}

function severityColor(s: string) {
  switch (s) {
    case "critical": return "var(--status-fail)";
    case "major": return "var(--status-warn)";
    case "minor": return "var(--text-muted)";
    default: return "var(--cat-accessibility)";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CAT_ICONS: Record<string, any> = {
  accessibility: Eye,
  security: Shield,
  usability: Users,
  mobile: Smartphone,
  performance: Gauge,
};

const CAT_COLORS: Record<string, string> = {
  accessibility: "var(--cat-accessibility)",
  security: "var(--cat-security)",
  usability: "var(--cat-usability)",
  mobile: "var(--cat-mobile)",
  performance: "var(--cat-performance)",
};

// ── Component ──────────────────────────────────────────────────
export default function TestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const testUrl = testId === "demo" ? DEMO_URL : (searchParams.get("url") || "");

  const [phase, setPhase] = useState<Phase>("connecting");
  const [agents, setAgents] = useState<Map<string, AgentData>>(new Map());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveScreenshots, setLiveScreenshots] = useState<Map<string, { b64: string; step: number }>>(new Map());
  const [annotatedScreenshots, setAnnotatedScreenshots] = useState<Map<string, string>>(new Map());
  const [crawlScreenshot, setCrawlScreenshot] = useState<string | null>(null);
  const [crawlStep, setCrawlStep] = useState(0);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

  // Sync with 3D scene context
  const scene = useScene();
  useEffect(() => { scene.setPhase(phase); }, [phase, scene]);
  useEffect(() => {
    if (report?.score?.overall) scene.setScore(report.score.overall);
  }, [report, scene]);
  useEffect(() => {
    scene.setAgentProgress(agents.size, doneCount);
  }, [agents.size, doneCount, scene]);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((prev) => [{ time: timestamp(), level, message }, ...prev]);
  }, []);

  // Timer
  useEffect(() => {
    if (phase === "done") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Animate score
  useEffect(() => {
    if (!report?.score?.overall) return;
    const target = report.score.overall;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + Math.max(1, Math.floor((target - current) / 8)), target);
      setAnimatedScore(current);
      if (current >= target) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [report]);

  // Demo mode — load hardcoded data instantly
  useEffect(() => {
    if (testId !== "demo") return;
    const agentMap = new Map<string, AgentData>();
    for (const a of DEMO_AGENTS) {
      agentMap.set(a.id, a as AgentData);
    }
    setAgents(agentMap);
    setSelectedAgentId(DEMO_AGENTS[0].id);
    setCrawlData(DEMO_CRAWL_DATA);
    setReport(DEMO_REPORT as unknown as Report);
    setLogs([...DEMO_LOGS]);
    setDoneCount(DEMO_AGENTS.length);
    setIssueCount(DEMO_AGENTS.reduce((sum, a) => sum + a.issuesFound, 0));
    setElapsed(51);
    setPhase("done");
  }, [testId]);

  // WebSocket — skip in demo mode
  useEffect(() => {
    if (testId === "demo") return;
    const wsUrl = `${WS_URL}/ws/${testId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => addLog("info", "connected to server");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onerror = () => addLog("error", "connection error");
    ws.onclose = (e) => { if (e.code !== 1000) addLog("warning", "connection closed"); };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const p = msg.phase as string;
    const status = msg.status as string;

    if (p === "crawling" && status === "started") {
      setPhase("crawling");
      addLog("info", `scanning ${testUrl}`);
    } else if (p === "crawling" && status === "complete") {
      const data = (msg.data as CrawlData) || (msg as CrawlData);
      setCrawlData(data);
      addLog("success", `mapped ${data.links_count || 0} links, ${data.forms_count || 0} forms`);
      if (data.accessibility_violations_count) {
        addLog("warning", `${data.accessibility_violations_count} accessibility violations`);
      }
    } else if (p === "crawling" && (msg.type as string) === "screenshot") {
      setCrawlScreenshot(msg.screenshot_b64 as string);
      setCrawlStep(prev => prev + 1);
    } else if (p === "swarming" && status === "started") {
      setPhase("swarming");
      const personas = msg.personas as Array<Record<string, unknown>> | undefined;
      if (personas) {
        const map = new Map<string, AgentData>();
        for (const persona of personas) {
          const id = persona.id as string;
          map.set(id, {
            id,
            name: persona.name as string,
            age: persona.age as number | null,
            category: persona.category as string,
            description: persona.description as string,
            status: "waiting",
            steps: [],
            findings: [],
          });
        }
        setAgents(map);
        setSelectedAgentId(personas[0]?.id as string || null);
      }
      addLog("info", `deploying ${msg.agent_count} agents`);
    } else if (p === "swarming" && status === "running") {
      const agentId = msg.agent_id as string;
      setAgents((prev) => {
        const next = new Map(prev);
        const existing = next.get(agentId);
        if (existing) {
          next.set(agentId, { ...existing, status: "running" });
        } else {
          next.set(agentId, {
            id: agentId,
            name: msg.persona_name as string || agentId,
            age: msg.persona_age as number | null,
            category: msg.persona_category as string || "unknown",
            description: msg.persona_description as string || "",
            status: "running",
            steps: [],
            findings: [],
          });
        }
        return next;
      });
      addLog("info", `${msg.persona_name} started testing`);
    } else if (p === "swarming" && status === "complete") {
      const agentId = msg.agent_id as string;
      const completed = msg.task_completed as boolean;
      const outcome = msg.outcome as string || (completed ? "completed" : "blocked");
      const issues = (msg.issues_found as number) || 0;
      const timeMs = (msg.total_time_ms as number) || 0;
      const steps = (msg.steps as StepData[]) || [];
      const findings = (msg.findings as Finding[]) || [];

      setAgents((prev) => {
        const next = new Map(prev);
        const existing = next.get(agentId);
        if (existing) {
          next.set(agentId, {
            ...existing,
            status: outcome === "completed" ? "complete" : outcome === "blocked" ? "blocked" : "stuck",
            outcome,
            taskCompleted: completed,
            timeMs,
            issuesFound: issues,
            steps,
            findings,
          });
        }
        return next;
      });
      setDoneCount((c) => c + 1);
      setIssueCount((c) => c + issues);

      const name = msg.persona_name as string || agentId;
      if (outcome === "blocked") addLog("error", `${name} was blocked`);
      else if (outcome === "struggled") addLog("warning", `${name} struggled`);
      else addLog("success", `${name} completed`);
    } else if (p === "swarming" && (msg.type as string) === "screenshot") {
      const agentId = msg.agent_id as string;
      const b64 = msg.screenshot_b64 as string;
      const stepNum = (msg.step as number) || 0;
      setLiveScreenshots(prev => {
        const next = new Map(prev);
        next.set(agentId, { b64, step: stepNum });
        return next;
      });
    } else if (p === "swarming" && (msg.type as string) === "annotated_screenshot") {
      const agentId = msg.agent_id as string;
      const b64 = msg.screenshot_b64 as string;
      setAnnotatedScreenshots(prev => {
        const next = new Map(prev);
        next.set(agentId, b64);
        return next;
      });
      // Also update the live screenshot to show the annotated version
      setLiveScreenshots(prev => {
        const next = new Map(prev);
        const existing = next.get(agentId);
        next.set(agentId, { b64, step: existing?.step || 0 });
        return next;
      });
    } else if (p === "reporting" && status === "started") {
      setPhase("reporting");
      addLog("info", "generating report...");
    } else if (p === "reporting" && status === "complete") {
      setReport(msg.report as Report);
      setPhase("done");
      addLog("success", "report ready");
    } else if (p === "error") {
      addLog("error", (msg.message as string) || "error");
    }
  }, [addLog, testUrl]);

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null;
  const agentList = Array.from(agents.values());
  const totalAgents = agentList.length || 1;

  // Sort: running first, then blocked, then stuck, then complete, then waiting
  const sortedAgents = [...agentList].sort((a, b) => {
    const order = { running: 0, blocked: 1, stuck: 2, complete: 3, waiting: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Subtle flow field — theme continuity */}
      <div className="fixed inset-0 z-0 opacity-[0.3]">
        <NeuralBackground color="#e8a44a" trailOpacity={0.06} particleCount={200} speed={0.3} />
      </div>
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, transparent 0%, rgba(10,10,12,0.6) 40%, rgba(10,10,12,0.95) 100%)",
        }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 sm:px-8 py-4 flex items-center justify-between relative"
        style={{
          backgroundColor: "rgba(10,10,12,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(28,28,32, 0.5)",
        }}
      >
        <a
          href="/"
          className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-tight transition-colors duration-200"
          style={{ color: "var(--text-primary)", textDecoration: "none" }}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 8px rgba(232,164,74,0.4)" }} />
          trashmy.tech
        </a>
        <div className="flex items-center gap-4">
          {phase !== "done" && (
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: "rgba(232,164,74, 0.08)", border: "1px solid rgba(232,164,74, 0.15)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px rgba(232,164,74,0.5)" }} />
              <span className="font-mono text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                {phase === "connecting" ? "Connecting" : phase === "crawling" ? "Scanning" : phase === "swarming" ? "Testing" : "Analyzing"}
              </span>
            </div>
          )}
          {phase === "done" && (
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.15)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--status-pass)" }} />
              <span className="font-mono text-[11px] font-medium" style={{ color: "var(--status-pass)" }}>Complete</span>
            </div>
          )}
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </span>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 relative z-10">
        {/* URL banner */}
        <div className="max-w-[760px] mx-auto mb-6">
          <div
            className="glass-card flex items-center gap-3 px-4 py-2.5 font-mono text-[12px]"
            style={{ borderRadius: "10px" }}
          >
            <span className="font-semibold uppercase text-[10px] tracking-[1px]" style={{ color: "var(--accent)" }}>target</span>
            <div className="w-px h-3" style={{ backgroundColor: "var(--border-default)" }} />
            <a href={testUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate flex-1 transition-colors" style={{ color: "var(--text-secondary)" }}>
              {testUrl}
            </a>
            <ExternalLink size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </div>
        </div>

        {/* ═══ IMMERSIVE SWARMING / CRAWLING ═══ */}
        {phase !== "done" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-[1100px] mx-auto"
          >
            {/* Crawl stats ribbon */}
            {crawlData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
              >
                {[
                  { label: "Links", value: crawlData.links_count || 0 },
                  { label: "Forms", value: crawlData.forms_count || 0 },
                  { label: "Violations", value: crawlData.accessibility_violations_count || 0, warn: true },
                  { label: "Load Time", value: `${((crawlData.load_time_ms || 0) / 1000).toFixed(1)}s` },
                ].map((item) => (
                  <div key={item.label} className="glass-card p-4 text-center glass-card-hover" style={{ borderRadius: "10px" }}>
                    <div className="font-mono text-[20px] font-bold" style={{ color: item.warn && typeof item.value === "number" && item.value > 0 ? "var(--status-fail)" : "var(--text-primary)" }}>
                      {item.value}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[1.5px] mt-1" style={{ color: "var(--text-muted)" }}>{item.label}</div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* ── Global progress bar ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-[2px]" style={{ color: "var(--text-muted)" }}>
                  {phase === "connecting" ? "Connecting" : phase === "crawling" ? "Crawling Site" : phase === "reporting" ? "Generating Report" : "Agents Running"}
                </span>
                <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {doneCount}/{totalAgents}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-surface)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 12px rgba(232,164,74,0.4)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / totalAgents) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            {/* ── Live Browser Viewer — crawling phase ── */}
            {phase === "crawling" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <LiveBrowserViewer
                  screenshot={crawlScreenshot ?? undefined}
                  agentName="Crawler"
                  step={crawlStep || undefined}
                  url={testUrl}
                />
              </motion.div>
            )}

            {/* ── Live Browser Viewer — shows agent screenshots in real-time ── */}
            {phase === "swarming" && selectedAgent && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                {/* Active browsers status bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)" }} />
                    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                      {sortedAgents.filter(a => a.status === "running").length} browsers active
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
                      {liveScreenshots.size} screenshots captured
                    </span>
                    {annotatedScreenshots.size > 0 && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)" }}>
                        {annotatedScreenshots.size} annotated
                      </span>
                    )}
                  </div>
                </div>
                <LiveBrowserViewer
                  screenshot={liveScreenshots.get(selectedAgent.id)?.b64}
                  agentName={selectedAgent.name}
                  step={liveScreenshots.get(selectedAgent.id)?.step}
                  url={testUrl}
                  annotated={annotatedScreenshots.has(selectedAgent.id)}
                />
              </motion.div>
            )}

            {/* ── Agent Grid — live cards showing each Playwright agent ── */}
            {(phase === "swarming" || phase === "crawling") && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
                <AnimatePresence mode="popLayout">
                  {sortedAgents.map((agent, idx) => (
                    <motion.div
                      key={agent.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="group cursor-pointer glass-card overflow-hidden transition-all duration-300"
                      style={{
                        borderRadius: "12px",
                        borderColor: selectedAgentId === agent.id ? "rgba(232,164,74, 0.3)" : undefined,
                        boxShadow: agent.status === "running" ? "0 0 20px rgba(34,197,94,0.06)" : undefined,
                      }}
                    >
                      {/* Agent header */}
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(28,28,32, 0.4)" }}>
                        {/* Status dot with pulse */}
                        <div className="relative">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300" style={{
                            backgroundColor:
                              agent.status === "running" ? "var(--status-pass)" :
                              agent.status === "complete" ? "var(--cat-accessibility)" :
                              agent.status === "blocked" ? "var(--status-fail)" :
                              agent.status === "stuck" ? "var(--status-warn)" : "var(--border-default)",
                          }} />
                          {agent.status === "running" && (
                            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: "var(--status-pass)", opacity: 0.4 }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[11px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{agent.name}</div>
                          <div className="font-mono text-[9px]" style={{ color: catColor(agent.category) }}>{agent.category}</div>
                        </div>
                        <div className="font-mono text-[9px] px-1.5 py-0.5 rounded-md shrink-0" style={{
                          backgroundColor:
                            agent.status === "running" ? "rgba(34,197,94,0.1)" :
                            agent.status === "complete" ? "rgba(59,130,246,0.1)" :
                            agent.status === "blocked" ? "rgba(232,164,74,0.1)" :
                            "rgba(30,34,50,0.5)",
                          color:
                            agent.status === "running" ? "var(--status-pass)" :
                            agent.status === "complete" ? "var(--cat-accessibility)" :
                            agent.status === "blocked" ? "var(--status-fail)" :
                            agent.status === "stuck" ? "var(--status-warn)" : "var(--text-muted)",
                        }}>
                          {agent.status === "running" ? `step ${agent.steps.length}` :
                           agent.status === "complete" ? `${((agent.timeMs || 0) / 1000).toFixed(1)}s` :
                           agent.status}
                        </div>
                      </div>

                      {/* Live step feed — last 4 steps */}
                      <div className="px-3 py-2 min-h-[72px] max-h-[96px] overflow-hidden">
                        {agent.steps.length > 0 ? (
                          <div className="space-y-1">
                            {agent.steps.slice(-4).map((step) => (
                              <motion.div
                                key={step.step}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex gap-1.5 font-mono text-[10px] items-start"
                              >
                                <span className="w-3 text-right shrink-0 tabular-nums" style={{ color: "var(--border-default)" }}>{step.step}</span>
                                <span className="shrink-0 font-semibold" style={{
                                  color: step.result === "success" ? "var(--status-pass)" : step.result === "fail" ? "var(--status-fail)" : "var(--status-warn)",
                                }}>
                                  {step.action}
                                </span>
                                <span className="truncate" style={{ color: "var(--text-muted)" }}>{step.target}</span>
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            {agent.status === "waiting" ? (
                              <span className="font-mono text-[10px]" style={{ color: "var(--border-default)" }}>queued</span>
                            ) : (
                              <div className="flex gap-1">
                                <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "0ms" }} />
                                <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "200ms" }} />
                                <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "400ms" }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Findings count badge */}
                      {agent.findings.length > 0 && (
                        <div className="px-3 pb-2 flex items-center gap-1.5">
                          <AlertTriangle size={10} style={{ color: "var(--accent)" }} />
                          <span className="font-mono text-[9px] font-semibold" style={{ color: "var(--accent)" }}>
                            {agent.findings.length} issue{agent.findings.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}

                      {/* Mini progress bar per agent */}
                      <div className="h-0.5" style={{
                        backgroundColor: agent.status === "complete" ? "var(--cat-accessibility)" :
                                         agent.status === "running" ? "var(--status-pass)" :
                                         agent.status === "blocked" ? "var(--status-fail)" :
                                         "var(--bg-surface)",
                        opacity: agent.status === "waiting" ? 0.2 : 0.6,
                        transition: "all 0.4s ease",
                      }} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* ── Expanded agent detail panel ── */}
            <AnimatePresence>
              {selectedAgent && phase === "swarming" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 overflow-hidden"
                >
                  <div className="glass-card overflow-hidden" style={{ borderRadius: "12px", borderColor: "rgba(232,164,74,0.15)" }}>
                    {/* Faux browser bar */}
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "rgba(10, 11, 15, 0.8)", borderBottom: "1px solid rgba(28,28,32, 0.5)" }}>
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-warn)" }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-pass)" }} />
                      </div>
                      <div className="flex-1 font-mono text-[11px] text-center font-semibold" style={{ color: "var(--text-primary)" }}>
                        {selectedAgent.name}
                        {selectedAgent.status === "running" && (
                          <span className="ml-2 font-normal" style={{ color: "var(--status-pass)" }}>testing...</span>
                        )}
                      </div>
                      <button onClick={() => setSelectedAgentId(null)} className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ color: "var(--text-muted)" }}>
                        close
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-0">
                      {/* Full step log */}
                      <div className="p-3 max-h-[280px] overflow-y-auto" style={{ borderRight: "1px solid rgba(30,34,50,0.3)" }}>
                        <div className="font-mono text-[9px] uppercase tracking-[1.5px] mb-2" style={{ color: "var(--text-muted)" }}>Activity Log</div>
                        <div className="space-y-1">
                          {selectedAgent.steps.map((step) => (
                            <motion.div
                              key={step.step}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex gap-2 font-mono text-[10px]"
                            >
                              <span className="w-4 text-right shrink-0 tabular-nums" style={{ color: "var(--border-default)" }}>{step.step}</span>
                              <span className="shrink-0 w-12 font-semibold" style={{ color: step.result === "success" ? "var(--status-pass)" : "var(--status-fail)" }}>
                                {step.action}
                              </span>
                              <span className="truncate" style={{ color: "var(--text-muted)" }}>{step.target}</span>
                            </motion.div>
                          ))}
                          {selectedAgent.status === "running" && (
                            <div className="flex gap-1 mt-2 ml-6">
                              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)" }} />
                              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "200ms" }} />
                              <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "400ms" }} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Findings + info */}
                      <div className="p-3 max-h-[280px] overflow-y-auto">
                        <div className="font-mono text-[9px] uppercase tracking-[1.5px] mb-2" style={{ color: "var(--text-muted)" }}>Agent Info</div>
                        <div className="font-mono text-[11px] mb-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>{selectedAgent.description}</div>
                        {selectedAgent.findings.length > 0 && (
                          <>
                            <div className="font-mono text-[9px] uppercase tracking-[1.5px] mb-2" style={{ color: "var(--accent)" }}>
                              Findings ({selectedAgent.findings.length})
                            </div>
                            <div className="space-y-1.5">
                              {selectedAgent.findings.map((f, i) => (
                                <div key={i} className="flex gap-2 font-mono text-[10px]">
                                  <AlertTriangle size={10} className="shrink-0 mt-0.5" style={{ color: f.type === "issue" ? "var(--status-fail)" : "var(--status-warn)" }} />
                                  <div>
                                    <div style={{ color: "var(--text-primary)" }}>{f.title}</div>
                                    <div style={{ color: "var(--text-muted)" }}>{f.detail}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Event log ── */}
            <div ref={logRef} className="glass-card p-3 max-h-40 overflow-y-auto font-mono text-[10px] mb-4" style={{ borderRadius: "10px" }}>
              {logs.slice(0, 50).map((log, i) => (
                <div key={i} className="flex gap-2 mb-0.5 leading-relaxed">
                  <span className="shrink-0" style={{ color: "var(--border-default)" }}>{log.time}</span>
                  <span style={{
                    color: log.level === "error" ? "var(--status-fail)" :
                      log.level === "warning" ? "var(--status-warn)" :
                        log.level === "success" ? "var(--status-pass)" : "var(--text-muted)"
                  }}>
                    {log.message}
                  </span>
                </div>
              ))}
              <span className="cursor-blink" />
            </div>

            {/* ── Cinematic Reporting Phase ── */}
            {phase === "reporting" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center py-16"
              >
                {/* Animated counter loader */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="mb-8"
                >
                  <CounterLoader color="var(--accent)" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="font-mono text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Analyzing results</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="font-mono text-[11px] mt-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  {doneCount} agents tested · generating report with AI
                </motion.div>
                {/* Pulsing orb */}
                <motion.div
                  className="w-20 h-20 rounded-full mt-8"
                  style={{
                    background: "radial-gradient(circle, rgba(232,164,74,0.15) 0%, transparent 70%)",
                    boxShadow: "0 0 60px rgba(232,164,74,0.1)",
                  }}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══ REPORT ═══ */}
        {phase === "done" && report && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[760px] mx-auto mt-4"
          >
            {/* ── Score Hero ── */}
            <div className="mb-12 text-center">
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12, delay: 0.15 }}>
                <div className="inline-block relative">
                  <span
                    className="font-mono text-[80px] font-bold leading-none"
                    style={{
                      color: scoreColor(report.score?.overall ?? 0),
                      textShadow: `0 0 40px ${scoreColor(report.score?.overall ?? 0)}30`,
                    }}
                  >
                    {animatedScore}
                  </span>
                  <span className="font-mono text-[28px] ml-1" style={{ color: "var(--border-default)" }}>/100</span>
                </div>
              </motion.div>
              {report.score?.confidence != null && (
                <div className="font-mono text-[10px] uppercase tracking-[3px] mt-3" style={{ color: "var(--text-muted)" }}>
                  {report.score.confidence > 0.7 ? "High" : report.score.confidence > 0.4 ? "Moderate" : "Low"} Confidence
                </div>
              )}
              <div className="flex items-center justify-center gap-3 font-mono text-[11px] mt-4">
                {[
                  { label: `${report.stats?.total || 0} personas`, color: "var(--text-secondary)" },
                  { label: `${issueCount} issues`, color: issueCount > 5 ? "var(--status-fail)" : "var(--text-secondary)" },
                  { label: `${elapsed}s`, color: "var(--text-secondary)" },
                ].map((stat, i) => (
                  <span key={i} className="flex items-center gap-3">
                    {i > 0 && <span style={{ color: "var(--border-default)" }}>·</span>}
                    <span style={{ color: stat.color }}>{stat.label}</span>
                  </span>
                ))}
              </div>
              {report.score?.reasoning && (
                <p className="text-[16px] leading-[1.8] mt-6 max-w-[560px] mx-auto" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                  {report.score.reasoning}
                </p>
              )}
            </div>

            {/* ── Quick Stats Overview ── */}
            <StatsCard
              title="Test Overview"
              className="mb-8"
              accentColor="var(--accent)"
              stats={[
                { label: "Personas", value: report.stats?.total || 0 },
                { label: "Completed", value: report.stats?.completed || 0, change: report.stats?.total ? `${Math.round(((report.stats.completed || 0) / report.stats.total) * 100)}%` : undefined, changeType: "positive" },
                { label: "Issues Found", value: issueCount, changeType: issueCount > 5 ? "negative" : "neutral" },
                { label: "Time", value: `${elapsed}s` },
              ]}
            />

            {/* ── Category Scores with Animated Bars ── */}
            {report.category_scores && (
              <TooltipProvider delayDuration={100}>
                <div className="mb-12">
                  <div className="font-mono text-[10px] uppercase tracking-[3px] mb-5" style={{ color: "var(--text-muted)" }}>Category Breakdown</div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {(["accessibility", "security", "usability", "mobile", "performance"] as const).map((cat, idx) => {
                      const cs = report.category_scores?.[cat];
                      if (!cs) return null;
                      const Icon = CAT_ICONS[cat] || Shield;
                      const color = CAT_COLORS[cat] || "var(--text-muted)";
                      return (
                        <Tooltip key={cat}>
                          <TooltipTrigger asChild>
                            <motion.div
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                              className="glass-card glass-card-hover p-4 text-center cursor-default"
                              style={{ borderRadius: "12px" }}
                            >
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${color}12` }}>
                                <Icon size={15} style={{ color }} />
                              </div>
                              <div className="font-mono text-[24px] font-bold" style={{ color: scoreColor(cs.score), textShadow: `0 0 20px ${scoreColor(cs.score)}20` }}>
                                {cs.score}
                              </div>
                              <div className="font-mono text-[9px] uppercase tracking-[1px] mt-1.5" style={{ color }}>
                                {cat}
                              </div>
                              <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(30,34,50,0.5)" }}>
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: scoreColor(cs.score) }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${cs.score}%` }}
                                  transition={{ duration: 1, delay: 0.3 + idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                                />
                              </div>
                            </motion.div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            <p className="font-mono text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>{cat} — {cs.score}/100</p>
                            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cs.reasoning}</p>
                            {cs.key_evidence && cs.key_evidence.length > 0 && (
                              <div className="mt-2 space-y-0.5">
                                {cs.key_evidence.map((e, i) => (
                                  <div key={i} className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>• {e}</div>
                                ))}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>

                  {/* SparkLine overview */}
                  <div className="glass-card mt-4 p-4 flex items-center justify-between" style={{ borderRadius: "10px" }}>
                    <div className="font-mono text-[10px] uppercase tracking-[1px]" style={{ color: "var(--text-muted)" }}>Score Distribution</div>
                    <SparkLine
                      data={(["accessibility", "security", "usability", "mobile", "performance"] as const).map(c => report.category_scores?.[c]?.score || 0)}
                      width={200}
                      height={40}
                      color="var(--accent)"
                    />
                  </div>
                </div>
              </TooltipProvider>
            )}

            {/* ── Executive Summary ── */}
            {report.narrative?.executive_summary && (
              <div className="mb-12">
                <div className="h-px mb-8" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="font-mono text-[10px] uppercase tracking-[3px] mb-4" style={{ color: "var(--text-muted)" }}>Executive Summary</div>
                <div className="glass-card p-6" style={{ borderRadius: "12px" }}>
                  <p className="text-[16px] leading-[1.9]" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {report.narrative.executive_summary}
                  </p>
                </div>
              </div>
            )}

            {/* ── What Works / What Doesn't ── */}
            {(report.narrative?.what_works?.length || report.narrative?.what_doesnt_work?.length) ? (
              <div className="grid sm:grid-cols-2 gap-4 mb-12">
                {report.narrative?.what_works && report.narrative.what_works.length > 0 && (
                  <ReportFolder
                    title="What Works"
                    accentColor="var(--status-pass)"
                    count={report.narrative.what_works.length}
                    icon={<CheckCircle2 size={14} style={{ color: "var(--status-pass)" }} />}
                    defaultOpen
                  >
                    <div className="space-y-4">
                      {report.narrative.what_works.map((w, i) => (
                        <div key={i} className="pl-3" style={{ borderLeft: "2px solid rgba(34,197,94,0.2)" }}>
                          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{w.title}</div>
                          <div className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{w.detail}</div>
                          {w.personas_who_benefited && (
                            <div className="font-mono text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                              {w.personas_who_benefited.join(" · ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ReportFolder>
                )}
                {report.narrative?.what_doesnt_work && report.narrative.what_doesnt_work.length > 0 && (
                  <ReportFolder
                    title="What Doesn't Work"
                    accentColor="var(--accent)"
                    count={report.narrative.what_doesnt_work.length}
                    icon={<XCircle size={14} style={{ color: "var(--accent)" }} />}
                    defaultOpen
                  >
                    <div className="space-y-4">
                      {report.narrative.what_doesnt_work.map((w, i) => (
                        <div key={i} className="pl-3" style={{ borderLeft: "2px solid rgba(232,164,74,0.2)" }}>
                          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{w.title}</div>
                          <div className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{w.detail}</div>
                          {w.personas_who_suffered && (
                            <div className="font-mono text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                              {w.personas_who_suffered.join(" · ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ReportFolder>
                )}
              </div>
            ) : null}

            {/* ── Persona Verdicts ── */}
            {report.narrative?.persona_verdicts && report.narrative.persona_verdicts.length > 0 && (
              <div className="mb-12">
                <div className="font-mono text-[10px] uppercase tracking-[3px] mb-5" style={{ color: "var(--text-muted)" }}>Persona Results</div>

                {/* Summary row */}
                <ScoreCard
                  className="mb-4"
                  title="Agent Overview"
                  headerIcon={<Users size={14} />}
                  stats={[
                    { title: "Completed", value: report.stats?.completed || 0 },
                    { title: "Struggled", value: report.stats?.struggled || 0 },
                    { title: "Blocked", value: report.stats?.blocked || 0, changePercent: report.stats?.blocked ? Math.round((report.stats.blocked / (report.stats?.total || 1)) * 100) : 0, changeDirection: "down" as const },
                  ]}
                  graphData={report.narrative.persona_verdicts.map((pv) => ({
                    label: (pv.persona_name || pv.name || "Unknown"),
                    value: pv.outcome === "completed" ? 90 : pv.outcome === "struggled" ? 50 : 15,
                    color: pv.outcome === "completed" ? "var(--status-pass)" : pv.outcome === "struggled" ? "var(--status-warn)" : "var(--status-fail)",
                    description: pv.outcome,
                  }))}
                  graphHeight={80}
                  legendTitle="Agent Outcomes"
                  showLegend={false}
                />

                <div className="space-y-1.5">
                  {report.narrative.persona_verdicts.map((pv) => {
                    const isExpanded = expandedPersona === pv.persona_id;
                    const sessionScreenshots = report.sessions_summary?.find(s => s.persona_id === pv.persona_id)?.screenshots || [];
                    return (
                      <div key={pv.persona_id}>
                        <button
                          onClick={() => setExpandedPersona(isExpanded ? null : pv.persona_id)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left"
                          style={{
                            backgroundColor: isExpanded ? "rgba(15, 17, 23, 0.7)" : "transparent",
                            border: isExpanded ? "1px solid rgba(28,28,32, 0.6)" : "1px solid transparent",
                            backdropFilter: isExpanded ? "blur(12px)" : "none",
                          }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono shrink-0 transition-all" style={{
                            fontSize: "9px", backgroundColor: "rgba(8, 9, 13, 0.8)",
                            border: `2px solid ${catColor(agents.get(pv.persona_id)?.category || "unknown")}`,
                            color: "var(--text-secondary)",
                          }}>
                            {initials((pv.persona_name || pv.name || "Unknown"))}
                          </div>
                          <span className="text-[14px] flex-1 font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                            {(pv.persona_name || pv.name || "Unknown")}
                          </span>
                          <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full font-medium" style={{
                            backgroundColor: pv.outcome === "completed" ? "rgba(34,197,94,0.1)" : pv.outcome === "blocked" ? "rgba(232,164,74,0.1)" : "rgba(234,179,8,0.1)",
                            color: pv.outcome === "completed" ? "var(--status-pass)" : pv.outcome === "blocked" ? "var(--status-fail)" : "var(--status-warn)",
                          }}>
                            {pv.outcome}
                          </span>
                          <span className="font-mono text-[10px] hidden sm:inline" style={{
                            color: pv.would_recommend ? "var(--status-pass)" : "var(--status-fail)",
                          }}>
                            {pv.would_recommend ? "✓ recommend" : "✗ not recommended"}
                          </span>
                          <ChevronDown size={14} style={{ color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)" }} />
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-5 pt-2 ml-11">
                                <p className="text-[14px] leading-[1.9]" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                                  {pv.narrative}
                                </p>
                                {pv.primary_barrier && (
                                  <div className="flex items-start gap-2.5 mt-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(232,164,74,0.04)", border: "1px solid rgba(232,164,74,0.1)" }}>
                                    <AlertTriangle size={13} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} />
                                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}>
                                      {pv.primary_barrier}
                                    </p>
                                  </div>
                                )}

                                {sessionScreenshots.length > 0 && (
                                  <div className="flex gap-2.5 overflow-x-auto mt-4 pb-2">
                                    {sessionScreenshots.map((ss, i) => {
                                      const imgSrc = ss.screenshot_url
                                        ? `${API_URL}${ss.screenshot_url}`
                                        : ss.screenshot_b64
                                          ? `data:image/jpeg;base64,${ss.screenshot_b64}`
                                          : null;
                                      if (!imgSrc) return null;
                                      return (
                                        <button key={i} onClick={() => setLightboxImg(imgSrc)}
                                          className="shrink-0 rounded-lg overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:shadow-lg"
                                          style={{ border: "1px solid rgba(30,34,50,0.5)" }}>
                                          <img src={imgSrc} alt={`Step ${ss.step}`}
                                            className="w-[160px] h-auto" />
                                          <div className="font-mono text-[9px] px-2 py-1" style={{ color: "var(--text-muted)", backgroundColor: "rgba(10,11,15,0.6)" }}>
                                            Step {ss.step}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Top Issues ── */}
            {report.narrative?.top_issues && report.narrative.top_issues.length > 0 && (
              <ReportFolder
                title="Top Issues"
                accentColor="var(--status-warn)"
                count={report.narrative.top_issues.length}
                subtitle="Prioritized by severity"
                icon={<AlertTriangle size={14} style={{ color: "var(--status-warn)" }} />}
                defaultOpen
                className="mb-12"
              >
                <div className="space-y-3">
                  {report.narrative.top_issues.map((issue, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                      className="glass-card p-5"
                      style={{
                        borderRadius: "12px",
                        borderLeft: `3px solid ${severityColor(issue.severity)}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded-full font-medium" style={{
                          backgroundColor: `${severityColor(issue.severity)}15`,
                          color: severityColor(issue.severity),
                        }}>
                          {issue.severity}
                        </span>
                        {issue.category && (
                          <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded-full" style={{
                            backgroundColor: `${CAT_COLORS[issue.category] || "var(--text-muted)"}10`,
                            color: CAT_COLORS[issue.category] || "var(--text-muted)",
                          }}>
                            {issue.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[15px] font-semibold mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{issue.title}</div>
                      <p className="text-[13px] leading-[1.8] mb-2.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{issue.description}</p>
                      {issue.fix && (
                        <div className="p-3 rounded-lg flex items-start gap-2" style={{ backgroundColor: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
                          <span className="font-mono text-[9px] uppercase font-semibold mt-0.5 shrink-0" style={{ color: "var(--status-pass)" }}>Fix:</span>
                          <span className="text-[13px] leading-relaxed" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{issue.fix}</span>
                        </div>
                      )}
                      {issue.affected_personas && issue.affected_personas.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-3">
                          {issue.affected_personas.map((name) => (
                            <div key={name} className="w-5 h-5 rounded-full flex items-center justify-center font-mono" style={{
                              fontSize: "7px", backgroundColor: "rgba(30,34,50,0.5)", color: "var(--text-secondary)",
                            }}>
                              {initials(name)}
                            </div>
                          ))}
                          {issue.impact_estimate && (
                            <span className="font-mono text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>{issue.impact_estimate}</span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </ReportFolder>
            )}

            {/* ── Accessibility + Security side by side ── */}
            <div className="grid sm:grid-cols-2 gap-4 mb-12">
              {report.narrative?.accessibility_audit && (
                <ReportFolder
                  title="Accessibility Audit"
                  accentColor="var(--cat-accessibility)"
                  count={report.narrative.accessibility_audit.total_violations}
                  subtitle={`${report.narrative.accessibility_audit.critical || 0} critical`}
                  icon={<Eye size={14} style={{ color: "var(--cat-accessibility)" }} />}
                  defaultOpen
                >
                  {report.narrative.accessibility_audit.total_violations != null && (
                    <div className="mb-4">
                      <span className="font-mono text-[32px] font-bold" style={{ color: "var(--text-primary)" }}>
                        {report.narrative.accessibility_audit.total_violations}
                      </span>
                      <span className="font-mono text-[11px] ml-1.5" style={{ color: "var(--text-muted)" }}>violations</span>
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {[
                      { label: "Critical", value: report.narrative.accessibility_audit.critical, color: "var(--accent)" },
                      { label: "Serious", value: report.narrative.accessibility_audit.serious, color: "var(--status-warn)" },
                      { label: "Moderate", value: report.narrative.accessibility_audit.moderate, color: "var(--text-secondary)" },
                      { label: "Minor", value: report.narrative.accessibility_audit.minor_count, color: "var(--text-muted)" },
                    ].filter(item => item.value != null).map((item) => (
                      <div key={item.label} className="flex items-center justify-between font-mono text-[11px]">
                        <span style={{ color: item.color }}>{item.label}</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(30,34,50,0.5)" }}>
                            <div className="h-full rounded-full transition-all" style={{ backgroundColor: item.color, width: `${Math.min(((item.value || 0) / Math.max(report.narrative!.accessibility_audit!.total_violations || 1, 1)) * 100, 100)}%` }} />
                          </div>
                          <span className="tabular-nums" style={{ color: "var(--text-primary)", minWidth: 18, textAlign: "right" }}>{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ReportFolder>
              )}

              {report.narrative?.chaos_test_summary && (
                <ReportFolder
                  title="Security / Chaos Testing"
                  accentColor="var(--accent)"
                  subtitle={`${report.narrative.chaos_test_summary.inputs_tested || 0} inputs tested`}
                  icon={<Shield size={14} style={{ color: "var(--accent)" }} />}
                  defaultOpen
                >
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: "Tested", value: report.narrative.chaos_test_summary.inputs_tested, color: "var(--text-primary)" },
                      { label: "Rejected", value: report.narrative.chaos_test_summary.inputs_rejected, color: "var(--status-pass)" },
                      { label: "Accepted Bad", value: report.narrative.chaos_test_summary.inputs_accepted_incorrectly, color: (report.narrative.chaos_test_summary.inputs_accepted_incorrectly || 0) > 0 ? "var(--status-fail)" : "var(--status-pass)" },
                      { label: "Server Errors", value: report.narrative.chaos_test_summary.server_errors, color: (report.narrative.chaos_test_summary.server_errors || 0) > 0 ? "var(--status-fail)" : "var(--status-pass)" },
                    ].filter(item => item.value != null).map((item) => (
                      <div key={item.label} className="text-center p-2 rounded-lg" style={{ backgroundColor: "rgba(15,17,23,0.4)" }}>
                        <div className="font-mono text-[22px] font-bold" style={{ color: item.color }}>{item.value}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[1px] mt-0.5" style={{ color: "var(--text-muted)" }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {report.narrative.chaos_test_summary.worst_finding && (
                    <div className="p-3 rounded-lg text-[12px] leading-relaxed" style={{ backgroundColor: "rgba(232,164,74,0.04)", border: "1px solid rgba(232,164,74,0.1)", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                      {report.narrative.chaos_test_summary.worst_finding}
                    </div>
                  )}
                </ReportFolder>
              )}
            </div>

            {/* ── Recommendations ── */}
            {report.narrative?.recommendations && report.narrative.recommendations.length > 0 && (
              <ReportFolder
                title="Recommendations"
                accentColor="var(--cat-accessibility)"
                count={report.narrative.recommendations.length}
                subtitle="Actionable next steps"
                defaultOpen
                className="mb-12"
              >
                <div className="space-y-2.5">
                  {report.narrative.recommendations.map((rec, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                      className="glass-card flex gap-4 p-4"
                      style={{ borderRadius: "12px" }}
                    >
                      <span className="font-mono text-[14px] font-bold shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ color: "var(--accent)", backgroundColor: "rgba(232,164,74,0.08)" }}>{typeof rec === "object" ? rec.rank : i + 1}</span>
                      <div className="flex-1">
                        <span className="text-[14px] leading-[1.8]" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{typeof rec === "object" ? rec.action : rec}</span>
                        {typeof rec === "object" && rec.impact && (
                          <span className="block text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{rec.impact}</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ReportFolder>
            )}

            {/* ── AI Vision Annotated Screenshot ── */}
            {report.annotated_screenshot_url && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-5">
                  <div className="section-label">AI Vision Annotation</div>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                </div>
                <div
                  className="rounded-xl overflow-hidden cursor-pointer group relative"
                  style={{ border: "1px solid var(--border-default)" }}
                  onClick={() => setLightboxImg(`${API_URL}${report.annotated_screenshot_url}`)}
                >
                  {/* Header bar */}
                  <div
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{
                      backgroundColor: "rgba(10,10,12,0.8)",
                      borderBottom: "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)", opacity: 0.8 }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-warn)", opacity: 0.6 }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-pass)", opacity: 0.6 }} />
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <Eye size={11} style={{ color: "var(--accent)" }} />
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                        Gemini Vision Analysis
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: "rgb(239,68,68)" }} />
                        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>Problem</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: "rgb(234,179,8)" }} />
                        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>Warning</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: "rgb(34,197,94)" }} />
                        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>Good</span>
                      </div>
                    </div>
                  </div>
                  <img
                    src={`${API_URL}${report.annotated_screenshot_url}`}
                    alt="Annotated screenshot with issues highlighted"
                    className="w-full transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 top-[37px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ backgroundColor: "rgba(10,10,12,0.3)" }}
                  >
                    <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: "rgba(10,10,12,0.8)", backdropFilter: "blur(4px)", border: "1px solid rgba(232,164,74,0.3)" }}>
                      <span className="text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                        Click to enlarge
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] mt-2.5 leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                  Gemini 3 Flash analyzed your page screenshot and identified specific UI elements with bounding boxes. Red = problems found by agents. Green = elements that work well.
                </p>
              </div>
            )}

            {/* ── LLM Fix Prompt — the hero feature ── */}
            {report.fix_prompt && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-5">
                  <div className="section-label">Fix with AI</div>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                </div>

                {/* Explanation card */}
                <div
                  className="rounded-xl overflow-hidden mb-4"
                  style={{ border: "1px solid rgba(232,164,74,0.2)", backgroundColor: "rgba(232,164,74,0.03)" }}
                >
                  <div className="flex items-start gap-4 p-5">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "rgba(232,164,74,0.1)", border: "1px solid rgba(232,164,74,0.2)" }}
                    >
                      <Sparkles size={18} style={{ color: "var(--accent)" }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[15px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        Auto-Generated Fix Prompt
                      </h3>
                      <p className="text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                        We synthesized all {report.narrative?.top_issues?.length || 0} issues, {report.narrative?.accessibility_audit?.total_violations || 0} accessibility violations, and {report.narrative?.recommendations?.length || 0} recommendations into a single prompt. Copy it into <strong style={{ color: "var(--text-primary)" }}>ChatGPT</strong>, <strong style={{ color: "var(--text-primary)" }}>Claude</strong>, or <strong style={{ color: "var(--text-primary)" }}>Cursor</strong> to get code-level fixes.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Prompt block */}
                <div
                  className="rounded-xl overflow-hidden relative group"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  {/* Terminal header */}
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{
                      backgroundColor: "rgba(10,10,12,0.8)",
                      borderBottom: "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)", opacity: 0.8 }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-warn)", opacity: 0.6 }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-pass)", opacity: 0.6 }} />
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.1em] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                        prompt.md
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ color: "var(--text-muted)", backgroundColor: "rgba(255,255,255,0.04)" }}>
                        {report.fix_prompt.length.toLocaleString()} chars
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(report.fix_prompt!);
                          setCopiedPrompt(true);
                          setTimeout(() => setCopiedPrompt(false), 2500);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 cursor-pointer"
                        style={{
                          fontFamily: "var(--font-display)",
                          backgroundColor: copiedPrompt ? "var(--status-pass)" : "var(--accent)",
                          color: "var(--bg-base)",
                          boxShadow: copiedPrompt ? "0 0 20px rgba(34,197,94,0.3)" : "0 0 20px rgba(232,164,74,0.15)",
                        }}
                      >
                        {copiedPrompt ? (
                          <>
                            <CheckCircle2 size={12} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy Prompt</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Prompt content */}
                  <pre
                    className="whitespace-pre-wrap text-[12px] leading-[1.8] p-5 overflow-x-auto max-h-[500px] overflow-y-auto"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                      backgroundColor: "var(--bg-base)",
                    }}
                  >
                    {report.fix_prompt}
                  </pre>

                  {/* Fade out at bottom */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                    style={{ background: "linear-gradient(transparent, var(--bg-base))" }}
                  />
                </div>

                {/* Quick-paste buttons */}
                <div className="flex items-center gap-3 mt-4">
                  <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    Paste into:
                  </span>
                  {[
                    { name: "ChatGPT", url: "https://chat.openai.com" },
                    { name: "Claude", url: "https://claude.ai" },
                    { name: "Cursor", url: "https://cursor.sh" },
                  ].map((tool) => (
                    <a
                      key={tool.name}
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors duration-150 no-underline"
                      style={{
                        fontFamily: "var(--font-display)",
                        color: "var(--text-secondary)",
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid var(--border-default)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.3)"; e.currentTarget.style.color = "var(--accent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    >
                      {tool.name}
                      <ExternalLink size={9} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="h-px mb-8" style={{ backgroundColor: "var(--border-default)" }} />
            <div className="flex flex-wrap gap-3 mb-16">
              <a
                href="/"
                className="glass-card glass-card-hover flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] no-underline"
                style={{ color: "var(--text-secondary)", borderRadius: "8px" }}
              >
                Test another site
              </a>
              <button
                onClick={handleCopy}
                className="glass-card glass-card-hover flex items-center gap-2 px-4 py-2.5 font-mono text-[11px]"
                style={{ color: "var(--text-secondary)", borderRadius: "8px" }}
              >
                <Copy size={11} />
                {copied ? "Copied!" : "Share results"}
              </button>
              <button
                onClick={() => window.print()}
                className="glass-card glass-card-hover flex items-center gap-2 px-4 py-2.5 font-mono text-[11px]"
                style={{ color: "var(--text-secondary)", borderRadius: "8px" }}
              >
                <Printer size={11} />
                Print report
              </button>
            </div>

            {/* Footer */}
            <div className="font-mono text-[10px] pb-12" style={{ color: "var(--border-default)" }}>
              trashmy.tech · HackIllinois 2026
            </div>
          </motion.div>
        )}
      </main>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer p-8"
            style={{ backgroundColor: "rgba(8,9,13,0.95)", backdropFilter: "blur(8px)" }}
            onClick={() => setLightboxImg(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 20 }}
              src={lightboxImg}
              alt="Screenshot"
              className="max-w-[85vw] max-h-[85vh] rounded-xl"
              style={{ border: "1px solid rgba(30,34,50,0.5)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
            />
            <div className="absolute top-6 right-6 font-mono text-[11px] px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(30,34,50,0.4)", color: "var(--text-secondary)" }}>
              Click anywhere to close
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
