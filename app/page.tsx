"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Globe, AlertTriangle, Users, Shield } from "lucide-react";
import { TrashAnimation } from "@/components/ui/trash-animation";
import { Typewriter } from "@/components/ui/typewriter-text";
import { UrlInput } from "@/components/url-input";
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

// ── Constants ─────────────────────────────────────────────────
const FREE_ANALYSIS_KEY = "candid_free_used";

// Fallback demo data (only used if API is unreachable)
const FALLBACK_RECENT_SITES: RecentSite[] = [
  { url: "acme-store.vercel.app", domain: "acme-store.vercel.app", latest_overall_score: 34, last_analyzed: new Date(Date.now() - 2 * 60000).toISOString() },
  { url: "myportfolio.dev", domain: "myportfolio.dev", latest_overall_score: 72, last_analyzed: new Date(Date.now() - 5 * 60000).toISOString() },
  { url: "startup-landing.com", domain: "startup-landing.com", latest_overall_score: 58, last_analyzed: new Date(Date.now() - 12 * 60000).toISOString() },
];

// ── Types ─────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────
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
    return dateStr;
  }
}

// ── Animated Counter ──────────────────────────────────────────
function AnimatedCounter({ target, duration = 2 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setCount(current);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

// ── Paywall Gate Stub ─────────────────────────────────────────
// When next-auth + AuthModal are built by another agent, uncomment:
// import { useSession } from "next-auth/react";
// import { AuthModal } from "@/components/auth-modal";

function usePaywallGate() {
  const [freeUsed, setFreeUsed] = useState(false);
  // const { data: session } = useSession(); // uncomment when next-auth is available
  const session = null; // stub

  useEffect(() => {
    try {
      const used = localStorage.getItem(FREE_ANALYSIS_KEY);
      if (used === "true") setFreeUsed(true);
    } catch {
      // localStorage not available
    }
  }, []);

  const markFreeUsed = useCallback(() => {
    try {
      localStorage.setItem(FREE_ANALYSIS_KEY, "true");
      setFreeUsed(true);
    } catch {
      // localStorage not available
    }
  }, []);

  return {
    /** Whether the user needs to authenticate before submitting */
    requiresAuth: freeUsed && !session,
    /** Mark the free analysis as consumed */
    markFreeUsed,
    /** Whether user is authenticated */
    isAuthenticated: !!session,
  };
}

// ══════════════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════════════
export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"fast" | "standard" | "deep">("standard");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
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
  // const [showAuthModal, setShowAuthModal] = useState(false); // uncomment when AuthModal is ready
  const previewAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { markFreeUsed } = usePaywallGate();
  // const { requiresAuth, markFreeUsed } = usePaywallGate(); // use when auth is ready

  // ── Background fade-in ────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setBgReady(true), 600);
    return () => clearTimeout(timer);
  }, []);

  // ── Autofocus input ───────────────────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 1000);
    return () => clearTimeout(timeout);
  }, []);

  // ── Fetch recent sites and stats ──────────────────────────
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

  // ── Debounced preview fetch ───────────────────────────────
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
          `${API_URL}/v1/preview`,
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

  // ── Submit handler ────────────────────────────────────────
  const handleSubmit = useCallback(async (normalizedUrl: string) => {
    setError("");

    // Paywall gate: when auth is ready, uncomment:
    // if (requiresAuth) {
    //   setShowAuthModal(true);
    //   return;
    // }

    setIsLoading(true);
    setPreview(null);
    setPreviewLoading(false);
    previewAbort.current?.abort();

    try {
      const res = await fetch(
        `${API_URL}/v1/tests`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: normalizedUrl, mode }) }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message || "Something went wrong.");
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      markFreeUsed();
      setTrashUrl(normalizedUrl);
      setTrashActive(true);
      router.push(`/test/${data.test_id}?url=${encodeURIComponent(normalizedUrl)}`);
    } catch {
      setError("Can't reach the server. Is the backend running?");
      setIsLoading(false);
    }
  }, [mode, router, markFreeUsed]);

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen relative overflow-hidden">
      <TrashAnimation active={trashActive} url={trashUrl} />

      {/* Auth Modal stub — uncomment when AuthModal component is available:
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} /> */}

      {/* Prismatic burst shader -- ambient base layer */}
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

      {/* Vignette overlay */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(8,9,13,0.2) 35%, rgba(8,9,13,0.8) 100%)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* ──────────────── Header ──────────────── */}
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

        {/* ──────────────── Hero ──────────────── */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8">
          <div className="max-w-[600px] w-full text-center">
            {/* Main heading */}
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
              className="text-[14px] mb-2 leading-relaxed"
              style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
            >
              AI agents stress-test your site from real user perspectives — accessibility, UX, security, and performance.
            </motion.p>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="text-[12px] mb-3 italic"
              style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
            >
              At the rate you&apos;re shipping, who&apos;s actually testing?
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

            {/* ──── URL Input (hero focal point) ──── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mb-2"
            >
              <UrlInput
                ref={inputRef}
                value={url}
                onChange={setUrl}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                disabled={false}
              />
            </motion.div>

            {/* Audit Mode Selector */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.55 }}
              className="flex items-center justify-center gap-1 mb-4"
            >
              {(["fast", "standard", "deep"] as const).map((m) => {
                const labels = {
                  fast: { label: "Fast", detail: "6 agents" },
                  standard: { label: "Standard", detail: "12 agents" },
                  deep: { label: "Deep", detail: "30 agents" },
                };
                const info = labels[m];
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundColor: isActive ? "rgba(232,164,74,0.1)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                      border: isActive ? "1px solid rgba(232,164,74,0.25)" : "1px solid transparent",
                    }}
                  >
                    {info.label}
                    <span className="text-[9px] opacity-60" style={{ fontFamily: "var(--font-mono)" }}>{info.detail}</span>
                  </button>
                );
              })}
            </motion.div>

            {/* Server-side error */}
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

        {/* ──────────────── Recently Analyzed ──────────────── */}
        {recentSites.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="px-6 sm:px-8 pb-8 max-w-[900px] mx-auto w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe size={12} style={{ color: "var(--text-muted)" }} />
                <span
                  className="text-[10px] uppercase tracking-[0.12em] font-medium"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                >
                  Recently Analyzed
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield size={10} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
                <span
                  className="text-[9px] uppercase tracking-[0.1em]"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", opacity: 0.6 }}
                >
                  Powered by 50 AI personas
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                    whileHover={{ y: -1, transition: { duration: 0.2 } }}
                    className="group flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200 no-underline"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(232,164,74,0.2)";
                      e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                      e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-default)";
                      e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {/* Grade badge */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
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
                            {Math.round(score)}/100
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
                    {/* Hover arrow */}
                    <div
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      &rarr;
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ──────────────── Footer ──────────────── */}
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
