"use client";

import { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Trophy, BarChart3, ArrowLeft } from "lucide-react";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { AnimatedBar } from "@/components/ui/animated-bar";
import dynamic from "next/dynamic";

const NeuralBackground = dynamic(
  () => import("@/components/ui/flow-field-background"),
  { ssr: false }
);

// Types from the report
interface CategoryScore {
  score: number;
  reasoning?: string;
  one_liner?: string;
  detail?: string;
}

interface ReportData {
  url: string;
  score?: { overall: number; reasoning?: string };
  category_scores?: Record<string, CategoryScore>;
  stats?: {
    total: number;
    completed: number;
    blocked: number;
    struggled: number;
  };
}

const CAT_LABELS: Record<string, string> = {
  accessibility: "Accessibility",
  security: "Security",
  usability: "Usability",
  mobile: "Mobile",
  performance: "Performance",
  ai_readability: "AI Readability",
};

const CAT_COLORS: Record<string, string> = {
  accessibility: "#60a5fa",
  security: "#a78bfa",
  usability: "#4ade80",
  mobile: "#f472b6",
  performance: "#fbbf24",
  ai_readability: "#2dd4bf",
};

function scoreColor(score: number): string {
  if (score >= 60) return "#4ade80";
  if (score >= 30) return "#fbbf24";
  return "#f87171";
}

function gradeFromScore(score: number): { letter: string; color: string } {
  if (score >= 85) return { letter: "A", color: "#22c55e" };
  if (score >= 70) return { letter: "B", color: "#84cc16" };
  if (score >= 55) return { letter: "C", color: "#f59e0b" };
  if (score >= 35) return { letter: "D", color: "#f97316" };
  return { letter: "F", color: "#ef4444" };
}

// Demo comparison data
const DEMO_REPORTS: Record<string, ReportData> = {
  "acme-store.vercel.app": {
    url: "acme-store.vercel.app",
    score: { overall: 34, reasoning: "Severe accessibility barriers, XSS vulnerability, broken mobile layout." },
    category_scores: {
      accessibility: { score: 18, reasoning: "Keyboard trap, missing skip nav" },
      security: { score: 25, reasoning: "Reflected XSS in search" },
      usability: { score: 48, reasoning: "Core flows work but edge cases fail" },
      mobile: { score: 30, reasoning: "Filter bar overflows on small screens" },
      performance: { score: 42, reasoning: "3.2s LCP from hero image" },
      ai_readability: { score: 55, reasoning: "Basic semantic structure present" },
    },
    stats: { total: 10, completed: 7, blocked: 1, struggled: 3 },
  },
  "competitor.example.com": {
    url: "competitor.example.com",
    score: { overall: 71, reasoning: "Solid accessibility and mobile experience. Some performance issues." },
    category_scores: {
      accessibility: { score: 78, reasoning: "Good keyboard nav, minor ARIA gaps" },
      security: { score: 82, reasoning: "CSP headers in place, input validated" },
      usability: { score: 65, reasoning: "Good core flow, checkout could be simpler" },
      mobile: { score: 70, reasoning: "Responsive but slow on 3G" },
      performance: { score: 55, reasoning: "Large JS bundle, slow FCP" },
      ai_readability: { score: 75, reasoning: "Structured data, good meta tags" },
    },
    stats: { total: 10, completed: 9, blocked: 0, struggled: 1 },
  },
};

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "var(--bg-base)" }} />}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const initialUrl1 = searchParams.get("url1") || "";

  const [url1, setUrl1] = useState(initialUrl1 ? (() => { try { return new URL(initialUrl1).hostname; } catch { return initialUrl1; } })() : "");
  const [url2, setUrl2] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report1, setReport1] = useState<ReportData | null>(null);
  const [report2, setReport2] = useState<ReportData | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url1.trim() || !url2.trim()) return;

    setIsLoading(true);

    // Use demo data for demonstration
    setTimeout(() => {
      const demoKeys = Object.keys(DEMO_REPORTS);
      setReport1({
        ...DEMO_REPORTS[demoKeys[0]],
        url: url1.trim(),
      });
      setReport2({
        ...DEMO_REPORTS[demoKeys[1]],
        url: url2.trim(),
      });
      setShowResults(true);
      setIsLoading(false);
    }, 1500);
  };

  const categories = ["accessibility", "security", "usability", "mobile", "performance", "ai_readability"];

  const score1 = report1?.score?.overall ?? 0;
  const score2 = report2?.score?.overall ?? 0;
  const winner = score1 > score2 ? 1 : score2 > score1 ? 2 : 0;

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Background */}
      <motion.div className="fixed inset-0 z-0" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ duration: 1.5 }}>
        <NeuralBackground color="#e8a44a" trailOpacity={0.03} particleCount={500} speed={0.7} intensity={0.5} />
      </motion.div>
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,12,0.2) 45%, rgba(10,10,12,0.75) 100%)" }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 sm:px-8 py-4 flex items-center justify-between"
        style={{
          backgroundColor: "rgba(10,10,12,0.88)",
          backdropFilter: "blur(20px)",
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
        <div className="flex items-center gap-2">
          <BarChart3 size={13} style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
            Compare
          </span>
        </div>
      </header>

      <main className="relative z-10 px-4 sm:px-6 py-8">
        <div className="max-w-[900px] mx-auto">
          {/* Input form */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <h1
              className="text-[28px] sm:text-[36px] font-bold text-center mb-2 tracking-tight"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Compare Two Sites
            </h1>
            <p
              className="text-[13px] text-center mb-8"
              style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
            >
              See how two sites stack up across accessibility, security, performance, and more.
            </p>

            <form onSubmit={handleCompare}>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center mb-4">
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                >
                  <input
                    type="text"
                    value={url1}
                    onChange={(e) => setUrl1(e.target.value)}
                    placeholder="site-one.com"
                    className="w-full h-[48px] px-4 bg-transparent text-[13px] outline-none placeholder:opacity-25"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
                    aria-label="First website URL"
                  />
                </div>

                <div
                  className="text-[11px] font-bold uppercase tracking-[0.15em] text-center py-2 sm:py-0"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                >
                  vs
                </div>

                <div
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                >
                  <input
                    type="text"
                    value={url2}
                    onChange={(e) => setUrl2(e.target.value)}
                    placeholder="site-two.com"
                    className="w-full h-[48px] px-4 bg-transparent text-[13px] outline-none placeholder:opacity-25"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
                    aria-label="Second website URL"
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={isLoading || !url1.trim() || !url2.trim()}
                  className="h-[42px] px-8 text-[12px] font-semibold uppercase tracking-[0.1em] rounded-lg transition-all duration-200 flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                  style={{ fontFamily: "var(--font-display)", backgroundColor: "var(--accent)", color: "#0a0a0c" }}
                >
                  {isLoading ? (
                    <><Loader2 size={14} className="animate-spin" /><span>Comparing</span></>
                  ) : (
                    <><span>Compare</span><ArrowRight size={14} /></>
                  )}
                </button>
              </div>
            </form>
          </motion.div>

          {/* Results */}
          <AnimatePresence>
            {showResults && report1 && report2 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Winner declaration */}
                {winner !== 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-center mb-10 p-6 rounded-xl"
                    style={{
                      backgroundColor: "rgba(232,164,74,0.04)",
                      border: "1px solid rgba(232,164,74,0.15)",
                    }}
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Trophy size={18} style={{ color: "var(--accent)" }} />
                      <span className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                        Winner
                      </span>
                    </div>
                    <div className="text-[18px] font-bold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                      {winner === 1 ? report1.url : report2.url}
                    </div>
                    <div className="text-[13px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      by <span style={{ color: "var(--accent)", fontWeight: 700 }}>{Math.abs(score1 - score2)}</span> points
                    </div>
                  </motion.div>
                )}

                {/* Dual score gauges */}
                <div className="grid grid-cols-2 gap-8 mb-12">
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center p-6 rounded-xl"
                    style={{
                      backgroundColor: winner === 1 ? "rgba(232,164,74,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${winner === 1 ? "rgba(232,164,74,0.2)" : "var(--border-default)"}`,
                    }}
                  >
                    {winner === 1 && (
                      <Trophy size={14} style={{ color: "var(--accent)", marginBottom: 8 }} />
                    )}
                    <div className="text-[12px] font-medium mb-4 truncate max-w-full" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {report1.url}
                    </div>
                    <ScoreGauge score={score1} size={140} delay={0.4} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-center p-6 rounded-xl"
                    style={{
                      backgroundColor: winner === 2 ? "rgba(232,164,74,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${winner === 2 ? "rgba(232,164,74,0.2)" : "var(--border-default)"}`,
                    }}
                  >
                    {winner === 2 && (
                      <Trophy size={14} style={{ color: "var(--accent)", marginBottom: 8 }} />
                    )}
                    <div className="text-[12px] font-medium mb-4 truncate max-w-full" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {report2.url}
                    </div>
                    <ScoreGauge score={score2} size={140} delay={0.5} />
                  </motion.div>
                </div>

                {/* Category comparison */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mb-12"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 size={13} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                      Category Breakdown
                    </span>
                  </div>

                  <div className="space-y-5">
                    {categories.map((cat, idx) => {
                      const s1 = report1.category_scores?.[cat]?.score ?? 0;
                      const s2 = report2.category_scores?.[cat]?.score ?? 0;
                      const catWinner = s1 > s2 ? 1 : s2 > s1 ? 2 : 0;
                      const color = CAT_COLORS[cat] || "#888";

                      return (
                        <motion.div
                          key={cat}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.6 + idx * 0.06 }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[12px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
                              {CAT_LABELS[cat] || cat}
                            </span>
                            {catWinner !== 0 && (
                              <Trophy size={10} style={{ color: "var(--accent)", opacity: 0.5 }} />
                            )}
                          </div>

                          {/* Versus bars */}
                          <div className="grid grid-cols-[1fr_40px_1fr] gap-2 items-center">
                            {/* Left bar (site 1) - grows from right to left */}
                            <div className="flex items-center gap-2 justify-end">
                              <span
                                className="text-[11px] font-bold tabular-nums shrink-0"
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: catWinner === 1 ? color : "var(--text-muted)",
                                }}
                              >
                                {s1}
                              </span>
                              <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                                <motion.div
                                  className="h-full rounded-full ml-auto"
                                  style={{
                                    backgroundColor: catWinner === 1 ? color : `${color}60`,
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${s1}%` }}
                                  transition={{ duration: 0.8, delay: 0.7 + idx * 0.08 }}
                                />
                              </div>
                            </div>

                            {/* Center label */}
                            <div
                              className="text-[9px] font-bold text-center"
                              style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                            >
                              vs
                            </div>

                            {/* Right bar (site 2) */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor: catWinner === 2 ? color : `${color}60`,
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${s2}%` }}
                                  transition={{ duration: 0.8, delay: 0.7 + idx * 0.08 }}
                                />
                              </div>
                              <span
                                className="text-[11px] font-bold tabular-nums shrink-0"
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: catWinner === 2 ? color : "var(--text-muted)",
                                }}
                              >
                                {s2}
                              </span>
                            </div>
                          </div>

                          {/* Diff indicator */}
                          {catWinner !== 0 && (
                            <div className="text-[9px] mt-1 text-center" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                              {catWinner === 1 ? report1.url : report2.url} wins by {Math.abs(s1 - s2)} pts
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Summary stats */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                  className="grid grid-cols-2 gap-4 mb-8"
                >
                  {[report1, report2].map((r, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: "rgba(255,255,255,0.015)", border: "1px solid var(--border-default)" }}
                    >
                      <div className="text-[11px] font-medium mb-3 truncate" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {r.url}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-[18px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                            {r.stats?.total || 0}
                          </div>
                          <div className="text-[9px] uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                            Personas
                          </div>
                        </div>
                        <div>
                          <div className="text-[18px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}>
                            {r.stats?.blocked || 0}
                          </div>
                          <div className="text-[9px] uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                            Blocked
                          </div>
                        </div>
                        <div>
                          <div className="text-[18px] font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--status-warn)" }}>
                            {r.stats?.struggled || 0}
                          </div>
                          <div className="text-[9px] uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                            Struggled
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>

                {/* Back to home */}
                <div className="flex justify-center">
                  <a
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-medium transition-colors no-underline"
                    style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                  >
                    <ArrowLeft size={11} />
                    Analyze a site
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
