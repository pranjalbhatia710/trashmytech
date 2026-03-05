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
  Shield, Eye, Smartphone, Gauge, Users, AlertTriangle, Bot, Check, X,
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
  reasoning?: string;
  one_liner?: string;
  detail?: string;
  key_evidence?: string[];
}

interface PersonaVerdict {
  persona_id: string;
  persona_name: string;
  name?: string;
  age?: number;
  would_recommend: boolean;
  would_return?: boolean;
  trust_level?: string;
  narrative: string;
  outcome: string;
  category?: string;
  primary_barrier: string | null;
  steps_taken?: number;
  time_seconds?: number;
  emotional_journey?: string;
  key_quote?: string;
  form_verdict?: string;
  function_verdict?: string;
  purpose_verdict?: string;
  notable_moments?: string;
  issues_encountered?: string[];
}

interface TopIssue {
  rank: number;
  title: string;
  severity: string;
  category: string;
  description: string;
  affected_personas?: string[];
  persona_experiences?: string;
  fix?: string;
  impact_estimate?: string;
  implementation_complexity?: string;
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
    form_analysis?: string;
    function_analysis?: string;
    purpose_analysis?: string;
    persona_verdicts?: PersonaVerdict[];
    top_issues?: TopIssue[];
    what_works?: Array<{ title: string; detail: string; benefited?: string[]; personas_who_benefited?: string[] }>;
    what_doesnt_work?: Array<{ title: string; detail: string; persona_experiences?: string; personas_who_suffered?: string[] }>;
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
  annotated_screenshot_b64?: string;
  ai_seo?: {
    checks?: Array<{ name: string; pass: boolean; detail: string }>;
    ai_readability_score?: number;
    [key: string]: unknown;
  };
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
  ai_readability: Bot,
};

const CAT_COLORS: Record<string, string> = {
  accessibility: "var(--cat-accessibility)",
  security: "var(--cat-security)",
  usability: "var(--cat-usability)",
  mobile: "var(--cat-mobile)",
  performance: "var(--cat-performance)",
  ai_readability: "var(--cat-ai-seo)",
};

const CAT_LABELS: Record<string, string> = {
  accessibility: "Accessibility",
  security: "Security",
  usability: "Usability",
  mobile: "Mobile",
  performance: "Performance",
  ai_readability: "AI Readability",
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
    } else if (p === "swarming" && (msg.type as string) === "log") {
      const level = (msg.level as string) || "info";
      addLog(level as LogEntry["level"], (msg.message as string) || "");
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
      <motion.div
        className="fixed inset-0 z-0"
        animate={{ opacity: phase === "reporting" ? 0.85 : phase === "swarming" ? 0.6 : 0.5 }}
        transition={{ duration: 2 }}
      >
        <NeuralBackground
          color="#e8a44a"
          trailOpacity={0.05}
          particleCount={350}
          speed={0.5}
          intensity={
            phase === "connecting" ? 0.2 :
            phase === "crawling" ? 0.4 :
            phase === "swarming" ? 0.7 :
            phase === "reporting" ? 1.0 :
            0.3
          }
          orbit={phase === "reporting"}
        />
      </motion.div>
      <motion.div
        className="fixed inset-0 z-[1] pointer-events-none"
        animate={{
          background: phase === "reporting"
            ? "radial-gradient(ellipse at 50% 45%, transparent 0%, rgba(10,10,12,0.05) 40%, rgba(10,10,12,0.4) 100%)"
            : phase === "swarming"
            ? "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,12,0.15) 45%, rgba(10,10,12,0.65) 100%)"
            : "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,12,0.2) 45%, rgba(10,10,12,0.7) 100%)",
        }}
        transition={{ duration: 2 }}
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
            className="max-w-[760px] mx-auto"
          >
            {/* Crawl intel */}
            {crawlData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                {/* Title + load time */}
                <div className="flex items-baseline justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {crawlData.page_title && (
                      <h2 className="text-[16px] font-semibold truncate" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        {crawlData.page_title.replace(/[\u{1F300}-\u{1FAD6}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "").trim()}
                      </h2>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 shrink-0 ml-4">
                    <span className="text-[20px] font-bold tabular-nums leading-none" style={{ fontFamily: "var(--font-display)", color: (crawlData.load_time_ms || 0) > 3000 ? "var(--status-warn)" : "var(--text-primary)" }}>
                      {((crawlData.load_time_ms || 0) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                {/* Stat pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { val: crawlData.links_count || 0, label: "links" },
                    { val: crawlData.forms_count || 0, label: "forms" },
                    { val: crawlData.buttons_count || 0, label: "buttons" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{s.val}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{s.label}</span>
                    </div>
                  ))}
                  {(crawlData.accessibility_violations_count || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>{crawlData.accessibility_violations_count}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>violations</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Progress — thin ambient bar ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                  {phase === "connecting" ? "Connecting..." : phase === "crawling" ? "Scanning site..." : phase === "reporting" ? "Writing report..." : `${sortedAgents.filter(a => a.status === "running").length} agents active`}
                </span>
                <span className="text-[11px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {doneCount}/{totalAgents}
                </span>
              </div>
              <div className="h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / totalAgents) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            {/* ── Live Browser Viewer — crawling phase: show embedded site ── */}
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
                  showEmbed={!crawlScreenshot}
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
                    <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
                      Watching <strong style={{ color: "var(--text-primary)" }}>{selectedAgent.name}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    step {liveScreenshots.get(selectedAgent.id)?.step || 0}
                  </span>
                </div>
                <LiveBrowserViewer
                  screenshot={liveScreenshots.get(selectedAgent.id)?.b64}
                  fallbackScreenshot={crawlScreenshot ?? undefined}
                  agentName={selectedAgent.name}
                  step={liveScreenshots.get(selectedAgent.id)?.step}
                  url={testUrl}
                  annotated={annotatedScreenshots.has(selectedAgent.id)}
                />
              </motion.div>
            )}

            {/* ── Agent roster — compact persona-driven layout ── */}
            {(phase === "swarming" || phase === "crawling") && sortedAgents.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    Agents
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {sortedAgents.filter(a => a.status === "running").length} active / {sortedAgents.filter(a => a.status === "complete").length} done
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                  <AnimatePresence mode="popLayout">
                    {sortedAgents.map((agent, idx) => (
                      <motion.div
                        key={agent.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: idx * 0.02, duration: 0.3 }}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className="group cursor-pointer relative overflow-hidden rounded-lg px-3 py-2.5 transition-all duration-200"
                        style={{
                          backgroundColor: selectedAgentId === agent.id ? "rgba(232,164,74,0.06)" : "var(--bg-surface)",
                          border: `1px solid ${selectedAgentId === agent.id ? "rgba(232,164,74,0.2)" : "var(--border-default)"}`,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* Avatar */}
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                            style={{
                              backgroundColor: `${catColor(agent.category)}12`,
                              color: catColor(agent.category),
                              fontFamily: "var(--font-display)",
                              border: `1px solid ${catColor(agent.category)}25`,
                            }}
                          >
                            {initials(agent.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                              {agent.name.split(" ")[0]}
                            </div>
                          </div>
                          {/* Status indicator */}
                          <div className="relative shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full" style={{
                              backgroundColor:
                                agent.status === "running" ? "var(--status-pass)" :
                                agent.status === "complete" ? "var(--cat-accessibility)" :
                                agent.status === "blocked" ? "var(--status-fail)" :
                                agent.status === "stuck" ? "var(--status-warn)" : "var(--border-default)",
                            }} />
                            {agent.status === "running" && (
                              <div className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: "var(--status-pass)", opacity: 0.4 }} />
                            )}
                          </div>
                        </div>

                        {/* Status text */}
                        <div className="text-[9px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {agent.status === "running" ? (
                            agent.steps.length > 0 ? `step ${agent.steps.length} · ${agent.steps[agent.steps.length-1]?.action}` : "starting..."
                          ) : agent.status === "complete" ? (
                            <span style={{ color: "var(--cat-accessibility)" }}>{((agent.timeMs || 0) / 1000).toFixed(1)}s · {agent.issuesFound || 0} issues</span>
                          ) : agent.status === "blocked" ? (
                            <span style={{ color: "var(--status-fail)" }}>blocked</span>
                          ) : (
                            "queued"
                          )}
                        </div>

                        {/* Bottom accent line */}
                        <div className="absolute bottom-0 left-0 right-0 h-px" style={{
                          backgroundColor: agent.status === "running" ? "var(--status-pass)" :
                                           agent.status === "complete" ? "var(--cat-accessibility)" :
                                           agent.status === "blocked" ? "var(--status-fail)" : "transparent",
                          opacity: 0.4,
                        }} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
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
                  <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid rgba(232,164,74,0.12)" }}>
                    {/* Agent identity bar */}
                    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: `${catColor(selectedAgent.category)}15`, color: catColor(selectedAgent.category), fontFamily: "var(--font-display)" }}
                      >
                        {initials(selectedAgent.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                          {selectedAgent.name}{selectedAgent.age ? `, ${selectedAgent.age}` : ""}
                        </div>
                        <div className="text-[11px] leading-snug" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                          {selectedAgent.description}
                        </div>
                      </div>
                      <button onClick={() => setSelectedAgentId(null)} className="text-[10px] px-2 py-1 rounded cursor-pointer" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", backgroundColor: "var(--bg-elevated)" }}>
                        close
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-0">
                      {/* Step trace */}
                      <div className="p-3 max-h-[240px] overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)" }}>
                        <div className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Trace</div>
                        <div className="space-y-0.5">
                          {selectedAgent.steps.map((step) => (
                            <motion.div
                              key={step.step}
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex gap-2 text-[10px] py-0.5"
                            >
                              <span className="w-4 text-right shrink-0 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}>{step.step}</span>
                              <span className="shrink-0 font-semibold" style={{
                                fontFamily: "var(--font-mono)",
                                color: step.result === "success" ? "var(--status-pass)" : "var(--status-fail)",
                              }}>
                                {step.action}
                              </span>
                              <span className="truncate" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{step.target}</span>
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

                      {/* Findings */}
                      <div className="p-3 max-h-[240px] overflow-y-auto">
                        {selectedAgent.findings.length > 0 ? (
                          <>
                            <div className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                              {selectedAgent.findings.length} finding{selectedAgent.findings.length !== 1 ? "s" : ""}
                            </div>
                            <div className="space-y-2">
                              {selectedAgent.findings.map((f, i) => (
                                <div key={i} className="flex gap-2">
                                  <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: f.type === "critical" ? "var(--status-fail)" : "var(--status-warn)" }} />
                                  <div>
                                    <div className="text-[11px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{f.title}</div>
                                    <div className="text-[10px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{f.detail}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full py-8">
                            <span className="text-[11px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                              {selectedAgent.status === "running" ? "Testing in progress..." : "No issues found"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Event log ── */}
            <div ref={logRef} className="p-3 max-h-32 overflow-y-auto rounded-lg mb-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              {logs.slice(0, 40).map((log, i) => (
                <div key={i} className="flex gap-2 mb-0.5 leading-relaxed text-[10px]">
                  <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}>{log.time}</span>
                  <span style={{
                    fontFamily: log.level === "error" || log.level === "warning" ? "var(--font-display)" : "var(--font-body)",
                    fontWeight: log.level === "error" ? 600 : 400,
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

            {/* ── Cinematic Reporting Phase — orb + timer ── */}
            {phase === "reporting" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24"
              >
                {/* Orb */}
                <div className="relative w-[160px] h-[160px] mb-8">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "1px solid rgba(232,164,74,0.15)" }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute rounded-full"
                    style={{ inset: "20px", border: "1px solid rgba(232,164,74,0.1)" }}
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute rounded-full"
                    style={{ inset: "40px", border: "1px solid rgba(232,164,74,0.2)" }}
                    animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      inset: "55px",
                      background: "radial-gradient(circle, rgba(232,164,74,0.2) 0%, rgba(232,164,74,0.05) 60%, transparent 100%)",
                    }}
                    animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  />
                  {/* Timer in the center of the orb */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.span
                      key={elapsed}
                      initial={{ scale: 1.1, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="text-[28px] font-bold tabular-nums"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}
                    >
                      {elapsed}
                    </motion.span>
                  </div>
                  {/* Orbiting dots */}
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 rounded-full"
                      style={{
                        backgroundColor: "var(--accent)",
                        top: "50%", left: "50%",
                        marginTop: "-2px", marginLeft: "-2px",
                      }}
                      animate={{
                        x: [
                          Math.cos((i / 3) * Math.PI * 2) * 76,
                          Math.cos((i / 3) * Math.PI * 2 + Math.PI * 2) * 76,
                        ],
                        y: [
                          Math.sin((i / 3) * Math.PI * 2) * 76,
                          Math.sin((i / 3) * Math.PI * 2 + Math.PI * 2) * 76,
                        ],
                      }}
                      transition={{ repeat: Infinity, duration: 6 + i * 2, ease: "linear" }}
                    />
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                    Generating report
                  </span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-[11px] mt-2"
                  style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
                >
                  {doneCount} agents &middot; {issueCount} issues
                </motion.div>
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
            className="max-w-[960px] mx-auto mt-4 pb-16"
          >
            {/* ── Score Hero — horizontal layout ── */}
            <div className="mb-12">
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-8 items-center">
                {/* Score */}
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12, delay: 0.15 }} className="text-center sm:text-left">
                  <span
                    className="text-[80px] font-bold leading-none tracking-tighter"
                    style={{ fontFamily: "var(--font-display)", color: scoreColor(report.score?.overall ?? 0) }}
                  >
                    {animatedScore}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] mt-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    <span>{report.stats?.total || 0} personas</span>
                    <span style={{ color: "var(--border-default)" }}>/</span>
                    <span style={{ color: issueCount > 5 ? "var(--status-fail)" : "var(--text-muted)" }}>{issueCount} issues</span>
                    <span style={{ color: "var(--border-default)" }}>/</span>
                    <span>{elapsed}s</span>
                  </div>
                </motion.div>
                {/* Reasoning */}
                {report.score?.reasoning && (
                  <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <p className="text-[14px] leading-[1.7]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                      {report.score.reasoning}
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Quick action bar — copy to LLM */}
              <div className="flex items-center gap-3 mt-6 pt-6" style={{ borderTop: "1px solid var(--border-default)" }}>
                {report.fix_prompt && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(report.fix_prompt || ""); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2000); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundColor: copiedPrompt ? "rgba(74,222,128,0.1)" : "rgba(232,164,74,0.08)",
                      color: copiedPrompt ? "var(--status-pass)" : "var(--accent)",
                      border: `1px solid ${copiedPrompt ? "rgba(74,222,128,0.2)" : "rgba(232,164,74,0.15)"}`,
                    }}
                  >
                    <Copy size={11} />
                    {copiedPrompt ? "Copied to clipboard" : "Copy fix prompt for LLM"}
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                >
                  <Copy size={11} />
                  {copied ? "Copied" : "Share link"}
                </button>
                <a
                  href="/"
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors no-underline ml-auto"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                >
                  Test another site
                </a>
              </div>
            </div>

            {/* ── Category Scores — clean horizontal ── */}
            {report.category_scores && (
              <TooltipProvider delayDuration={100}>
                <div className="mb-16">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    {(["accessibility", "security", "usability", "mobile", "performance", "ai_readability"] as const).map((cat, idx) => {
                      const cs = report.category_scores?.[cat];
                      if (!cs) return null;
                      const Icon = CAT_ICONS[cat] || Shield;
                      const color = CAT_COLORS[cat] || "var(--text-muted)";
                      const label = CAT_LABELS[cat] || cat;
                      return (
                        <Tooltip key={cat}>
                          <TooltipTrigger asChild>
                            <motion.div
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                              className="cursor-default"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2.5">
                                  <Icon size={13} style={{ color }} />
                                  <span className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>{label}</span>
                                </div>
                                <span className="text-[13px] font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)", color: scoreColor(cs.score) }}>
                                  {cs.score}
                                </span>
                              </div>
                              <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: scoreColor(cs.score) }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${cs.score}%` }}
                                  transition={{ duration: 0.8, delay: 0.2 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                                />
                              </div>
                            </motion.div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[340px]">
                            <p className="text-[11px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{label} — {cs.score}/100</p>
                            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cs.detail || cs.reasoning || cs.one_liner}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </TooltipProvider>
            )}

            {/* ── Summary ── */}
            {report.narrative?.executive_summary && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <p className="text-[15px] leading-[1.8] pl-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", borderLeft: "2px solid var(--accent)" }}>
                  {report.narrative.executive_summary}
                </p>
              </div>
            )}

            {/* ── Form / Function / Purpose Analysis ── */}
            {(report.narrative?.form_analysis || report.narrative?.function_analysis || report.narrative?.purpose_analysis) && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-6" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Deep Analysis</div>
                <div className="space-y-6">
                  {report.narrative?.form_analysis && (
                    <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(139, 92, 246, 0.03)", border: "1px solid rgba(139, 92, 246, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Eye size={13} style={{ color: "#8b5cf6" }} />
                        <span className="text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "#8b5cf6" }}>Form &mdash; Visual Design</span>
                      </div>
                      <p className="text-[13px] leading-[1.8] whitespace-pre-line" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                        {report.narrative.form_analysis}
                      </p>
                    </div>
                  )}
                  {report.narrative?.function_analysis && (
                    <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(59, 130, 246, 0.03)", border: "1px solid rgba(59, 130, 246, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Gauge size={13} style={{ color: "#3b82f6" }} />
                        <span className="text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "#3b82f6" }}>Function &mdash; Does It Work?</span>
                      </div>
                      <p className="text-[13px] leading-[1.8] whitespace-pre-line" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                        {report.narrative.function_analysis}
                      </p>
                    </div>
                  )}
                  {report.narrative?.purpose_analysis && (
                    <div className="p-4 rounded-lg" style={{ backgroundColor: "rgba(232, 164, 74, 0.03)", border: "1px solid rgba(232, 164, 74, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Users size={13} style={{ color: "var(--accent)" }} />
                        <span className="text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>Purpose &mdash; Does It Achieve Its Goal?</span>
                      </div>
                      <p className="text-[13px] leading-[1.8] whitespace-pre-line" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                        {report.narrative.purpose_analysis}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Top Issues ── */}
            {report.narrative?.top_issues && report.narrative.top_issues.length > 0 && (
              <div className="mb-14">
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-5" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Issues</div>
                <div className="space-y-3">
                  {report.narrative.top_issues.map((issue: TopIssue, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex gap-3 p-4 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid var(--border-default)" }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: severityColor(issue.severity?.toLowerCase() || "minor") }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{issue.title}</span>
                          <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ fontFamily: "var(--font-display)", color: severityColor(issue.severity?.toLowerCase() || "minor") }}>{issue.severity}</span>
                          {issue.implementation_complexity && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>
                              {issue.implementation_complexity} fix
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{issue.description}</p>
                        {issue.persona_experiences && (
                          <p className="text-[11px] leading-relaxed mt-1.5 italic" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{issue.persona_experiences}</p>
                        )}
                        {issue.affected_personas && issue.affected_personas.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {issue.affected_personas.map((name, j) => (
                              <span key={j} className="text-[9px] px-1.5 py-0.5 rounded" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(255,255,255,0.03)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        {issue.fix && (
                          <p className="text-[11px] mt-2 px-2.5 py-1.5 rounded" style={{ fontFamily: "var(--font-mono)", color: "var(--status-pass)", backgroundColor: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.08)" }}>
                            Fix: {issue.fix}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* ── AI & Search Readiness — primary section ── */}
            {report.ai_seo?.checks && report.ai_seo.checks.length > 0 && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Bot size={14} style={{ color: "var(--cat-ai-seo)" }} />
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>AI & Search Readiness</span>
                  </div>
                  {report.ai_seo.ai_readability_score !== undefined && (
                    <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: scoreColor(report.ai_seo.ai_readability_score) }}>
                      {report.ai_seo.ai_readability_score}/100
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.ai_seo.checks.map((check: { name: string; pass: boolean; detail: string }, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}>
                      <div className="mt-0.5 shrink-0">
                        {check.pass ? (
                          <Check size={11} style={{ color: "var(--status-pass)" }} />
                        ) : (
                          <X size={11} style={{ color: "var(--status-fail)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium" style={{ fontFamily: "var(--font-display)", color: check.pass ? "var(--text-secondary)" : "var(--text-primary)" }}>{check.name}</span>
                        <div className="text-[10px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{check.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Persona Results — rich analysis cards ── */}
            {report.narrative?.persona_verdicts && report.narrative.persona_verdicts.length > 0 && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-5" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Agent Reports</div>
                <div className="space-y-4">
                  {report.narrative.persona_verdicts.map((v: PersonaVerdict, i: number) => {
                    const session = report.sessions_summary?.find(s => s.persona_id === v.persona_id);
                    const screenshots = session?.screenshots?.filter(s => s.screenshot_url || s.screenshot_b64) || [];
                    const agentData = agentList.find(a => a.id === v.persona_id);
                    const color = catColor(v.category || "");
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-xl overflow-hidden"
                        style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}
                      >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-default)", backgroundColor: "rgba(255,255,255,0.01)" }}>
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: `${color}15`, color, fontFamily: "var(--font-display)" }}
                          >
                            {initials(v.name || v.persona_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                                {v.name || v.persona_name}
                              </span>
                              {v.age && <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>age {v.age}</span>}
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ fontFamily: "var(--font-mono)", color }}>
                              {v.category}{v.steps_taken ? ` · ${v.steps_taken} steps` : ""}{v.time_seconds ? ` · ${v.time_seconds}s` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {v.trust_level && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                                fontFamily: "var(--font-display)",
                                backgroundColor: v.trust_level === "high" ? "rgba(74,222,128,0.08)" : v.trust_level === "medium" ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)",
                                color: v.trust_level === "high" ? "var(--status-pass)" : v.trust_level === "medium" ? "var(--status-warn)" : "var(--status-fail)",
                              }}>
                                trust: {v.trust_level}
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                              fontFamily: "var(--font-display)",
                              backgroundColor: v.outcome === "completed" ? "rgba(74,222,128,0.08)" : v.outcome === "blocked" ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)",
                              color: v.outcome === "completed" ? "var(--status-pass)" : v.outcome === "blocked" ? "var(--status-fail)" : "var(--status-warn)",
                            }}>
                              {v.outcome}
                            </span>
                            {v.would_return !== undefined && (
                              <span className="text-[9px]" style={{ color: v.would_return ? "var(--status-pass)" : "var(--status-fail)" }}>
                                {v.would_return ? "would return" : "wouldn't return"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Key Quote */}
                        {v.key_quote && (
                          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-default)", backgroundColor: `${color}04` }}>
                            <p className="text-[12px] leading-relaxed italic" style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
                              &ldquo;{v.key_quote}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Body */}
                        <div className="px-4 py-3">
                          {/* Emotional journey */}
                          {v.emotional_journey && (
                            <p className="text-[11px] leading-relaxed mb-3" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                              {v.emotional_journey}
                            </p>
                          )}

                          {/* Narrative */}
                          {v.narrative && !v.emotional_journey && (
                            <p className="text-[11px] leading-relaxed mb-3" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                              {v.narrative}
                            </p>
                          )}

                          {/* Form / Function / Purpose verdicts */}
                          {(v.form_verdict || v.function_verdict || v.purpose_verdict) && (
                            <div className="space-y-2 mb-3">
                              {v.form_verdict && (
                                <div className="p-2.5 rounded-lg" style={{ backgroundColor: "rgba(139, 92, 246, 0.03)", border: "1px solid rgba(139, 92, 246, 0.08)" }}>
                                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ fontFamily: "var(--font-display)", color: "#8b5cf6" }}>Form</div>
                                  <p className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{v.form_verdict}</p>
                                </div>
                              )}
                              {v.function_verdict && (
                                <div className="p-2.5 rounded-lg" style={{ backgroundColor: "rgba(59, 130, 246, 0.03)", border: "1px solid rgba(59, 130, 246, 0.08)" }}>
                                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ fontFamily: "var(--font-display)", color: "#3b82f6" }}>Function</div>
                                  <p className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{v.function_verdict}</p>
                                </div>
                              )}
                              {v.purpose_verdict && (
                                <div className="p-2.5 rounded-lg" style={{ backgroundColor: "rgba(232, 164, 74, 0.03)", border: "1px solid rgba(232, 164, 74, 0.08)" }}>
                                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>Purpose</div>
                                  <p className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{v.purpose_verdict}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Notable moments */}
                          {v.notable_moments && (
                            <p className="text-[10px] leading-relaxed mb-2 pl-2.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", borderLeft: `2px solid ${color}` }}>
                              {v.notable_moments}
                            </p>
                          )}

                          {/* Issues encountered */}
                          {v.issues_encountered && v.issues_encountered.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[9px] uppercase tracking-[0.1em] mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>Issues hit</div>
                              <div className="space-y-0.5">
                                {v.issues_encountered.slice(0, 4).map((issue, j) => (
                                  <div key={j} className="flex items-start gap-1.5 text-[10px]">
                                    <X size={9} className="mt-0.5 shrink-0" style={{ color: "var(--status-fail)" }} />
                                    <span style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{issue}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {v.primary_barrier && (
                            <div className="text-[10px] mb-2 px-2 py-1.5 rounded" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)", color: "var(--status-fail)" }}>
                              {v.primary_barrier}
                            </div>
                          )}

                          {/* Agent steps summary */}
                          {agentData && agentData.steps.length > 0 && (
                            <details className="mb-2 group">
                              <summary className="text-[9px] uppercase tracking-[0.1em] cursor-pointer list-none flex items-center gap-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                                <ChevronDown size={10} className="transition-transform group-open:rotate-180" style={{ color: "var(--text-muted)" }} />
                                {agentData.steps.length} steps taken
                              </summary>
                              <div className="space-y-0.5 mt-1.5 pl-3">
                                {agentData.steps.slice(0, 8).map((step) => (
                                  <div key={step.step} className="flex gap-1.5 text-[9px]">
                                    <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}>{step.step}</span>
                                    <span className="shrink-0 font-semibold" style={{
                                      fontFamily: "var(--font-mono)",
                                      color: step.result === "success" ? "var(--status-pass)" : "var(--status-fail)",
                                    }}>
                                      {step.action}
                                    </span>
                                    <span className="truncate" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{step.target}</span>
                                  </div>
                                ))}
                                {agentData.steps.length > 8 && (
                                  <div className="text-[9px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>+{agentData.steps.length - 8} more</div>
                                )}
                              </div>
                            </details>
                          )}

                          {/* Screenshots inline */}
                          {screenshots.length > 0 && (
                            <div className="flex gap-1.5 mt-2">
                              {screenshots.slice(0, 3).map((ss, j) => {
                                const src = ss.screenshot_b64
                                  ? `data:image/jpeg;base64,${ss.screenshot_b64}`
                                  : ss.screenshot_url || "";
                                return (
                                  <div
                                    key={j}
                                    className="flex-1 rounded overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
                                    style={{ border: "1px solid var(--border-default)" }}
                                    onClick={() => setLightboxImg(src)}
                                  >
                                    <img src={src} alt={`Step ${ss.step}`} className="w-full aspect-[16/10] object-cover object-top" />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── What Works / What Doesn't — side by side ── */}
            {(report.narrative?.what_works?.length || report.narrative?.what_doesnt_work?.length) ? (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  {report.narrative?.what_works && report.narrative.what_works.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 size={13} style={{ color: "var(--status-pass)" }} />
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Works</span>
                      </div>
                      <div className="space-y-3">
                        {report.narrative.what_works.slice(0, 4).map((item, i) => (
                          <div key={i}>
                            <div className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{item.title}</div>
                            <p className="text-[11px] leading-relaxed mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.narrative?.what_doesnt_work && report.narrative.what_doesnt_work.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <XCircle size={13} style={{ color: "var(--status-fail)" }} />
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Doesn&apos;t Work</span>
                      </div>
                      <div className="space-y-3">
                        {report.narrative.what_doesnt_work.slice(0, 4).map((item, i) => (
                          <div key={i}>
                            <div className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{item.title}</div>
                            <p className="text-[11px] leading-relaxed mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── Accessibility Audit ── */}
            {report.narrative?.accessibility_audit && (report.narrative.accessibility_audit.total_violations || 0) > 0 && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <Eye size={14} style={{ color: "var(--cat-accessibility)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Accessibility Audit</span>
                </div>
                <div className="flex flex-wrap gap-3 mb-4">
                  {[
                    { label: "Critical", val: report.narrative.accessibility_audit.critical || 0, color: "var(--status-fail)" },
                    { label: "Serious", val: report.narrative.accessibility_audit.serious || 0, color: "var(--status-warn)" },
                    { label: "Moderate", val: report.narrative.accessibility_audit.moderate || 0, color: "var(--accent)" },
                    { label: "Minor", val: report.narrative.accessibility_audit.minor_count || 0, color: "var(--text-muted)" },
                  ].filter(s => s.val > 0).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: s.color }}>{s.val}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{s.label}</span>
                    </div>
                  ))}
                  {(report.narrative.accessibility_audit.images_missing_alt || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--status-warn)" }}>{report.narrative.accessibility_audit.images_missing_alt}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>images missing alt</span>
                    </div>
                  )}
                </div>
                {report.narrative.accessibility_audit.details && report.narrative.accessibility_audit.details.length > 0 && (
                  <div className="space-y-1.5">
                    {report.narrative.accessibility_audit.details.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "var(--cat-accessibility)" }} />
                        <span style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Chaos / Security Test Summary ── */}
            {report.narrative?.chaos_test_summary && (report.narrative.chaos_test_summary.inputs_tested || 0) > 0 && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <Shield size={14} style={{ color: "var(--cat-security)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Security / Chaos Testing</span>
                </div>
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{report.narrative.chaos_test_summary.inputs_tested}</span>
                    <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>inputs tested</span>
                  </div>
                  {(report.narrative.chaos_test_summary.inputs_accepted_incorrectly || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>{report.narrative.chaos_test_summary.inputs_accepted_incorrectly}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>accepted bad input</span>
                    </div>
                  )}
                  {(report.narrative.chaos_test_summary.server_errors || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>{report.narrative.chaos_test_summary.server_errors}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>server errors</span>
                    </div>
                  )}
                </div>
                {report.narrative.chaos_test_summary.worst_finding && (
                  <p className="text-[12px] leading-relaxed pl-4" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", borderLeft: "2px solid var(--cat-security)" }}>
                    {report.narrative.chaos_test_summary.worst_finding}
                  </p>
                )}
              </div>
            )}

            {/* ── Recommendations ── */}
            {report.narrative?.recommendations && report.narrative.recommendations.length > 0 && (
              <div className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-5" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Recommendations</div>
                <div className="space-y-3">
                  {report.narrative.recommendations.map((rec, i) => {
                    const isObj = typeof rec === "object";
                    return (
                      <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}>
                        <span className="text-[14px] font-bold tabular-nums shrink-0 mt-0.5" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                              {isObj ? rec.action : rec}
                            </span>
                            {isObj && (rec as { complexity?: string }).complexity && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>
                                {(rec as { complexity?: string }).complexity}
                              </span>
                            )}
                          </div>
                          {isObj && rec.impact && (
                            <div className="text-[11px] mt-1 leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{rec.impact}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Annotated Screenshot ── */}
            {(report.annotated_screenshot_url || report.annotated_screenshot_b64) && (
              <div className="mb-14">
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Annotated Screenshot</div>
                <img
                  src={report.annotated_screenshot_b64 ? `data:image/png;base64,${report.annotated_screenshot_b64}` : report.annotated_screenshot_url}
                  alt="Annotated screenshot"
                  className="w-full rounded-lg cursor-pointer transition-opacity hover:opacity-90"
                  style={{ border: "1px solid var(--border-default)" }}
                  onClick={() => setLightboxImg(report.annotated_screenshot_b64 ? `data:image/png;base64,${report.annotated_screenshot_b64}` : report.annotated_screenshot_url || null)}
                />
              </div>
            )}

            {/* ── Bottom Action Bar ── */}
            <div className="h-px mb-8" style={{ backgroundColor: "var(--border-default)" }} />
            <div className="flex items-center gap-3 flex-wrap">
              {report.fix_prompt && (
                <button
                  onClick={() => { navigator.clipboard.writeText(report.fix_prompt || ""); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2000); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                  style={{
                    fontFamily: "var(--font-display)",
                    backgroundColor: copiedPrompt ? "rgba(74,222,128,0.1)" : "rgba(232,164,74,0.08)",
                    color: copiedPrompt ? "var(--status-pass)" : "var(--accent)",
                    border: `1px solid ${copiedPrompt ? "rgba(74,222,128,0.2)" : "rgba(232,164,74,0.15)"}`,
                  }}
                >
                  <Sparkles size={11} />
                  {copiedPrompt ? "Copied to clipboard" : "Copy AI fix prompt"}
                </button>
              )}
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
              >
                <Copy size={11} />
                {copied ? "Copied" : "Share"}
              </button>
              <a
                href="/"
                className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors no-underline ml-auto"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
              >
                Test another site
              </a>
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
