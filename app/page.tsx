"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles, Globe, AlertTriangle, Users } from "lucide-react";
import { TrashAnimation } from "@/components/ui/trash-animation";
import { Typewriter } from "@/components/ui/typewriter-text";
import { API_URL } from "@/lib/config";
import dynamic from "next/dynamic";

const NeuralBackground = dynamic(
  () => import("@/components/ui/flow-field-background"),
  { ssr: false }
);
const PrismaticBurst = dynamic(
  () => import("@/components/ui/prismatic-burst"),
  { ssr: false }
);

// Fallback demo data (only used if API is unreachable)
const FALLBACK_RECENT_SITES: RecentSite[] = [
  { url: "acme-store.vercel.app", domain: "acme-store.vercel.app", latest_overall_score: 34, last_analyzed: new Date(Date.now() - 2 * 60000).toISOString() },
  { url: "myportfolio.dev", domain: "myportfolio.dev", latest_overall_score: 72, last_analyzed: new Date(Date.now() - 5 * 60000).toISOString() },
  { url: "startup-landing.com", domain: "startup-landing.com", latest_overall_score: 58, last_analyzed: new Date(Date.now() - 12 * 60000).toISOString() },
];

interface RecentSite {
  url: string;
  domain: string;
  latest_overall_score: number | null;
  last_analyzed: string;
  analysis_count?: number;
  category?: string;
}

interface SiteStats {
  total_sites: number;
  total_analyses: number;
  total_issues: number;
  avg_score: number | null;
}

function getGradeFromScore(score: number): { letter: string; color: string } {
  if (score >= 85) return { letter: "A", color: "#22c55e" };
  if (score >= 70) return { letter: "B", color: "#84cc16" };
  if (score >= 55) return { letter: "C", color: "#f59e0b" };
  if (score >= 35) return { letter: "D", color: "#f97316" };
  return { letter: "F", color: "#ef4444" };
}

function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    // If it's already a human-readable string (like "2 min ago"), return as-is
    return dateStr;
  }
}

function AnimatedCounter({ target, duration = 2 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    let start = 0;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      setCount(start);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [trashUrl, setTrashUrl] = useState("");
  const [bgReady, setBgReady] = useState(false);
  const [recentSites, setRecentSites] = useState<RecentSite[]>([]);
  const [stats, setStats] = useState<SiteStats>({ total_sites: 0, total_analyses: 0, total_issues: 0, avg_score: null });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [preview, setPreview] = useState<{
    site_name?: string;
    description?: string;
    audience?: string;
    observations?: string[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setBgReady(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch recent sites and stats from API
  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch(`${API_URL}/v1/recent?limit=6`);
        if (res.ok) {
          const data = await res.json();
          if (data.sites && data.sites.length > 0) {
            setRecentSites(data.sites);
          } else {
            setRecentSites(FALLBACK_RECENT_SITES);
          }
        } else {
          setRecentSites(FALLBACK_RECENT_SITES);
        }
      } catch {
        setRecentSites(FALLBACK_RECENT_SITES);
      }
    }
    async function fetchStats() {
      try {
        const res = await fetch(`${API_URL}/v1/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
          setStatsLoaded(true);
        }
      } catch {
        // Use fallback zeros
      }
    }
    fetchRecent();
    fetchStats();
  }, []);

  // Debounced preview fetch
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.length < 5) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    let testUrl = trimmed;
    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = "https://" + testUrl;
    }
    try { new URL(testUrl); } catch { return; }

    if (!testUrl.includes(".", testUrl.indexOf("//") + 2)) return;

    const timer = setTimeout(async () => {
      previewAbort.current?.abort();
      const controller = new AbortController();
      previewAbort.current = controller;
      setPreviewLoading(true);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: testUrl }),
            signal: controller.signal,
          }
        );
        if (!res.ok) { setPreviewLoading(false); return; }
        const data = await res.json();
        if (!controller.signal.aborted) {
          setPreview(data);
          setPreviewLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      previewAbort.current?.abort();
    };
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    let testUrl = url.trim();
    if (!testUrl) { inputRef.current?.focus(); return; }
    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = "https://" + testUrl;
      setUrl(testUrl);
    }
    try { new URL(testUrl); } catch { setError("Enter a valid URL"); return; }

    setIsLoading(true);
    setPreview(null);
    setPreviewLoading(false);
    previewAbort.current?.abort();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/tests`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: testUrl }) }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message || "Something went wrong.");
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      setTrashUrl(testUrl);
      setTrashActive(true);
      router.push(`/test/${data.test_id}?url=${encodeURIComponent(testUrl)}`);
    } catch {
      setError("Can't reach the server. Is the backend running?");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <TrashAnimation active={trashActive} url={trashUrl} />

      {/* Prismatic burst shader — ambient base layer */}
      <motion.div
        className="fixed inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgReady ? 0.5 : 0 }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      >
        <PrismaticBurst
          animationType="rotate3d"
          intensity={1.5}
          speed={0.3}
          distort={0}
          paused={false}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.25}
          rayCount={0}
          mixBlendMode="screen"
          colors={["#e8a44a", "#c4621a", "#f0b45a"]}
        />
      </motion.div>

      {/* Flow field particles */}
      <motion.div
        className="fixed inset-0 z-[1]"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgReady ? 1 : 0 }}
        transition={{ duration: 1.8, ease: "easeOut" }}
      >
        <NeuralBackground color="#e8a44a" trailOpacity={0.015} particleCount={300} speed={0.6} />
      </motion.div>

      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(8,9,13,0.2) 35%, rgba(8,9,13,0.8) 100%)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 8px rgba(232,164,74,0.4)" }}
            />
            <span
              className="text-[14px] font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              candid.
            </span>
          </div>
          <a
            href="/test/ebay"
            className="text-[10px] uppercase tracking-[0.12em] font-medium px-3 py-1.5 rounded-md no-underline transition-all duration-200"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(232,164,74,0.3)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            View Demo Report
          </a>
        </motion.header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8">
          <div className="max-w-[600px] w-full text-center">
            {/* Main heading with glow */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-4"
            >
              <h1
                className="text-[40px] sm:text-[52px] font-bold leading-[1.1] tracking-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                find out what&apos;s{" "}
                <span
                  className="text-gradient-amber"
                  style={{
                    textShadow: "0 0 40px rgba(232,164,74,0.3), 0 0 80px rgba(232,164,74,0.1)",
                  }}
                >
                  actually wrong
                </span>
                {" "}with your site
              </h1>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-[14px] mb-3 leading-relaxed"
              style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
            >
              We launch your product. Not co-founders. We take 5% of the value we create.
            </motion.p>

            {/* Typewriter */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mb-10 h-6"
            >
              <Typewriter
                text={[
                  "make something people want.",
                  "make something agents want.",
                  "make something the world wants.",
                ]}
                speed={40}
                deleteSpeed={25}
                delay={2000}
                loop={true}
                className="text-[13px]"
                cursor="_"
              />
            </motion.div>

            {/* URL Input with animated glow */}
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              onSubmit={handleSubmit}
              className="mb-4"
            >
              <motion.div
                className="relative"
                animate={{
                  boxShadow: isFocused
                    ? "0 0 0 1px rgba(232,164,74,0.4), 0 0 24px rgba(232,164,74,0.08), 0 0 48px rgba(232,164,74,0.04)"
                    : "0 0 0 1px var(--border-default), 0 0 0 rgba(232,164,74,0)",
                }}
                transition={{ duration: 0.3 }}
                style={{ borderRadius: "10px" }}
              >
                <div
                  className="flex items-center gap-0"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderRadius: "10px",
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    disabled={isLoading}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="flex-1 h-[56px] px-5 bg-transparent text-[14px] outline-none placeholder:opacity-25"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
                    aria-label="Enter a website URL to analyze"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="h-[44px] px-7 mr-[6px] text-[12px] font-semibold uppercase tracking-[0.1em] rounded-[7px] transition-all duration-200 flex items-center gap-2.5 disabled:opacity-50 shrink-0 cursor-pointer"
                    style={{ fontFamily: "var(--font-display)", backgroundColor: "var(--accent)", color: "#0a0a0c" }}
                    onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; }}
                  >
                    {isLoading ? (
                      <><Loader2 size={14} className="animate-spin" /><span>Testing</span></>
                    ) : (
                      <><span>Audit it</span><ArrowRight size={14} /></>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.form>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center justify-center gap-2 text-[12px] mb-4"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--status-fail)" }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Preview */}
            <AnimatePresence>
              {(previewLoading || preview) && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="mb-6 rounded-lg p-4 text-left"
                  style={{ backgroundColor: "rgba(232,164,74,0.04)", border: "1px solid rgba(232,164,74,0.15)" }}
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <Sparkles size={12} style={{ color: "var(--accent)" }} />
                    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
                      AI Preview
                    </span>
                    {previewLoading && <Loader2 size={10} className="animate-spin" style={{ color: "var(--accent)" }} />}
                  </div>
                  {previewLoading && !preview ? (
                    <div className="space-y-2">
                      <div className="h-3 rounded w-3/4 animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                      <div className="h-3 rounded w-1/2 animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                    </div>
                  ) : preview ? (
                    <div>
                      {preview.site_name && (
                        <div className="text-[13px] font-medium mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{preview.site_name}</div>
                      )}
                      {preview.description && (
                        <div className="text-[12px] mb-2 leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>{preview.description}</div>
                      )}
                      {preview.observations && preview.observations.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {preview.observations.map((obs, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                              <span className="shrink-0 mt-[3px] w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                              <span>{obs}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Recently Analyzed Sites */}
        {recentSites.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="px-6 sm:px-8 pb-8 max-w-[900px] mx-auto w-full"
          >
            <div className="flex items-center gap-2 mb-4">
              <Globe size={12} style={{ color: "var(--text-muted)" }} />
              <span
                className="text-[10px] uppercase tracking-[0.12em] font-medium"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
              >
                Recently Analyzed
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recentSites.map((site, idx) => {
                const score = site.latest_overall_score ?? 0;
                const grade = getGradeFromScore(score);
                return (
                  <motion.a
                    key={site.domain}
                    href={`/site/${encodeURIComponent(site.domain)}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 + idx * 0.06, duration: 0.4 }}
                    className="group flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all duration-200 no-underline"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(232,164,74,0.2)";
                      e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-default)";
                      e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                    }}
                  >
                    {/* Grade badge */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        fontFamily: "var(--font-mono)",
                        backgroundColor: `${grade.color}15`,
                        color: grade.color,
                        border: `1px solid ${grade.color}25`,
                      }}
                    >
                      {grade.letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[11px] font-medium truncate"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
                      >
                        {site.domain}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {site.latest_overall_score != null && (
                          <span
                            className="text-[10px] tabular-nums font-semibold"
                            style={{ fontFamily: "var(--font-mono)", color: grade.color }}
                          >
                            {Math.round(score)}
                          </span>
                        )}
                        <span
                          className="text-[9px]"
                          style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
                        >
                          {formatTimeAgo(site.last_analyzed)}
                        </span>
                      </div>
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Footer stats */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.0 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between flex-wrap gap-3"
          style={{ borderTop: "1px solid rgba(42,42,50,0.3)" }}
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Users size={11} style={{ color: "var(--text-muted)" }} />
              <span
                className="text-[11px]"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontWeight: 600 }}>
                  <AnimatedCounter target={statsLoaded ? stats.total_sites : 0} duration={2.5} />
                </span>
                {" "}sites analyzed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={11} style={{ color: "var(--text-muted)" }} />
              <span
                className="text-[11px]"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontWeight: 600 }}>
                  <AnimatedCounter target={statsLoaded ? stats.total_issues : 0} duration={2.5} />
                </span>
                {" "}issues found
              </span>
            </div>
            {stats.avg_score != null && (
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px]"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                >
                  avg score{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>
                    {Math.round(stats.avg_score)}
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
              Built at HackIllinois 2026
            </span>
            <a
              href="/test/ebay"
              className="text-[11px] no-underline transition-colors"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              view demo &rarr;
            </a>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
