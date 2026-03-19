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
const PrismaticBurst = dynamic(
  () => import("@/components/ui/prismatic-burst"),
  { ssr: false }
);
import { useScene } from "@/components/three/SceneContext";
import CounterLoader from "@/components/ui/counter-loader";
import { LiveBrowserViewer } from "@/components/ui/live-browser-viewer";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { AnimatedBar } from "@/components/ui/animated-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Shield, Eye, Smartphone, Gauge, Users, AlertTriangle, Bot, Check, X,
  CheckCircle2, XCircle, ChevronDown, ExternalLink, Copy, Sparkles,
  ArrowRight, BarChart3, Zap, FileText, Share2,
} from "lucide-react";
import { ToastNotification } from "@/components/ui/toast-notification";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { CachedReportBanner } from "@/components/ui/cached-report-banner";
import { DEMO_AGENTS, DEMO_REPORT, DEMO_CRAWL_DATA, DEMO_LOGS, DEMO_URL } from "@/lib/demo-data";
import { EBAY_AGENTS, EBAY_REPORT, EBAY_CRAWL_DATA, EBAY_LOGS, EBAY_URL } from "@/lib/ebay-demo-data";

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
  narrative?: string;
  outcome: string;
  category?: string;
  primary_barrier?: string | null;
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
  score?: { overall: number; reasoning?: string; confidence?: string; letter_grade?: string };
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
  composite_scores?: Record<string, unknown>;
  quick_wins?: Array<{
    action: string;
    details: string;
    category: string;
    estimated_points_category: number;
    estimated_points_overall: number;
    difficulty: string;
    affected_personas?: string[];
  }>;
  fix_prompt?: string;
  annotated_screenshot_url?: string;
  annotated_screenshot_b64?: string;
  audit_mode?: string;
  cached?: boolean;
  cached_at?: string | number;
  created_at?: string | number;
  ai_seo?: {
    checks?: Array<{ name: string; pass: boolean; detail: string }>;
    ai_readability_score?: number;
    [key: string]: unknown;
  };
  emotional_journeys?: Record<string, {
    stages: Array<{
      stage: string;
      confusion: number;
      trust: number;
      frustration: number;
      delight: number;
      intent_to_return: number;
    }>;
    overall_sentiment: string;
  }>;
  user_voices?: Record<string, {
    verbatim_feedback: string;
    one_word_feeling: string;
  }>;
  the_one_thing?: string;
  workflow?: {
    site_type?: string;
    primary_workflow?: string;
    workflow_steps?: string[];
    secondary_workflows?: string[];
    drop_off_risk_points?: string[];
  };
  funnel_analysis?: {
    funnel_stages?: Array<{
      step: string;
      attempted: number;
      completed: number;
      drop_off_rate: number;
      primary_blockers: string[];
    }>;
    biggest_drop_off?: string;
    conversion_estimate?: string;
  };
  consolidated?: {
    executive_narrative?: string;
    grade_justification?: string;
    risk_assessment?: string;
    competitive_position?: string;
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
  if (score >= 70) return "var(--status-pass)";
  if (score >= 55) return "#84cc16";
  if (score >= 35) return "var(--status-warn)";
  return "var(--status-fail)";
}

function gradeFromScore(score: number): { letter: string; color: string } {
  if (score >= 85) return { letter: "A", color: "#22c55e" };
  if (score >= 70) return { letter: "B", color: "#84cc16" };
  if (score >= 65) return { letter: "C", color: "#f59e0b" };
  if (score >= 45) return { letter: "D", color: "#f97316" };
  return { letter: "F", color: "#ef4444" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CAT_ICONS: Record<string, any> = {
  accessibility: Eye,
  seo: Bot,
  performance: Gauge,
  content: FileText,
  security: Shield,
  ux: Users,
};

const CAT_COLORS: Record<string, string> = {
  accessibility: "var(--cat-accessibility)",
  seo: "var(--cat-ai-seo)",
  performance: "var(--cat-performance)",
  content: "var(--cat-mobile)",
  security: "var(--cat-security)",
  ux: "var(--cat-usability)",
};

const CAT_LABELS: Record<string, string> = {
  accessibility: "Accessibility",
  seo: "SEO & AI Readability",
  performance: "Performance",
  content: "Content Quality",
  security: "Security",
  ux: "Usability & UX",
};

// ── Component ──────────────────────────────────────────────────
export default function TestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const isEbayDemo = testId === "ebay";
  const isDemo = testId === "demo" || isEbayDemo;
  const testUrl = isEbayDemo ? EBAY_URL : testId === "demo" ? DEMO_URL : (searchParams.get("url") || "");

  const [phase, setPhase] = useState<Phase>("connecting");
  const [agents, setAgents] = useState<Map<string, AgentData>>(new Map());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [expectedAgentCount, setExpectedAgentCount] = useState(0);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveScreenshots, setLiveScreenshots] = useState<Map<string, { b64: string; step: number }>>(new Map());
  const [annotatedScreenshots, setAnnotatedScreenshots] = useState<Map<string, string>>(new Map());
  const [crawlScreenshot, setCrawlScreenshot] = useState<string | null>(null);
  const [crawlStep, setCrawlStep] = useState(0);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [formWord, setFormWord] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastVariant, setToastVariant] = useState<"success" | "error" | "info">("success");

  const logRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

  // Sync with 3D scene context
  const scene = useScene();
  useEffect(() => { scene.setPhase(phase); }, [phase, scene]);
  useEffect(() => {
    const s = Number(report?.score?.overall ?? report?.composite_scores?.overall_score ?? 0);
    if (s) scene.setScore(s);
  }, [report, scene]);
  useEffect(() => {
    scene.setAgentProgress(agents.size, doneCount);
  }, [agents.size, doneCount, scene]);

  // Fetch keyword for background text formation during loading
  useEffect(() => {
    if (!testUrl || phase === "done") { setFormWord(""); return; }
    const controller = new AbortController();
    fetch(
      `${API_URL}/v1/keyword?url=${encodeURIComponent(testUrl)}`,
      { signal: controller.signal }
    )
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.keyword && !controller.signal.aborted) setFormWord(d.keyword); })
      .catch(() => { });
    return () => controller.abort();
  }, [testUrl, phase]);

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

  // REST fallback: poll for report if WS didn't deliver it
  useEffect(() => {
    if (isDemo || phase !== "reporting") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/v1/tests/${testId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "complete" && data.report) {
          setReport(data.report as Report);
          setPhase("done");
          addLog("success", "report ready");
          clearInterval(poll);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [phase, testId, isDemo, addLog]);

  // Auto-scroll log to top (newest entries are prepended)
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  // Demo mode (demo + ebay)
  useEffect(() => {
    if (!isDemo) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const demoAgents: any[] = isEbayDemo ? [...EBAY_AGENTS] : DEMO_AGENTS;
    const demoReport = isEbayDemo ? EBAY_REPORT : DEMO_REPORT;
    const demoCrawl = isEbayDemo ? EBAY_CRAWL_DATA : DEMO_CRAWL_DATA;
    const demoLogs = isEbayDemo ? EBAY_LOGS : DEMO_LOGS;

    const agentMap = new Map<string, AgentData>();
    for (const a of demoAgents) {
      agentMap.set(a.id, a as AgentData);
    }
    setAgents(agentMap);
    setSelectedAgentId(demoAgents[0].id);
    setCrawlData(demoCrawl);
    setReport(demoReport as unknown as Report);
    setLogs([...demoLogs]);
    setDoneCount(demoAgents.length);
    setIssueCount(demoAgents.reduce((sum: number, a: { issuesFound: number }) => sum + a.issuesFound, 0));
    setElapsed(isEbayDemo ? 85 : 51);
    setPhase("done");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  // WebSocket with automatic retry
  useEffect(() => {
    if (isDemo) return;
    let attempt = 0;
    const maxRetries = 4;
    let ws: WebSocket | null = null;
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      attempt++;
      const wsUrl = `${WS_URL}/ws/${testId}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attempt = 0; // reset on successful connect
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        // Silent — retry handles it
      };

      ws.onclose = (e) => {
        if (cancelled) return;
        // Normal close (1000) or report already delivered — do nothing
        if (e.code === 1000) return;
        // Retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          addLog("info", "reconnecting...");
          retryTimeout = setTimeout(connect, delay);
        } else {
          addLog("warning", "could not reach server — refresh to retry");
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      ws?.close();
    };
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
      const count = (msg.agent_count as number) || 12;
      setExpectedAgentCount(count);
      const personas = msg.personas as Array<Record<string, unknown>> | undefined;
      if (personas && personas.length > 0) {
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
      addLog("info", `deploying ${count} agents`);
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
      setLiveScreenshots(prev => {
        const next = new Map(prev);
        const existing = next.get(agentId);
        next.set(agentId, { b64, step: existing?.step || 0 });
        return next;
      });
    } else if (p === "swarming" && (msg.type as string) === "log") {
      const level = (msg.level as string) || "info";
      addLog(level as LogEntry["level"], (msg.message as string) || "");
    } else if (p === "scoring" && status === "complete") {
      // Capture deterministic scores as soon as they arrive (before full report)
      const scores = msg.scores as Record<string, unknown> | undefined;
      if (scores) {
        setReport((prev) => ({
          ...prev,
          score: {
            overall: (scores.overall_score as number) ?? prev?.score?.overall ?? 0,
            letter_grade: (scores.letter_grade as string) ?? prev?.score?.letter_grade,
          },
        }) as Report);
        addLog("info", `score: ${scores.overall_score}/100 (${scores.letter_grade})`);
      }
    } else if (p === "reporting" && status === "started") {
      setPhase("reporting");
      addLog("info", "generating report...");
    } else if (p === "reporting" && status === "complete") {
      const rpt = msg.report as Report;
      setReport(rpt);
      setPhase("done");
      // Backfill issue count and agent count from report if WS missed swarming updates
      const sessions = rpt?.sessions_summary ?? rpt?.narrative?.persona_verdicts ?? [];
      if (doneCount === 0 && Array.isArray(sessions)) setDoneCount(sessions.length);
      if (issueCount === 0) {
        const statsTotal = (rpt?.stats as Record<string, unknown>)?.total;
        const totalFromSessions = Array.isArray(sessions) ? sessions.reduce((sum: number, s: Record<string, unknown>) => sum + (Number(s.issues_found ?? s.issuesFound ?? 0)), 0) : 0;
        if (totalFromSessions > 0) setIssueCount(totalFromSessions);
        else if (typeof statsTotal === "number") setDoneCount(statsTotal);
      }
      addLog("success", "report ready");
    } else if (p === "error") {
      addLog("error", (msg.message as string) || "error");
    }
  }, [addLog, testUrl]);

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null;
  const agentList = Array.from(agents.values());
  const totalAgents = agentList.length || expectedAgentCount || 12;

  const sortedAgents = [...agentList].sort((a, b) => {
    const order = { running: 0, blocked: 1, stuck: 2, complete: 3, waiting: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });
  const runningAgents = sortedAgents.filter((agent) => agent.status === "running");
  const completedAgents = sortedAgents.filter((agent) => agent.status === "complete");
  const focusedAgentId = selectedAgentId ?? runningAgents[0]?.id ?? sortedAgents[0]?.id ?? null;
  const focusedAgent = focusedAgentId ? agents.get(focusedAgentId) ?? null : null;

  const showToast = useCallback((msg: string, variant: "success" | "error" | "info" = "success") => {
    setToastMessage(msg);
    setToastVariant(variant);
    setToastVisible(true);
  }, []);

  const handleCopy = () => {
    const shareUrl = `${window.location.origin}/test/${testId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    showToast("Report link copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(report?.fix_prompt || "");
    setCopiedPrompt(true);
    showToast("Fix prompt copied to clipboard");
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const grade = gradeFromScore(Number(report?.score?.overall ?? report?.composite_scores?.overall_score ?? 0));

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Prismatic burst — immersive shader base */}
      <motion.div
        className="fixed inset-0 z-0"
        animate={{ opacity: phase === "reporting" ? 0.5 : phase === "swarming" ? 0.4 : 0.3 }}
        transition={{ duration: 2.5 }}
      >
        <PrismaticBurst
          animationType="rotate3d"
          intensity={phase === "reporting" ? 1.5 : phase === "swarming" ? 1.2 : 1.0}
          speed={phase === "swarming" ? 0.5 : 0.3}
          distort={0}
          paused={false}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.3}
          rayCount={0}
          mixBlendMode="screen"
          colors={["#e8a44a", "#c4621a", "#f0b45a"]}
        />
      </motion.div>
      {/* Particle flow field — interactive layer */}
      <motion.div
        className="fixed inset-0 z-[1]"
        animate={{ opacity: phase === "reporting" ? 0.9 : phase === "swarming" ? 0.7 : 0.6 }}
        transition={{ duration: 2 }}
      >
        <NeuralBackground
          color="#e8a44a"
          trailOpacity={0.015}
          particleCount={300}
          speed={0.6}
          intensity={
            phase === "connecting" ? 0.3 :
              phase === "crawling" ? 0.45 :
                phase === "swarming" ? 0.6 :
                  phase === "reporting" ? 0.7 :
                    0.35
          }
          orbit={phase === "reporting"}
          formWord={formWord}
          holdWord={phase !== "done"}
        />
      </motion.div>
      <motion.div
        className="fixed inset-0 z-[2] pointer-events-none"
        animate={{
          background: phase === "reporting"
            ? "radial-gradient(ellipse at 50% 45%, transparent 0%, rgba(8,9,13,0.05) 40%, rgba(8,9,13,0.35) 100%)"
            : phase === "swarming"
              ? "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(8,9,13,0.1) 45%, rgba(8,9,13,0.55) 100%)"
              : "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(8,9,13,0.15) 45%, rgba(8,9,13,0.6) 100%)",
        }}
        transition={{ duration: 2 }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-50 px-4 sm:px-8 py-3.5 flex items-center justify-between relative"
        style={{
          backgroundColor: "rgba(8,9,13,0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(28,28,32, 0.5)",
        }}
      >
        <a
          href="/"
          className="flex items-center gap-2 text-[13px] font-bold tracking-tight transition-colors duration-200"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", textDecoration: "none" }}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 8px rgba(232,164,74,0.4)" }} />
          trashmy.tech
        </a>

        <div className="flex items-center gap-3">
          {/* Running issue counter with animated counting */}
          {issueCount > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 14, stiffness: 200 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}
            >
              <AlertTriangle size={10} style={{ color: "var(--status-fail)" }} />
              <AnimatedCounter
                value={issueCount}
                duration={400}
                className="text-[11px] font-semibold"
                style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
              />
              <span className="text-[9px]" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)", opacity: 0.7 }}>issues</span>
            </motion.div>
          )}

          {/* Phase badge with smooth transitions */}
          <AnimatePresence mode="wait">
            {phase !== "done" ? (
              <motion.div
                key={phase}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: "rgba(232,164,74, 0.08)", border: "1px solid rgba(232,164,74, 0.15)" }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px rgba(232,164,74,0.5)" }} />
                <span className="text-[11px] font-medium" style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                  {phase === "connecting" ? "Initializing" : phase === "crawling" ? "Scanning" : phase === "swarming" ? "Swarming" : "Generating Report"}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 14 }}
                className="flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.15)" }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                >
                  <Check size={11} style={{ color: "var(--status-pass)" }} />
                </motion.div>
                <span className="text-[11px] font-medium" style={{ fontFamily: "var(--font-mono)", color: "var(--status-pass)" }}>Complete</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timer */}
          <span className="text-[11px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </span>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 relative z-10" style={{ backgroundColor: "rgba(8,9,13,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        {/* URL banner with favicon */}
        <div className="max-w-[1180px] mx-auto mb-6">
          <div
            className="glass-card flex items-center gap-3 px-4 py-2.5 text-[12px]"
            style={{ borderRadius: "10px", fontFamily: "var(--font-mono)" }}
          >
            <span className="font-semibold uppercase text-[10px] tracking-[1px]" style={{ color: "var(--accent)" }}>target</span>
            <div className="w-px h-3" style={{ backgroundColor: "var(--border-default)" }} />
            {testUrl && (
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(testUrl)}&sz=16`}
                alt=""
                width={14}
                height={14}
                className="shrink-0 rounded-sm"
                style={{ opacity: 0.7 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <a href={testUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate flex-1 transition-colors" style={{ color: "var(--text-secondary)" }}>
              {testUrl}
            </a>
            <ExternalLink size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </div>
        </div>

        {/* ═══ LIVE DASHBOARD (crawling/swarming/reporting) ═══ */}
        {phase !== "done" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`${phase === "swarming" ? "max-w-[1180px]" : "max-w-[760px]"} mx-auto`}
          >
            {/* Connecting phase - initialization sequence */}
            {phase === "connecting" && !crawlData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <motion.div
                  className="relative w-20 h-20 mb-6"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ border: "1px solid rgba(232,164,74,0.2)" }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full"
                    style={{ border: "1px solid rgba(232,164,74,0.15)" }}
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                      animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    />
                  </div>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-[14px] font-medium mb-2"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                >
                  Initializing analysis
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-[11px]"
                  style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
                >
                  Connecting to {testUrl ? new URL(testUrl.startsWith("http") ? testUrl : `https://${testUrl}`).hostname : "target"} ...
                </motion.p>
              </motion.div>
            )}

            {/* Crawl intel */}
            {crawlData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <div className="flex items-baseline justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {crawlData.page_title && (
                      <h2 className="text-[16px] font-semibold truncate" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        {crawlData.page_title.replace(/[\u{1F300}-\u{1FAD6}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "").trim()}
                      </h2>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 shrink-0 ml-4">
                    <span className="text-[20px] font-bold tabular-nums leading-none" style={{ fontFamily: "var(--font-mono)", color: (crawlData.load_time_ms || 0) > 3000 ? "var(--status-warn)" : "var(--text-primary)" }}>
                      {((crawlData.load_time_ms || 0) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { val: crawlData.links_count || 0, label: "links" },
                    { val: crawlData.forms_count || 0, label: "forms" },
                    { val: crawlData.buttons_count || 0, label: "buttons" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{s.val}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{s.label}</span>
                    </div>
                  ))}
                  {(crawlData.accessibility_violations_count || 0) > 0 && (
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                      style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}
                    >
                      <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}>{crawlData.accessibility_violations_count}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>violations</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Progress bar with enhanced phase descriptions */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: "var(--accent)" }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.2,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    {phase === "connecting"
                      ? "Initializing analysis engine"
                      : phase === "crawling"
                        ? "Mapping site structure & elements"
                        : phase === "reporting"
                          ? "AI is writing your report"
                          : runningAgents.length > 0
                            ? `${runningAgents.length} persona${runningAgents.length !== 1 ? "s" : ""} actively testing`
                            : "Waiting for agents to launch"}
                  </span>
                </div>
                <span className="text-[11px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  <AnimatedCounter value={doneCount} duration={300} />/{totalAgents}
                </span>
              </div>
              <div className="h-[3px] rounded-full overflow-hidden relative" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <motion.div
                  className="h-full rounded-full relative"
                  style={{ backgroundColor: "var(--accent)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / totalAgents) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
                {/* Shimmer on active progress */}
                {doneCount < totalAgents && (
                  <motion.div
                    className="absolute top-0 h-full w-16 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(232,164,74,0.3), transparent)",
                      right: 0,
                    }}
                    animate={{ x: [-64, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  />
                )}
              </div>
            </div>

            {/* Live Browser Viewer - crawling */}
            {phase === "crawling" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <LiveBrowserViewer
                  screenshot={crawlScreenshot ?? undefined}
                  agentName="Crawler"
                  step={crawlStep || undefined}
                  url={testUrl}
                  showEmbed={!crawlScreenshot}
                />
              </motion.div>
            )}

            {phase === "swarming" && (
              <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                <div className="min-w-0">
                  {focusedAgent && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)" }} />
                          <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
                            Watching <strong style={{ color: "var(--text-primary)" }}>{focusedAgent.name}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          step {liveScreenshots.get(focusedAgent.id)?.step || 0}
                        </span>
                      </div>
                      <LiveBrowserViewer
                        screenshot={liveScreenshots.get(focusedAgent.id)?.b64}
                        fallbackScreenshot={crawlScreenshot ?? undefined}
                        agentName={focusedAgent.name}
                        step={liveScreenshots.get(focusedAgent.id)?.step}
                        url={testUrl}
                        annotated={annotatedScreenshots.has(focusedAgent.id)}
                      />
                    </motion.div>
                  )}

                  {!crawlData && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[10px]"
                      style={{
                        backgroundColor: "rgba(232,164,74,0.05)",
                        border: "1px solid rgba(232,164,74,0.12)",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Sparkles size={11} style={{ color: "var(--accent)" }} />
                      Crawl is still mapping the site while the swarm is already running.
                    </div>
                  )}

                  <AnimatePresence>
                    {selectedAgent && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-6 overflow-hidden"
                      >
                        <div className="overflow-hidden rounded-xl" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid rgba(232,164,74,0.12)" }}>
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
                            <div className="p-3 max-h-[240px] overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)" }}>
                              <div className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Trace</div>
                              {selectedAgent.steps.length === 0 && selectedAgent.status === "running" && (
                                <div className="mb-2 text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                                  Live frames are streaming now. Full step trace lands as soon as this agent finishes.
                                </div>
                              )}
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
                                    {[0, 1, 2].map((i) => (
                                      <div key={i} className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: `${i * 200}ms` }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="p-3">
                              <div className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Findings</div>
                              {selectedAgent.findings.length > 0 ? (
                                <div className="space-y-2">
                                  {selectedAgent.findings.slice(0, 6).map((f, i) => (
                                    <div key={i} className="rounded-lg p-2.5" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <SeverityBadge severity={f.type} />
                                        <span className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>{f.category}</span>
                                      </div>
                                      <div className="text-[11px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{f.title}</div>
                                      <div className="text-[10px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{f.detail}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                                  {selectedAgent.status === "running" ? "No issues streamed yet." : "No issues recorded for this agent."}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {sortedAgents.length > 0 && (
                  <div className="lg:sticky lg:top-[88px]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                        Swarm
                      </span>
                      <span className="text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        <AnimatedCounter value={runningAgents.length} duration={200} /> active / <AnimatedCounter value={completedAgents.length} duration={200} /> done
                      </span>
                    </div>

                    <div
                      className="rounded-xl p-2"
                      style={{ backgroundColor: "rgba(12,13,18,0.78)", border: "1px solid rgba(232,164,74,0.1)" }}
                    >
                      <div className="max-h-[68vh] overflow-y-auto space-y-2 pr-1">
                        <AnimatePresence mode="popLayout">
                          {sortedAgents.map((agent, idx) => {
                            const hasCriticalFinding = agent.findings.some((f) => f.type === "critical" || f.category === "security");
                            const liveStep = liveScreenshots.get(agent.id)?.step || 0;
                            const isFocused = focusedAgentId === agent.id;

                            return (
                              <motion.button
                                key={agent.id}
                                type="button"
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{
                                  opacity: 1,
                                  y: 0,
                                  boxShadow: hasCriticalFinding && agent.status === "complete"
                                    ? [
                                        "0 0 0 0 rgba(239,68,68,0), inset 0 0 0 0 rgba(239,68,68,0)",
                                        "0 0 20px 3px rgba(239,68,68,0.25), inset 0 0 8px 0 rgba(239,68,68,0.06)",
                                        "0 0 0 0 rgba(239,68,68,0), inset 0 0 0 0 rgba(239,68,68,0)",
                                      ]
                                    : "none",
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                  delay: idx * 0.02,
                                  duration: 0.3,
                                  boxShadow: hasCriticalFinding ? { repeat: 3, duration: 1.8, ease: "easeInOut" } : undefined,
                                }}
                                onClick={() => setSelectedAgentId(agent.id)}
                                className="group relative w-full overflow-hidden rounded-lg px-3 py-3 text-left transition-all duration-200"
                                style={{
                                  backgroundColor: isFocused ? "rgba(232,164,74,0.06)" : "var(--bg-surface)",
                                  border: `1px solid ${agent.status === "blocked" ? "rgba(248,113,113,0.25)" :
                                      isFocused ? "rgba(232,164,74,0.2)" :
                                        "var(--border-default)"
                                    }`,
                                }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div
                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                                    style={{
                                      backgroundColor: `${catColor(agent.category)}12`,
                                      color: catColor(agent.category),
                                      fontFamily: "var(--font-display)",
                                      border: `1px solid ${catColor(agent.category)}25`,
                                    }}
                                  >
                                    {initials(agent.name)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                      <div className="truncate text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                                        {agent.name}
                                      </div>
                                      <div className="relative shrink-0">
                                        {agent.status === "complete" && agent.outcome === "completed" ? (
                                          <Check size={11} style={{ color: "var(--status-pass)" }} />
                                        ) : agent.status === "blocked" ? (
                                          <X size={11} style={{ color: "var(--status-fail)" }} />
                                        ) : (
                                          <>
                                            <div className="h-1.5 w-1.5 rounded-full" style={{
                                              backgroundColor:
                                                agent.status === "running" ? "var(--status-pass)" :
                                                  agent.status === "complete" ? "var(--cat-accessibility)" :
                                                    agent.status === "stuck" ? "var(--status-warn)" : "var(--border-default)",
                                            }} />
                                            {agent.status === "running" && (
                                              <div className="absolute inset-0 h-1.5 w-1.5 rounded-full animate-ping" style={{ backgroundColor: "var(--status-pass)", opacity: 0.4 }} />
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    <div className="mb-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-display)", color: catColor(agent.category) }}>
                                      <span>{agent.category}</span>
                                      {agent.age ? <span>{agent.age}</span> : null}
                                    </div>

                                    <div className="line-clamp-2 text-[10px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                                      {agent.description}
                                    </div>

                                    <div className="mt-2 text-[10px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                                      {agent.status === "running" ? (
                                        liveStep > 0 ? `step ${liveStep} · live` : "launching..."
                                      ) : agent.status === "complete" ? (
                                        <span style={{ color: agent.outcome === "blocked" ? "var(--status-fail)" : agent.outcome === "struggled" ? "var(--status-warn)" : "var(--cat-accessibility)" }}>
                                          {((agent.timeMs || 0) / 1000).toFixed(1)}s · {agent.issuesFound || 0} issues
                                        </span>
                                      ) : agent.status === "blocked" ? (
                                        <span style={{ color: "var(--status-fail)" }}>blocked</span>
                                      ) : (
                                        "queued"
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="absolute bottom-0 left-0 right-0 h-px" style={{
                                  backgroundColor: agent.status === "running" ? "var(--status-pass)" :
                                    agent.status === "complete" ? "var(--cat-accessibility)" :
                                      agent.status === "blocked" ? "var(--status-fail)" : "transparent",
                                  opacity: 0.4,
                                }} />
                              </motion.button>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Event log with auto-scroll */}
            <div
              ref={logRef}
              className="p-3 max-h-36 overflow-y-auto rounded-lg mb-4"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              role="log"
              aria-label="Analysis event log"
            >
              {logs.slice(0, 50).map((log, i) => (
                <motion.div
                  key={`${log.time}-${i}`}
                  initial={i === 0 ? { opacity: 0, x: -4 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-2 mb-0.5 leading-relaxed text-[10px]"
                >
                  <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}>{log.time}</span>
                  <span className="flex items-center gap-1.5">
                    {log.level === "success" && <Check size={8} style={{ color: "var(--status-pass)", flexShrink: 0 }} />}
                    {log.level === "error" && <X size={8} style={{ color: "var(--status-fail)", flexShrink: 0 }} />}
                    {log.level === "warning" && <AlertTriangle size={8} style={{ color: "var(--status-warn)", flexShrink: 0 }} />}
                    <span style={{
                      fontFamily: log.level === "error" || log.level === "warning" ? "var(--font-display)" : "var(--font-body)",
                      fontWeight: log.level === "error" ? 600 : 400,
                      color: log.level === "error" ? "var(--status-fail)" :
                        log.level === "warning" ? "var(--status-warn)" :
                          log.level === "success" ? "var(--status-pass)" : "var(--text-muted)"
                    }}>
                      {log.message}
                    </span>
                  </span>
                </motion.div>
              ))}
              <span className="cursor-blink" />
            </div>

            {/* Reporting phase - cinematic */}
            {phase === "reporting" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24"
              >
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

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <span className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                    Generating report
                  </span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-[11px] mt-2" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                  {doneCount || (report?.sessions_summary as unknown[])?.length || 12} personas / <span style={{ color: "var(--status-fail)" }}>{issueCount || "—"} issues</span> / {elapsed}s
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══ REPORT ═══ */}
        {phase === "done" && report && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[960px] mx-auto mt-4 pb-16"
          >
            {/* Cached Report Banner */}
            {(report.cached || report.cached_at || report.created_at) && (
              <CachedReportBanner
                cachedAt={report.cached_at || report.created_at}
                testUrl={testUrl}
                className="mb-6"
              />
            )}

            {/* The One Thing — single most important takeaway */}
            {report.the_one_thing && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                className="mb-10 p-5 rounded-xl"
                style={{
                  backgroundColor: "rgba(232,164,74,0.04)",
                  border: "1px solid rgba(232,164,74,0.2)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={14} style={{ color: "var(--accent)" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                    The One Thing
                  </span>
                </div>
                <p className="text-[18px] sm:text-[22px] font-bold leading-[1.4]" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                  {report.the_one_thing}
                </p>
              </motion.div>
            )}

            {/* Score Hero - with animated gauge */}
            <div className="mb-12">
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-8 items-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 12, delay: 0.15 }}
                  className="flex flex-col items-center sm:items-start"
                >
                  <div className="score-glow">
                    <ScoreGauge score={Number(report.score?.overall ?? report.composite_scores?.overall_score ?? 0)} size={160} delay={0.3} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] mt-3" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    <span>{report.stats?.total || 0} personas</span>
                    <span style={{ color: "var(--border-default)" }}>/</span>
                    <span style={{ color: issueCount > 5 ? "var(--status-fail)" : "var(--text-muted)" }}>
                      <AnimatedCounter value={issueCount} duration={800} style={{ fontFamily: "var(--font-mono)" }} /> issues
                    </span>
                    <span style={{ color: "var(--border-default)" }}>/</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{elapsed}s</span>
                  </div>
                </motion.div>
                {report.score?.reasoning && (
                  <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                    <p className="text-[14px] leading-[1.7]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                      {report.score.reasoning}
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-3 mt-6 pt-6 flex-wrap" style={{ borderTop: "1px solid var(--border-default)" }}>
                {report.fix_prompt && (
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundColor: copiedPrompt ? "rgba(74,222,128,0.1)" : "rgba(232,164,74,0.08)",
                      color: copiedPrompt ? "var(--status-pass)" : "var(--accent)",
                      border: `1px solid ${copiedPrompt ? "rgba(74,222,128,0.2)" : "rgba(232,164,74,0.15)"}`,
                    }}
                  >
                    <Sparkles size={11} />
                    {copiedPrompt ? "Copied to clipboard" : "Copy fix prompt for LLM"}
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                >
                  <Share2 size={11} />
                  {copied ? "Copied!" : "Share report"}
                </button>
                <a
                  href={`/compare?url1=${encodeURIComponent(testUrl)}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors no-underline cursor-pointer"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                >
                  <BarChart3 size={11} />
                  Compare with...
                </a>
                <a
                  href="/"
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors no-underline ml-auto"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                >
                  Test another site
                </a>
              </div>
            </div>

            {/* Audit Mode Badge */}
            {report.audit_mode && (
              <div className="mb-8 flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.12em] px-2 py-1 rounded" style={{
                  fontFamily: "var(--font-display)",
                  backgroundColor: "rgba(232,164,74,0.06)",
                  color: "var(--accent)",
                  border: "1px solid rgba(232,164,74,0.15)",
                }}>
                  {report.audit_mode} audit
                </span>
              </div>
            )}

            {/* Consolidated Executive Narrative */}
            {report.consolidated?.executive_narrative && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-14 p-6 rounded-xl"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <FileText size={13} style={{ color: "var(--accent)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                    Executive Summary
                  </span>
                </div>
                <div className="space-y-4">
                  <p className="text-[14px] leading-[1.8]" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {report.consolidated.executive_narrative}
                  </p>
                  {report.consolidated.grade_justification && (
                    <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(232,164,74,0.04)", border: "1px solid rgba(232,164,74,0.12)" }}>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] block mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                        Grade Justification
                      </span>
                      <p className="text-[13px] leading-[1.6]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                        {report.consolidated.grade_justification}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {report.consolidated.risk_assessment && (
                      <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] block mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>
                          Risk if Unfixed
                        </span>
                        <p className="text-[12px] leading-[1.6]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                          {report.consolidated.risk_assessment}
                        </p>
                      </div>
                    )}
                    {report.consolidated.competitive_position && (
                      <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)" }}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] block mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--status-pass)" }}>
                          Competitive Position
                        </span>
                        <p className="text-[12px] leading-[1.6]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                          {report.consolidated.competitive_position}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Category Scores - animated bars */}
            {report.category_scores && (
              <TooltipProvider delayDuration={100}>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="mb-16"
                >
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart3 size={13} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Score Breakdown</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    {(["accessibility", "seo", "performance", "content", "security", "ux"] as const).map((cat, idx) => {
                      const cs = report.category_scores?.[cat];
                      if (!cs) return null;
                      const Icon = CAT_ICONS[cat] || Shield;
                      const color = CAT_COLORS[cat] || "var(--text-muted)";
                      const label = CAT_LABELS[cat] || cat;
                      return (
                        <Tooltip key={cat}>
                          <TooltipTrigger asChild>
                            <div className="cursor-default">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2.5">
                                  <Icon size={13} style={{ color }} />
                                  <span className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>{label}</span>
                                </div>
                                <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: scoreColor(cs.score) }}>
                                  {cs.score}
                                </span>
                              </div>
                              <AnimatedBar
                                value={cs.score}
                                color={scoreColor(cs.score)}
                                height={4}
                                showValue={false}
                                delay={0.2 + idx * 0.08}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[340px]">
                            <p className="text-[11px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{label} -- {cs.score}/100</p>
                            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cs.detail || cs.reasoning || cs.one_liner}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </motion.div>
              </TooltipProvider>
            )}

            {/* Funnel Drop-off Visualization */}
            {report.funnel_analysis?.funnel_stages && report.funnel_analysis.funnel_stages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mb-16"
              >
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                    Workflow Funnel
                  </span>
                  {report.workflow?.primary_workflow && (
                    <span className="text-[10px] ml-1" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", opacity: 0.7 }}>
                      -- {report.workflow.primary_workflow}
                    </span>
                  )}
                </div>
                {report.funnel_analysis.biggest_drop_off && (
                  <p className="text-[12px] mb-4 leading-[1.6]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    {report.funnel_analysis.biggest_drop_off}
                  </p>
                )}
                <div className="space-y-2.5">
                  {report.funnel_analysis.funnel_stages.map((stage, idx) => {
                    const completionRate = stage.attempted > 0
                      ? Math.round(((stage.completed / stage.attempted) * 100))
                      : 0;
                    const barColor = completionRate > 80
                      ? "var(--status-pass)"
                      : completionRate >= 40
                        ? "#f59e0b"
                        : "var(--status-fail)";
                    const barBg = completionRate > 80
                      ? "rgba(34,197,94,0.08)"
                      : completionRate >= 40
                        ? "rgba(245,158,11,0.08)"
                        : "rgba(239,68,68,0.08)";
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.05 * idx }}
                        className="rounded-lg p-3"
                        style={{ backgroundColor: barBg, border: `1px solid ${barColor}22` }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tabular-nums w-5 text-center" style={{ fontFamily: "var(--font-mono)", color: barColor }}>
                              {idx + 1}
                            </span>
                            <span className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                              {stage.step}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                              {stage.completed}/{stage.attempted}
                            </span>
                            <span className="text-[12px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: barColor }}>
                              {completionRate}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: 4, backgroundColor: "rgba(255,255,255,0.05)" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${completionRate}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.1 * idx, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: barColor }}
                          />
                        </div>
                        {stage.drop_off_rate > 20 && stage.primary_blockers && stage.primary_blockers.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {stage.primary_blockers.slice(0, 3).map((blocker, bi) => (
                              <span key={bi} className="text-[10px] px-2 py-0.5 rounded-full" style={{
                                fontFamily: "var(--font-body)",
                                color: barColor,
                                backgroundColor: `${barColor}11`,
                                border: `1px solid ${barColor}22`,
                              }}>
                                {blocker}
                              </span>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                {report.funnel_analysis.conversion_estimate && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: "rgba(232,164,74,0.04)", border: "1px solid rgba(232,164,74,0.12)" }}>
                    <Gauge size={12} style={{ color: "var(--accent)" }} />
                    <span className="text-[11px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                      Est. Conversion:
                    </span>
                    <span className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                      {report.funnel_analysis.conversion_estimate}
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Executive Summary */}
            {report.narrative?.executive_summary && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <p className="text-[15px] leading-[1.8] pl-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)", borderLeft: "2px solid var(--accent)" }}>
                  {report.narrative.executive_summary}
                </p>
              </motion.div>
            )}

            {/* Who Can't Use Your Site */}
            {report.stats && (report.stats.blocked > 0 || report.stats.struggled > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <Users size={13} style={{ color: "var(--text-muted)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Who Can&apos;t Use Your Site</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Blocked */}
                  {report.stats.blocked_names && report.stats.blocked_names.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.05 }}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle size={13} style={{ color: "var(--status-fail)" }} />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--status-fail)" }}>Blocked</span>
                        <span className="text-[10px] font-bold ml-auto tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}>{report.stats.blocked}</span>
                      </div>
                      {report.stats.blocked_names.map((name, i) => (
                        <div key={i} className="text-[11px] mb-1" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{name}</div>
                      ))}
                    </motion.div>
                  )}
                  {/* Struggled */}
                  {report.stats.struggled_names && report.stats.struggled_names.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 }}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.15)" }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={13} style={{ color: "var(--status-warn)" }} />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--status-warn)" }}>Struggled</span>
                        <span className="text-[10px] font-bold ml-auto tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-warn)" }}>{report.stats.struggled}</span>
                      </div>
                      {report.stats.struggled_names.map((name, i) => (
                        <div key={i} className="text-[11px] mb-1" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{name}</div>
                      ))}
                    </motion.div>
                  )}
                  {/* Fine */}
                  {report.stats.fine_names && report.stats.fine_names.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 }}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)" }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 size={13} style={{ color: "var(--status-pass)" }} />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--status-pass)" }}>Fine</span>
                        <span className="text-[10px] font-bold ml-auto tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-pass)" }}>{report.stats.fine_names.length}</span>
                      </div>
                      {report.stats.fine_names.map((name, i) => (
                        <div key={i} className="text-[11px] mb-1" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{name}</div>
                      ))}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Top Issues - with severity badges */}
            {report.narrative?.top_issues && report.narrative.top_issues.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Zap size={13} style={{ color: "var(--status-fail)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Top Issues</span>
                </div>
                <div className="space-y-3">
                  {report.narrative.top_issues.map((issue: TopIssue, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      className="flex gap-3 p-4 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid var(--border-default)" }}
                    >
                      <span
                        className="text-[16px] font-bold tabular-nums shrink-0 mt-0.5"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.4 }}
                      >
                        {issue.rank || i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{issue.title}</span>
                          <SeverityBadge severity={issue.severity || "info"} />
                          {issue.implementation_complexity && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>
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
              </motion.div>
            )}

            {/* AI & Search Readiness */}
            {report.ai_seo?.checks && report.ai_seo.checks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Bot size={14} style={{ color: "var(--cat-ai-seo)" }} />
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>AI & Search Readiness</span>
                  </div>
                  {report.ai_seo.ai_readability_score !== undefined && (
                    <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: scoreColor(report.ai_seo.ai_readability_score) }}>
                      {report.ai_seo.ai_readability_score}/100
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.ai_seo.checks.map((check: { name: string; pass: boolean; detail: string }, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}
                    >
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
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Persona Stories - expandable */}
            {report.narrative?.persona_verdicts && report.narrative.persona_verdicts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-5" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Persona Stories</div>
                <div className="space-y-3">
                  {report.narrative.persona_verdicts.map((v: PersonaVerdict, i: number) => {
                    const session = report.sessions_summary?.find(s => s.persona_id === v.persona_id);
                    const screenshots = session?.screenshots?.filter(s => s.screenshot_url || s.screenshot_b64) || [];
                    const agentData = agentList.find(a => a.id === v.persona_id);
                    const color = catColor(v.category || "");
                    const isExpanded = expandedPersona === v.persona_id;

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-xl overflow-hidden"
                        style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}
                      >
                        {/* Clickable header */}
                        <button
                          onClick={() => setExpandedPersona(isExpanded ? null : v.persona_id)}
                          className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left transition-colors"
                          style={{ borderBottom: isExpanded ? "1px solid var(--border-default)" : "none", backgroundColor: isExpanded ? "rgba(255,255,255,0.01)" : "transparent" }}
                        >
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
                            {!isExpanded && v.narrative && (
                              <div className="text-[11px] mt-0.5 truncate" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                                {v.narrative}
                              </div>
                            )}
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
                            <ChevronDown
                              size={12}
                              style={{
                                color: "var(--text-muted)",
                                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                transition: "transform 0.2s ease",
                              }}
                            />
                          </div>
                        </button>

                        {/* Expandable content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-3">
                                {v.key_quote && (
                                  <div className="px-3 py-2.5 mb-3 rounded-lg" style={{ backgroundColor: `${color}04`, borderLeft: `2px solid ${color}` }}>
                                    <p className="text-[12px] leading-relaxed italic" style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
                                      &ldquo;{v.key_quote}&rdquo;
                                    </p>
                                  </div>
                                )}

                                {v.emotional_journey && (
                                  <p className="text-[11px] leading-relaxed mb-3" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{v.emotional_journey}</p>
                                )}
                                {v.narrative && !v.emotional_journey && (
                                  <p className="text-[11px] leading-relaxed mb-3" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{v.narrative}</p>
                                )}

                                {/* User Voice Panel */}
                                {report.user_voices?.[v.persona_id] && (
                                  <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(232,164,74,0.03)", border: "1px solid rgba(232,164,74,0.1)" }}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>In Their Words</span>
                                      {report.user_voices[v.persona_id].one_word_feeling && report.user_voices[v.persona_id].one_word_feeling !== "unknown" && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{
                                          fontFamily: "var(--font-display)",
                                          backgroundColor: (() => {
                                            const f = report.user_voices![v.persona_id].one_word_feeling;
                                            if (["delighted", "satisfied", "impressed", "happy"].includes(f)) return "rgba(74,222,128,0.1)";
                                            if (["frustrated", "angry", "annoyed", "furious"].includes(f)) return "rgba(248,113,113,0.1)";
                                            if (["confused", "lost", "overwhelmed"].includes(f)) return "rgba(251,191,36,0.1)";
                                            return "rgba(148,163,184,0.1)";
                                          })(),
                                          color: (() => {
                                            const f = report.user_voices![v.persona_id].one_word_feeling;
                                            if (["delighted", "satisfied", "impressed", "happy"].includes(f)) return "var(--status-pass)";
                                            if (["frustrated", "angry", "annoyed", "furious"].includes(f)) return "var(--status-fail)";
                                            if (["confused", "lost", "overwhelmed"].includes(f)) return "var(--status-warn)";
                                            return "var(--text-muted)";
                                          })(),
                                        }}>
                                          {report.user_voices[v.persona_id].one_word_feeling}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[12px] leading-[1.7] italic" style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
                                      &ldquo;{report.user_voices[v.persona_id].verbatim_feedback}&rdquo;
                                    </p>
                                  </div>
                                )}

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

                                {v.notable_moments && (
                                  <p className="text-[10px] leading-relaxed mb-2 pl-2.5" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", borderLeft: `2px solid ${color}` }}>
                                    {v.notable_moments}
                                  </p>
                                )}

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

                                {screenshots.length > 0 && (
                                  <div className="flex gap-1.5 mt-2">
                                    {screenshots.slice(0, 3).map((ss, j) => {
                                      const src = ss.screenshot_b64
                                        ? `data:image/jpeg;base64,${ss.screenshot_b64}`
                                        : ss.screenshot_url ? `${API_URL}${ss.screenshot_url}` : "";
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
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Emotional Journey Map */}
            {report.emotional_journeys && Object.keys(report.emotional_journeys).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 size={13} style={{ color: "var(--accent)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Emotional Journey</span>
                </div>
                <div className="space-y-6">
                  {Object.entries(report.emotional_journeys).map(([pid, journey]) => {
                    if (!journey.stages || journey.stages.length === 0) return null;
                    const personaVerdict = report.narrative?.persona_verdicts?.find(pv => pv.persona_id === pid);
                    const personaName = personaVerdict?.name || personaVerdict?.persona_name || pid;
                    const dimensions = [
                      { key: "trust" as const, label: "Trust", color: "#22c55e" },
                      { key: "delight" as const, label: "Delight", color: "#3b82f6" },
                      { key: "confusion" as const, label: "Confusion", color: "#f59e0b" },
                      { key: "frustration" as const, label: "Frustration", color: "#ef4444" },
                      { key: "intent_to_return" as const, label: "Return Intent", color: "#8b5cf6" },
                    ];
                    return (
                      <div key={pid} className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{personaName}</span>
                        </div>
                        {journey.overall_sentiment && (
                          <p className="text-[10px] leading-relaxed mb-3" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{journey.overall_sentiment}</p>
                        )}
                        {/* Stage labels */}
                        <div className="flex gap-1 mb-2">
                          <div className="w-[72px] shrink-0" />
                          {journey.stages.map((stage, si) => (
                            <div key={si} className="flex-1 text-center">
                              <span className="text-[8px] uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{stage.stage}</span>
                            </div>
                          ))}
                        </div>
                        {/* Dimension rows */}
                        {dimensions.map((dim) => (
                          <div key={dim.key} className="flex items-center gap-1 mb-1.5">
                            <span className="text-[9px] w-[72px] shrink-0 text-right pr-2" style={{ fontFamily: "var(--font-display)", color: dim.color }}>{dim.label}</span>
                            {journey.stages.map((stage, si) => {
                              const val = stage[dim.key];
                              return (
                                <div key={si} className="flex-1 flex items-center justify-center">
                                  <div
                                    className="rounded-sm"
                                    style={{
                                      width: `${Math.max(14, val * 10)}%`,
                                      height: "6px",
                                      backgroundColor: dim.color,
                                      opacity: 0.15 + (val / 10) * 0.85,
                                      transition: "all 0.3s ease",
                                    }}
                                    title={`${dim.label}: ${val}/10`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {/* Scale legend */}
                        <div className="flex items-center gap-1 mt-2">
                          <div className="w-[72px] shrink-0" />
                          <div className="flex-1 flex items-center justify-between">
                            <span className="text-[8px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.5 }}>1</span>
                            <span className="text-[8px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.5 }}>10</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* What Works / What Doesn't */}
            {(report.narrative?.what_works?.length || report.narrative?.what_doesnt_work?.length) ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-14"
              >
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
                          <motion.div key={i} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                            <div className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{item.title}</div>
                            <p className="text-[11px] leading-relaxed mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{item.detail}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.narrative?.what_doesnt_work && report.narrative.what_doesnt_work.length > 0 && (() => {
                    // Filter out accessibility items that are already shown in the dedicated audit section
                    const a11yKeywords = ["accessibility", "a11y", "landmark", "aria", "alt text", "contrast", "screen reader", "keyboard focus", "wcag"];
                    const hasA11yAudit = (report.narrative?.accessibility_audit?.total_violations || 0) > 0;
                    const filtered = hasA11yAudit
                      ? report.narrative!.what_doesnt_work!.filter(item => !a11yKeywords.some(kw => item.title.toLowerCase().includes(kw)))
                      : report.narrative!.what_doesnt_work!;
                    if (filtered.length === 0) return null;
                    return (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <XCircle size={13} style={{ color: "var(--status-fail)" }} />
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Doesn&apos;t Work</span>
                      </div>
                      <div className="space-y-3">
                        {filtered.slice(0, 4).map((item, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                            <div className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{item.title}</div>
                            <p className="text-[11px] leading-relaxed mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{item.detail}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              </motion.div>
            ) : null}

            {/* Accessibility Audit */}
            {report.narrative?.accessibility_audit && (report.narrative.accessibility_audit.total_violations || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-14">
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
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: s.color }}>{s.val}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>{s.label}</span>
                    </div>
                  ))}
                  {(report.narrative.accessibility_audit.images_missing_alt || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-warn)" }}>{report.narrative.accessibility_audit.images_missing_alt}</span>
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
              </motion.div>
            )}

            {/* Chaos/Security Test Summary */}
            {report.narrative?.chaos_test_summary && (report.narrative.chaos_test_summary.inputs_tested || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <Shield size={14} style={{ color: "var(--cat-security)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Security / Chaos Testing</span>
                </div>
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                    <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{report.narrative.chaos_test_summary.inputs_tested}</span>
                    <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>inputs tested</span>
                  </div>
                  {(report.narrative.chaos_test_summary.inputs_accepted_incorrectly || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}>{report.narrative.chaos_test_summary.inputs_accepted_incorrectly}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>accepted bad input</span>
                    </div>
                  )}
                  {(report.narrative.chaos_test_summary.server_errors || 0) > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                      <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}>{report.narrative.chaos_test_summary.server_errors}</span>
                      <span className="text-[10px]" style={{ fontFamily: "var(--font-body)", color: "var(--status-fail)", opacity: 0.7 }}>server errors</span>
                    </div>
                  )}
                </div>
                {report.narrative.chaos_test_summary.worst_finding && (
                  <p className="text-[12px] leading-relaxed pl-4" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", borderLeft: "2px solid var(--cat-security)" }}>
                    {report.narrative.chaos_test_summary.worst_finding}
                  </p>
                )}
              </motion.div>
            )}

            {/* Deterministic Quick Wins from scoring engine */}
            {report.quick_wins && report.quick_wins.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-14">
                <div className="h-px mb-10" style={{ backgroundColor: "var(--border-default)" }} />
                <div className="flex items-center gap-2 mb-5">
                  <Zap size={13} style={{ color: "var(--accent)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Quick Wins</span>
                </div>
                <div className="space-y-3">
                  {report.quick_wins.map((qw, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.04 }}
                      className="flex gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}
                    >
                      <span
                        className="text-[14px] font-bold tabular-nums shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{
                          fontFamily: "var(--font-mono)", color: "var(--accent)",
                          backgroundColor: "rgba(232,164,74,0.08)", border: "1px solid rgba(232,164,74,0.15)", fontSize: "11px",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                            {qw.action}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                            fontFamily: "var(--font-display)",
                            backgroundColor: qw.difficulty === "easy" ? "rgba(74,222,128,0.08)" : qw.difficulty === "medium" ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)",
                            color: qw.difficulty === "easy" ? "var(--status-pass)" : qw.difficulty === "medium" ? "var(--status-warn)" : "var(--status-fail)",
                          }}>
                            {qw.difficulty}
                          </span>
                        </div>
                        <div className="text-[11px] mt-1 leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                          {qw.details}
                        </div>
                        <div className="text-[10px] mt-1" style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                          +{qw.estimated_points_category} {qw.category} / +{qw.estimated_points_overall} overall
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Annotated Screenshot */}
            {(report.annotated_screenshot_url || report.annotated_screenshot_b64) && (
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-14">
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] mb-4" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>Annotated Screenshot</div>
                <img
                  src={report.annotated_screenshot_b64 ? `data:image/png;base64,${report.annotated_screenshot_b64}` : report.annotated_screenshot_url ? `${API_URL}${report.annotated_screenshot_url}` : ""}
                  alt="Annotated screenshot"
                  className="w-full rounded-lg cursor-pointer transition-opacity hover:opacity-90"
                  style={{ border: "1px solid var(--border-default)" }}
                  onClick={() => setLightboxImg(report.annotated_screenshot_b64 ? `data:image/png;base64,${report.annotated_screenshot_b64}` : report.annotated_screenshot_url ? `${API_URL}${report.annotated_screenshot_url}` : null)}
                />
              </motion.div>
            )}

            {/* Bottom Action Bar */}
            <div className="h-px mb-8" style={{ backgroundColor: "var(--border-default)" }} />
            <div className="flex items-center gap-3 flex-wrap">
              {report.fix_prompt && (
                <button
                  onClick={handleCopyPrompt}
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
                <Share2 size={11} />
                {copied ? "Copied!" : "Share report"}
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
            <div className="absolute top-6 right-6 text-[11px] px-3 py-1.5 rounded-full" style={{ fontFamily: "var(--font-mono)", backgroundColor: "rgba(30,34,50,0.4)", color: "var(--text-secondary)" }}>
              Click anywhere to close
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <ToastNotification
        message={toastMessage}
        visible={toastVisible}
        onClose={() => setToastVisible(false)}
        variant={toastVariant}
      />
    </div>
  );
}
