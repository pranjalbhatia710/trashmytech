"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useSearchParams } from "next/navigation";
import { API_URL, WS_URL } from "@/lib/config";

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
  would_recommend: boolean;
  narrative: string;
  outcome: string;
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
    recommendations?: string[];
  };
  sessions_summary?: Array<{
    persona_id: string;
    persona_name: string;
    screenshots: Array<{ step: number; description: string; screenshot_url?: string; screenshot_b64?: string | null }>;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function catColor(cat: string) {
  switch (cat) {
    case "accessibility": return "#3b82f6";
    case "chaos": return "#6b7280";
    case "demographic": return "#14b8a6";
    case "behavioral": return "#8b5cf6";
    default: return "#4a506a";
  }
}

function initials(name: string) {
  return name.replace(/[^A-Za-z ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function scoreColor(score: number) {
  if (score >= 60) return "#22c55e";
  if (score >= 30) return "#eab308";
  return "#ef4444";
}

function severityColor(s: string) {
  switch (s) {
    case "critical": return "#ef4444";
    case "major": return "#eab308";
    case "minor": return "#7a8099";
    default: return "#3b82f6";
  }
}

// ── Component ──────────────────────────────────────────────────
export default function TestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const testUrl = searchParams.get("url") || "";

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

  const logRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

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

  // WebSocket
  useEffect(() => {
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#08090d" }}>
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between sticky top-0 z-50" style={{ borderColor: "#252a3a", backgroundColor: "#08090d" }}>
        <a href="/" className="font-mono text-sm" style={{ color: "#7a8099" }}>trashmy.tech</a>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="truncate max-w-[280px]" style={{ color: "#4a506a" }}>{testUrl}</span>
          <span style={{ color: "#d4d7e0" }}>{formatTime(elapsed)}</span>
        </div>
      </header>

      {/* Phase dots */}
      <div className="flex items-center gap-3 px-6 py-4">
        {(["crawling", "swarming", "reporting", "done"] as Phase[]).map((p, i) => {
          const phaseOrder = ["crawling", "swarming", "reporting", "done"];
          const currentIdx = phaseOrder.indexOf(phase);
          const isActive = phase === p;
          const isPast = currentIdx > i;
          return (
            <div key={p} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full transition-colors" style={{
                backgroundColor: isActive ? "#22c55e" : isPast ? "#22c55e" : "#252a3a",
                animation: isActive ? "pulse 2s infinite" : undefined,
              }} />
              <span className="font-mono text-[11px] uppercase tracking-wider" style={{
                color: isActive ? "#22c55e" : "#4a506a",
              }}>
                {p === "done" ? "report" : p}
              </span>
              {i < 3 && <div className="w-8 h-px" style={{ backgroundColor: "#252a3a" }} />}
            </div>
          );
        })}
      </div>

      <main className="px-6 pb-16">
        {/* CRAWLING */}
        {phase === "crawling" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-20">
            <div className="w-12 h-12 border-2 rounded-full animate-spin mb-4" style={{ borderColor: "#252a3a", borderTopColor: "#22c55e" }} />
            <p className="font-mono text-xs uppercase tracking-[2px]" style={{ color: "#7a8099" }}>scanning</p>
            <p className="font-mono text-sm mt-2" style={{ color: "#d4d7e0" }}>{testUrl}</p>
          </motion.div>
        )}

        {/* SWARMING — Two column layout */}
        {(phase === "swarming" || phase === "reporting") && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Crawl stats */}
            {crawlData && (
              <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs">
                {[
                  { label: "load", value: `${crawlData.load_time_ms || 0}ms` },
                  { label: "links", value: crawlData.links_count || 0 },
                  { label: "forms", value: crawlData.forms_count || 0 },
                  { label: "missing alt", value: crawlData.images_missing_alt || 0 },
                  { label: "violations", value: crawlData.accessibility_violations_count || 0 },
                ].map((s) => (
                  <div key={s.label}>
                    <span style={{ color: "#d4d7e0" }}>{s.value}</span>
                    <span className="ml-1" style={{ color: "#4a506a" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-px" style={{ borderColor: "#252a3a" }}>
              {/* Left: Browser view */}
              <div className="flex-[55] min-w-0">
                {/* Agent tabs */}
                <div className="flex overflow-x-auto gap-1 pb-2 mb-3">
                  {agentList.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 transition-colors"
                      style={{
                        borderBottom: selectedAgentId === agent.id ? "2px solid #d4d7e0" : "2px solid transparent",
                        color: selectedAgentId === agent.id ? "#d4d7e0" : "#4a506a",
                      }}
                    >
                      <div className="w-5 h-5 rounded-full flex items-center justify-center font-mono" style={{
                        fontSize: "8px",
                        backgroundColor: "#0f1117",
                        border: `1.5px solid ${catColor(agent.category)}`,
                        color: "#7a8099",
                      }}>
                        {initials(agent.name)}
                      </div>
                      <span className="font-mono text-[11px]">{agent.name}</span>
                      <div className="w-1.5 h-1.5 rounded-full" style={{
                        backgroundColor: agent.status === "running" ? "#22c55e" :
                          agent.status === "complete" ? "#22c55e" :
                          agent.status === "blocked" ? "#ef4444" :
                          agent.status === "stuck" ? "#eab308" : "#4a506a",
                        animation: agent.status === "running" ? "pulse 1.5s infinite" : undefined,
                      }} />
                    </button>
                  ))}
                </div>

                {/* Selected agent view */}
                {selectedAgent && (
                  <div>
                    {selectedAgent.status === "waiting" && (
                      <div className="py-12 text-center font-mono text-xs" style={{ color: "#4a506a" }}>
                        waiting to deploy
                      </div>
                    )}

                    {(selectedAgent.status === "running" || selectedAgent.status === "complete" || selectedAgent.status === "blocked" || selectedAgent.status === "stuck") && (
                      <div>
                        {/* Step log */}
                        <div className="space-y-1 max-h-64 overflow-y-auto p-3 rounded" style={{ backgroundColor: "#0f1117" }}>
                          {selectedAgent.steps.length === 0 && (
                            <div className="font-mono text-[11px]" style={{ color: "#4a506a" }}>
                              {selectedAgent.status === "running" ? "running..." : "no steps recorded"}
                            </div>
                          )}
                          {selectedAgent.steps.map((step, i) => (
                            <div key={i} className="font-mono text-[11px] flex gap-2">
                              <span style={{ color: "#4a506a" }}>[{step.step}]</span>
                              <span style={{ color: "#7a8099" }}>{step.action}</span>
                              <span style={{ color: "#d4d7e0" }} className="truncate">
                                &apos;{step.target}&apos;
                              </span>
                              <span className="ml-auto shrink-0" style={{
                                color: step.result === "success" ? "#22c55e" : "#ef4444"
                              }}>
                                {step.result === "success" ? "ok" : "fail"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Findings */}
                        {selectedAgent.findings.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {selectedAgent.findings.map((f, i) => (
                              <div key={i} className="p-3 rounded" style={{
                                backgroundColor: "#0f1117",
                                borderLeft: `3px solid ${severityColor(f.type)}`,
                              }}>
                                <div className="font-mono text-[11px]" style={{ color: "#d4d7e0" }}>{f.title}</div>
                                <div className="text-[12px] mt-1" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{f.detail}</div>
                                {f.measured_value && (
                                  <div className="font-mono text-[11px] mt-1">
                                    <span style={{ color: "#d4d7e0" }}>{f.measured_value}</span>
                                    {f.expected_value && <span style={{ color: "#4a506a" }}> (expected: {f.expected_value})</span>}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Overview */}
              <div className="flex-[45] min-w-0 lg:pl-6 mt-6 lg:mt-0">
                {/* Counters */}
                <div className="flex gap-4 mb-4 font-mono text-xs">
                  <span style={{ color: "#4a506a" }}>{totalAgents} agents</span>
                  <span style={{ color: "#d4d7e0" }}>{doneCount}/{totalAgents} complete</span>
                  <span style={{ color: issueCount > 10 ? "#ef4444" : issueCount > 0 ? "#eab308" : "#7a8099" }}>
                    {issueCount} issues
                  </span>
                </div>

                {/* Agent list */}
                <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
                  {sortedAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors"
                      style={{
                        backgroundColor: selectedAgentId === agent.id ? "#181b25" : "transparent",
                      }}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center font-mono shrink-0" style={{
                        fontSize: "8px",
                        backgroundColor: "#0f1117",
                        border: `1.5px solid ${catColor(agent.category)}`,
                        color: "#7a8099",
                      }}>
                        {initials(agent.name)}
                      </div>
                      <span className="font-mono text-[11px] truncate" style={{ color: "#d4d7e0" }}>{agent.name}</span>
                      <span className="ml-auto font-mono text-[11px] shrink-0" style={{
                        color: agent.status === "complete" ? "#22c55e" :
                          agent.status === "blocked" ? "#ef4444" :
                          agent.status === "running" ? "#22c55e" :
                          agent.status === "stuck" ? "#eab308" : "#4a506a",
                      }}>
                        {agent.status === "running" ? `step ${agent.steps.length}` :
                         agent.status === "complete" ? `${((agent.timeMs || 0) / 1000).toFixed(1)}s` :
                         agent.status}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Event log */}
                <div ref={logRef} className="p-3 rounded max-h-48 overflow-y-auto font-mono text-[11px]" style={{ backgroundColor: "#0f1117" }}>
                  {logs.slice(0, 50).map((log, i) => (
                    <div key={i} className="flex gap-2 mb-0.5">
                      <span style={{ color: "#4a506a" }}>{log.time}</span>
                      <span style={{
                        color: log.level === "error" ? "#ef4444" :
                          log.level === "warning" ? "#eab308" :
                          log.level === "success" ? "#22c55e" : "#7a8099"
                      }}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <span className="cursor-blink" />
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: "#181b25" }}>
              <div className="h-full transition-all duration-500" style={{
                width: `${(doneCount / totalAgents) * 100}%`,
                backgroundColor: doneCount / totalAgents > 0.7 ? "#22c55e" : doneCount / totalAgents > 0.3 ? "#eab308" : "#ef4444",
              }} />
            </div>

            {/* Reporting spinner */}
            {phase === "reporting" && (
              <div className="flex flex-col items-center py-12">
                <div className="w-8 h-8 border-2 rounded-full animate-spin mb-3" style={{ borderColor: "#252a3a", borderTopColor: "#22c55e" }} />
                <span className="font-mono text-xs" style={{ color: "#4a506a" }}>generating report...</span>
              </div>
            )}
          </motion.div>
        )}

        {/* REPORT */}
        {phase === "done" && report && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-[720px] mx-auto mt-8"
          >
            {/* Score */}
            <div className="mb-12">
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12 }}>
                <span className="font-mono text-[56px] font-bold" style={{ color: scoreColor(report.score?.overall ?? 0) }}>
                  {animatedScore}
                </span>
                <span className="font-mono text-[24px] ml-1" style={{ color: "#4a506a" }}>/100</span>
              </motion.div>
              {report.score?.confidence != null && (
                <div className="font-mono text-[11px] mt-1" style={{ color: "#4a506a" }}>
                  {report.score.confidence > 0.7 ? "high" : report.score.confidence > 0.4 ? "moderate" : "low"} confidence
                </div>
              )}
              <div className="font-mono text-xs mt-1" style={{ color: "#7a8099" }}>
                {report.stats?.total || 0} personas tested &nbsp;--&nbsp; {issueCount} issues found &nbsp;--&nbsp; {elapsed}s
              </div>
              {report.score?.reasoning && (
                <p className="text-[15px] leading-[1.7] mt-4" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>
                  {report.score.reasoning}
                </p>
              )}
            </div>

            {/* Category Scores */}
            {report.category_scores && (
              <div className="flex flex-wrap gap-6 mb-12">
                {(["accessibility", "security", "usability", "mobile", "performance"] as const).map((cat) => {
                  const cs = report.category_scores?.[cat];
                  if (!cs) return null;
                  const catColors: Record<string, string> = {
                    accessibility: "#3b82f6", security: "#6b7280",
                    usability: "#8b5cf6", mobile: "#14b8a6", performance: "#eab308",
                  };
                  return (
                    <div key={cat} className="min-w-[120px]">
                      <div className="font-mono text-[11px] uppercase tracking-[1px]" style={{ color: catColors[cat] }}>{cat}</div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="font-mono text-[24px] font-bold" style={{ color: scoreColor(cs.score) }}>{cs.score}</span>
                        <span className="font-mono text-xs" style={{ color: "#4a506a" }}>/100</span>
                      </div>
                      <p className="text-[12px] mt-1 line-clamp-2" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{cs.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Executive Summary */}
            {report.narrative?.executive_summary && (
              <div className="mb-12">
                <div className="h-px mb-6" style={{ backgroundColor: "#252a3a" }} />
                <div className="font-mono text-[11px] uppercase tracking-[2px] mb-3" style={{ color: "#4a506a" }}>summary</div>
                <p className="text-[16px] leading-[1.7]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>
                  {report.narrative.executive_summary}
                </p>
              </div>
            )}

            {/* What Works / What Doesn't */}
            {(report.narrative?.what_works?.length || report.narrative?.what_doesnt_work?.length) ? (
              <div className="grid sm:grid-cols-2 gap-8 mb-12">
                {report.narrative?.what_works && report.narrative.what_works.length > 0 && (
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[1px] mb-4" style={{ color: "#22c55e" }}>what works</div>
                    <div className="space-y-4">
                      {report.narrative.what_works.map((w, i) => (
                        <div key={i}>
                          <div className="text-[14px] font-medium" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>{w.title}</div>
                          <div className="text-[13px] mt-0.5" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{w.detail}</div>
                          {w.personas_who_benefited && (
                            <div className="font-mono text-[11px] mt-1" style={{ color: "#4a506a" }}>
                              benefited: {w.personas_who_benefited.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {report.narrative?.what_doesnt_work && report.narrative.what_doesnt_work.length > 0 && (
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[1px] mb-4" style={{ color: "#ef4444" }}>what doesn&apos;t</div>
                    <div className="space-y-4">
                      {report.narrative.what_doesnt_work.map((w, i) => (
                        <div key={i}>
                          <div className="text-[14px] font-medium" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>{w.title}</div>
                          <div className="text-[13px] mt-0.5" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{w.detail}</div>
                          {w.personas_who_suffered && (
                            <div className="font-mono text-[11px] mt-1" style={{ color: "#4a506a" }}>
                              affected: {w.personas_who_suffered.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Persona Verdicts */}
            {report.narrative?.persona_verdicts && report.narrative.persona_verdicts.length > 0 && (
              <div className="mb-12">
                <div className="font-mono text-[11px] uppercase tracking-[2px] mb-4" style={{ color: "#4a506a" }}>persona results</div>
                <div className="space-y-1">
                  {report.narrative.persona_verdicts.map((pv) => {
                    const isExpanded = expandedPersona === pv.persona_id;
                    const sessionScreenshots = report.sessions_summary?.find(s => s.persona_id === pv.persona_id)?.screenshots || [];
                    return (
                      <div key={pv.persona_id}>
                        <button
                          onClick={() => setExpandedPersona(isExpanded ? null : pv.persona_id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors text-left"
                          style={{ backgroundColor: isExpanded ? "#181b25" : "transparent" }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono shrink-0" style={{
                            fontSize: "9px", backgroundColor: "#0f1117",
                            border: `2px solid ${catColor(agents.get(pv.persona_id)?.category || "unknown")}`,
                            color: "#7a8099",
                          }}>
                            {initials(pv.persona_name)}
                          </div>
                          <span className="text-[14px]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>
                            {pv.persona_name}
                          </span>
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{
                            backgroundColor: pv.outcome === "completed" ? "rgba(34,197,94,0.1)" : pv.outcome === "blocked" ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)",
                            color: pv.outcome === "completed" ? "#22c55e" : pv.outcome === "blocked" ? "#ef4444" : "#eab308",
                          }}>
                            {pv.outcome}
                          </span>
                          <span className="ml-auto font-mono text-xs" style={{
                            color: pv.would_recommend ? "#22c55e" : "#ef4444",
                          }}>
                            {pv.would_recommend ? "yes" : "no"}
                          </span>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-4 pt-1 ml-10">
                                <p className="text-[14px] leading-[1.7]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>
                                  {pv.narrative}
                                </p>
                                {pv.primary_barrier && (
                                  <p className="text-[14px] mt-2" style={{ color: "#ef4444", fontFamily: "var(--font-dm-sans)" }}>
                                    {pv.primary_barrier}
                                  </p>
                                )}

                                {/* Screenshot gallery */}
                                {sessionScreenshots.length > 0 && (
                                  <div className="flex gap-2 overflow-x-auto mt-3 pb-2">
                                    {sessionScreenshots.map((ss, i) => {
                                      const imgSrc = ss.screenshot_url
                                        ? `${API_URL}${ss.screenshot_url}`
                                        : ss.screenshot_b64
                                          ? `data:image/jpeg;base64,${ss.screenshot_b64}`
                                          : null;
                                      if (!imgSrc) return null;
                                      return (
                                        <button key={i} onClick={() => setLightboxImg(imgSrc)}
                                          className="shrink-0 rounded overflow-hidden"
                                          style={{ border: "1px solid #252a3a", borderRadius: "4px" }}>
                                          <img src={imgSrc} alt={`Step ${ss.step}`}
                                            className="w-[180px] h-auto" />
                                          <div className="font-mono text-[10px] px-1 py-0.5" style={{ color: "#4a506a" }}>
                                            step {ss.step}
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

            {/* Top Issues */}
            {report.narrative?.top_issues && report.narrative.top_issues.length > 0 && (
              <div className="mb-12">
                <div className="font-mono text-[11px] uppercase tracking-[2px] mb-4" style={{ color: "#4a506a" }}>top issues</div>
                <div className="space-y-3">
                  {report.narrative.top_issues.map((issue, i) => (
                    <div key={i} className="p-5 rounded" style={{
                      backgroundColor: "#0f1117",
                      border: "1px solid #252a3a",
                      borderLeft: `3px solid ${severityColor(issue.severity)}`,
                      borderRadius: "4px",
                    }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded" style={{
                          backgroundColor: `${severityColor(issue.severity)}15`,
                          color: severityColor(issue.severity),
                        }}>
                          {issue.severity}
                        </span>
                        {issue.category && (
                          <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded" style={{
                            backgroundColor: `${catColor(issue.category)}15`,
                            color: catColor(issue.category),
                          }}>
                            {issue.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[16px] mb-2" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>{issue.title}</div>
                      <p className="text-[14px] leading-[1.6] mb-3" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{issue.description}</p>
                      {issue.fix && (
                        <div className="p-3 rounded" style={{ backgroundColor: "#181b25", borderRadius: "4px" }}>
                          <span className="font-mono text-[11px] uppercase" style={{ color: "#4a506a" }}>fix: </span>
                          <span className="text-[14px]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>{issue.fix}</span>
                        </div>
                      )}
                      {issue.affected_personas && issue.affected_personas.length > 0 && (
                        <div className="flex items-center gap-1 mt-3">
                          {issue.affected_personas.map((name) => (
                            <div key={name} className="w-6 h-6 rounded-full flex items-center justify-center font-mono" style={{
                              fontSize: "7px", backgroundColor: "#181b25", color: "#7a8099",
                            }}>
                              {initials(name)}
                            </div>
                          ))}
                        </div>
                      )}
                      {issue.impact_estimate && (
                        <div className="text-[13px] mt-2" style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}>{issue.impact_estimate}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accessibility Audit */}
            {report.narrative?.accessibility_audit && (
              <div className="mb-12">
                <div className="font-mono text-[11px] uppercase tracking-[1px] mb-4" style={{ color: "#3b82f6" }}>accessibility</div>
                <div className="p-4 rounded" style={{ backgroundColor: "#0f1117", border: "1px solid #252a3a", borderRadius: "4px" }}>
                  {report.narrative.accessibility_audit.total_violations != null && (
                    <div className="mb-3">
                      <span className="font-mono text-[24px]" style={{ color: "#d4d7e0" }}>
                        {report.narrative.accessibility_audit.total_violations}
                      </span>
                      <span className="font-mono text-xs ml-1" style={{ color: "#4a506a" }}>violations</span>
                    </div>
                  )}
                  <div className="space-y-1 font-mono text-[13px]">
                    {report.narrative.accessibility_audit.critical != null && (
                      <div className="flex justify-between">
                        <span style={{ color: "#ef4444" }}>critical</span>
                        <span style={{ color: "#d4d7e0" }}>{report.narrative.accessibility_audit.critical}</span>
                      </div>
                    )}
                    {report.narrative.accessibility_audit.serious != null && (
                      <div className="flex justify-between">
                        <span style={{ color: "#eab308" }}>serious</span>
                        <span style={{ color: "#d4d7e0" }}>{report.narrative.accessibility_audit.serious}</span>
                      </div>
                    )}
                    {report.narrative.accessibility_audit.moderate != null && (
                      <div className="flex justify-between">
                        <span style={{ color: "#7a8099" }}>moderate</span>
                        <span style={{ color: "#d4d7e0" }}>{report.narrative.accessibility_audit.moderate}</span>
                      </div>
                    )}
                    {report.narrative.accessibility_audit.minor_count != null && (
                      <div className="flex justify-between">
                        <span style={{ color: "#4a506a" }}>minor</span>
                        <span style={{ color: "#d4d7e0" }}>{report.narrative.accessibility_audit.minor_count}</span>
                      </div>
                    )}
                  </div>
                  {report.narrative.accessibility_audit.details && report.narrative.accessibility_audit.details.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {report.narrative.accessibility_audit.details.map((d, i) => (
                        <div key={i} className="font-mono text-xs" style={{ color: "#7a8099" }}>{d}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chaos Test Summary */}
            {report.narrative?.chaos_test_summary && (
              <div className="mb-12">
                <div className="font-mono text-[11px] uppercase tracking-[1px] mb-4" style={{ color: "#6b7280" }}>security</div>
                <div className="p-4 rounded font-mono text-[13px]" style={{ backgroundColor: "#0f1117", border: "1px solid #252a3a", borderRadius: "4px" }}>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {report.narrative.chaos_test_summary.inputs_tested != null && (
                      <span><span style={{ color: "#d4d7e0" }}>{report.narrative.chaos_test_summary.inputs_tested}</span> <span style={{ color: "#4a506a" }}>tested</span></span>
                    )}
                    {report.narrative.chaos_test_summary.inputs_rejected != null && (
                      <span><span style={{ color: "#22c55e" }}>{report.narrative.chaos_test_summary.inputs_rejected}</span> <span style={{ color: "#4a506a" }}>rejected</span></span>
                    )}
                    {report.narrative.chaos_test_summary.inputs_accepted_incorrectly != null && (
                      <span><span style={{ color: report.narrative.chaos_test_summary.inputs_accepted_incorrectly > 0 ? "#ef4444" : "#22c55e" }}>
                        {report.narrative.chaos_test_summary.inputs_accepted_incorrectly}
                      </span> <span style={{ color: "#4a506a" }}>accepted incorrectly</span></span>
                    )}
                    {report.narrative.chaos_test_summary.server_errors != null && (
                      <span><span style={{ color: report.narrative.chaos_test_summary.server_errors > 0 ? "#ef4444" : "#22c55e" }}>
                        {report.narrative.chaos_test_summary.server_errors}
                      </span> <span style={{ color: "#4a506a" }}>server errors</span></span>
                    )}
                  </div>
                  {report.narrative.chaos_test_summary.worst_finding && (
                    <div className="mt-3 text-[14px]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>
                      {report.narrative.chaos_test_summary.worst_finding}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {report.narrative?.recommendations && report.narrative.recommendations.length > 0 && (
              <div className="mb-12">
                <div className="font-mono text-[11px] uppercase tracking-[2px] mb-4" style={{ color: "#4a506a" }}>recommendations</div>
                <div className="space-y-2">
                  {report.narrative.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-3 p-4 rounded" style={{ backgroundColor: "#0f1117", border: "1px solid #252a3a", borderRadius: "4px" }}>
                      <span className="font-mono text-sm font-bold shrink-0" style={{ color: "#22c55e" }}>{i + 1}.</span>
                      <span className="text-[14px]" style={{ color: "#d4d7e0", fontFamily: "var(--font-dm-sans)" }}>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="h-px mb-8" style={{ backgroundColor: "#252a3a" }} />
            <div className="flex gap-6 mb-16 font-mono text-xs">
              <a href="/" className="hover:underline" style={{ color: "#7a8099" }}>test another site</a>
              <button onClick={() => { navigator.clipboard.writeText(window.location.href); }} className="hover:underline" style={{ color: "#7a8099" }}>
                share results
              </button>
              <button onClick={() => window.print()} className="hover:underline" style={{ color: "#7a8099" }}>
                print report
              </button>
            </div>

            {/* Footer */}
            <div className="font-mono text-[11px] pb-12" style={{ color: "#4a506a" }}>
              trashmy.tech &nbsp;--&nbsp; hackillinois 2026
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
            className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: "rgba(8,9,13,0.9)" }}
            onClick={() => setLightboxImg(null)}
          >
            <img src={lightboxImg} alt="Screenshot"
              className="max-w-[80vw] max-h-[80vh] rounded" style={{ border: "1px solid #252a3a" }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
