"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Trophy } from "lucide-react";
import { AnimatedBar } from "@/components/ui/animated-bar";
import { ScoreGauge } from "@/components/ui/score-gauge";

interface CategoryScore {
  score: number;
  reasoning?: string;
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
  ai_readability: "AI readability",
};

const CAT_COLORS: Record<string, string> = {
  accessibility: "var(--cat-accessibility)",
  security: "var(--cat-security)",
  usability: "var(--cat-usability)",
  mobile: "var(--cat-mobile)",
  performance: "var(--cat-performance)",
  ai_readability: "var(--cat-ai-seo)",
};

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

const CATEGORIES = [
  "accessibility",
  "security",
  "usability",
  "mobile",
  "performance",
  "ai_readability",
];

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

  const [url1, setUrl1] = useState(
    initialUrl1
      ? (() => {
          try {
            return new URL(initialUrl1).hostname;
          } catch {
            return initialUrl1;
          }
        })()
      : ""
  );
  const [url2, setUrl2] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report1, setReport1] = useState<ReportData | null>(null);
  const [report2, setReport2] = useState<ReportData | null>(null);

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url1.trim() || !url2.trim()) return;

    setIsLoading(true);

    window.setTimeout(() => {
      const demoKeys = Object.keys(DEMO_REPORTS);
      setReport1({ ...DEMO_REPORTS[demoKeys[0]], url: url1.trim() });
      setReport2({ ...DEMO_REPORTS[demoKeys[1]], url: url2.trim() });
      setIsLoading(false);
    }, 900);
  };

  const score1 = report1?.score?.overall ?? 0;
  const score2 = report2?.score?.overall ?? 0;
  const winner = score1 > score2 ? 1 : score2 > score1 ? 2 : 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
      <header
        className="border-b"
        style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(13,15,18,0.96)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight no-underline"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            trashmy.tech
          </Link>
          <span
            className="text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            compare
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <section className="mb-8 max-w-3xl space-y-4">
          <div
            className="text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            side by side score review
          </div>
          <h1
            className="text-[36px] font-semibold tracking-tight sm:text-[52px]"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            Compare two sites with the same test harness.
          </h1>
          <p className="text-[15px] leading-7" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            This view uses demo report data, but the comparison layout is meant to read like a worksheet:
            winner, per-category scores, then operational stats.
          </p>
        </section>

        <section className="focus-shell p-4 sm:p-5">
          <form onSubmit={handleCompare} className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto]">
              <input
                type="text"
                value={url1}
                onChange={(e) => setUrl1(e.target.value)}
                placeholder="site-one.com"
                className="h-12 border px-4 text-[14px] outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
                aria-label="First website URL"
              />
              <div
                className="flex items-center justify-center text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                vs
              </div>
              <input
                type="text"
                value={url2}
                onChange={(e) => setUrl2(e.target.value)}
                placeholder="site-two.com"
                className="h-12 border px-4 text-[14px] outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
                aria-label="Second website URL"
              />
              <button
                type="submit"
                disabled={isLoading || !url1.trim() || !url2.trim()}
                className="depth-button depth-button-accent flex h-12 items-center justify-center gap-2 px-5 text-[12px] font-semibold uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>comparing</span>
                  </>
                ) : (
                  <>
                    <span>compare</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {report1 && report2 ? (
          <section className="mt-8 space-y-6">
            {winner !== 0 ? (
              <div className="focus-shell p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="depth-pill px-2 py-1" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                    <Trophy size={12} />
                    winner
                  </div>
                  <div
                    className="text-[16px] font-semibold"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                  >
                    {winner === 1 ? report1.url : report2.url}
                  </div>
                  <div className="text-[13px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    ahead by {Math.abs(score1 - score2)} points.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {[report1, report2].map((report, index) => {
                const isWinner = winner === index + 1;
                const score = report.score?.overall ?? 0;
                return (
                  <div
                    key={report.url}
                    className="focus-shell p-4 sm:p-5"
                    style={isWinner ? { borderColor: "var(--accent-border)" } : undefined}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="text-[11px] uppercase tracking-[0.14em]"
                          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                        >
                          site {index + 1}
                        </div>
                        <div
                          className="mt-2 text-[20px] font-semibold"
                          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                        >
                          {report.url}
                        </div>
                        <p className="mt-2 text-[13px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                          {report.score?.reasoning}
                        </p>
                      </div>
                      {isWinner ? (
                        <div className="depth-pill px-2 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                          top score
                        </div>
                      ) : null}
                    </div>
                    <div className="flex justify-center py-2">
                      <ScoreGauge score={score} size={144} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="focus-shell overflow-hidden">
              <div
                className="border-b px-4 py-3 text-[11px] uppercase tracking-[0.14em] sm:px-5"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                category breakdown
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border-default)" }}>
                {CATEGORIES.map((category) => {
                  const leftScore = report1.category_scores?.[category]?.score ?? 0;
                  const rightScore = report2.category_scores?.[category]?.score ?? 0;
                  const categoryWinner = leftScore > rightScore ? 1 : rightScore > leftScore ? 2 : 0;
                  const color = CAT_COLORS[category];

                  return (
                    <div
                      key={category}
                      className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(160px,180px)_1fr_1fr] sm:px-5"
                    >
                      <div>
                        <div
                          className="text-[13px] font-semibold"
                          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                        >
                          {CAT_LABELS[category]}
                        </div>
                        {categoryWinner !== 0 ? (
                          <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            winner: {categoryWinner === 1 ? report1.url : report2.url}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-[12px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          <span>{report1.url}</span>
                          <span style={{ color: categoryWinner === 1 ? color : "var(--text-muted)" }}>{leftScore}</span>
                        </div>
                        <AnimatedBar value={leftScore} color={categoryWinner === 1 ? color : "rgba(138,149,163,0.6)"} height={10} showValue={false} />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-[12px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          <span>{report2.url}</span>
                          <span style={{ color: categoryWinner === 2 ? color : "var(--text-muted)" }}>{rightScore}</span>
                        </div>
                        <AnimatedBar value={rightScore} color={categoryWinner === 2 ? color : "rgba(138,149,163,0.6)"} height={10} showValue={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {[report1, report2].map((report) => (
                <div key={report.url} className="focus-shell p-4 sm:p-5">
                  <div
                    className="text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    run stats
                  </div>
                  <div
                    className="mt-2 text-[20px] font-semibold"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                  >
                    {report.url}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <StatCell label="personas" value={report.stats?.total || 0} />
                    <StatCell label="blocked" value={report.stats?.blocked || 0} danger />
                    <StatCell label="struggled" value={report.stats?.struggled || 0} warn />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-start">
              <Link
                href="/"
                className="depth-button flex items-center gap-2 px-4 py-2 text-[12px] uppercase tracking-[0.14em] no-underline"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
              >
                <ArrowLeft size={14} />
                analyze another site
              </Link>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function StatCell({
  label,
  value,
  danger = false,
  warn = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
  warn?: boolean;
}) {
  let color = "var(--text-primary)";
  if (danger) color = "var(--status-fail)";
  if (warn) color = "var(--status-warn)";

  return (
    <div
      className="border px-3 py-3"
      style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
    >
      <div className="text-[22px] font-semibold" style={{ color, fontFamily: "var(--font-mono)" }}>
        {value}
      </div>
      <div
        className="mt-1 text-[10px] uppercase tracking-[0.14em]"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </div>
    </div>
  );
}
