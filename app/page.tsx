"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Zap, Eye, Shield, Smartphone, Gauge, Bot, Sparkles, Copy, Monitor } from "lucide-react";
import { TrashAnimation } from "@/components/ui/trash-animation";
import { Typewriter } from "@/components/ui/typewriter-text";
import dynamic from "next/dynamic";

const NeuralBackground = dynamic(
  () => import("@/components/ui/flow-field-background"),
  { ssr: false }
);

const CATEGORIES = [
  { label: "Accessibility", icon: Eye, color: "var(--cat-accessibility)" },
  { label: "Security", icon: Shield, color: "var(--cat-security)" },
  { label: "Usability", icon: Zap, color: "var(--cat-usability)" },
  { label: "Mobile", icon: Smartphone, color: "var(--cat-mobile)" },
  { label: "Performance", icon: Gauge, color: "var(--cat-performance)" },
  { label: "AI Readability", icon: Bot, color: "var(--cat-ai-seo)" },
];

const FEATURES = [
  {
    icon: Monitor,
    title: "10 real Chromium browsers",
    desc: "Watch AI agents browse your site live — every click, scroll, and form fill streamed in real-time.",
  },
  {
    icon: Eye,
    title: "Gemini Vision annotations",
    desc: "AI analyzes your screenshots and draws bounding boxes on problems — red for bugs, green for what works.",
  },
  {
    icon: Copy,
    title: "Copy-paste fix prompt",
    desc: "Every issue synthesized into one prompt. Paste into ChatGPT, Claude, or Cursor for instant code fixes.",
  },
];

function catColor(cat: string) {
  switch (cat) {
    case "accessibility": return "var(--cat-accessibility)";
    case "security": return "var(--cat-security)";
    case "mobile": return "var(--cat-mobile)";
    case "usability": return "var(--cat-usability)";
    case "performance": return "var(--cat-performance)";
    default: return "var(--text-muted)";
  }
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [trashUrl, setTrashUrl] = useState("");
  const [bgReady, setBgReady] = useState(false);
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
      setTimeout(() => router.push(`/test/${data.test_id}?url=${encodeURIComponent(testUrl)}`), 1800);
    } catch {
      setError("Can't reach the server. Is the backend running?");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <TrashAnimation active={trashActive} url={trashUrl} />

      {/* Flow field — fades in after text */}
      <motion.div
        className="fixed inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgReady ? 1 : 0 }}
        transition={{ duration: 1.8, ease: "easeOut" }}
      >
        <NeuralBackground color="#e8a44a" trailOpacity={0.04} particleCount={500} speed={0.5} />
      </motion.div>

      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,12,0.4) 50%, rgba(10,10,12,0.85) 100%)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between"
        >
          <span className="text-[14px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            trashmy.tech
          </span>
          <a
            href="/test/demo"
            className="text-[10px] uppercase tracking-[0.12em] font-medium px-3 py-1.5 rounded-md no-underline transition-colors"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.3)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            View Demo Report
          </a>
        </motion.header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6">
          <div className="max-w-[620px] w-full text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-5"
            >
              <h1
                className="text-[36px] sm:text-[48px] font-bold leading-[1.1] tracking-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                find out what&apos;s{" "}
                <span className="text-gradient-amber">actually wrong</span>
                {" "}with your site
              </h1>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="mb-8 h-6"
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
                className="text-[14px]"
                cursor="_"
              />
            </motion.div>

            {/* URL Input */}
            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              onSubmit={handleSubmit}
              className="mb-4"
            >
              <div
                className="flex items-center gap-0 transition-all duration-200"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "8px",
                  border: `1px solid ${isFocused ? "var(--accent)" : "var(--border-default)"}`,
                  boxShadow: isFocused ? "0 0 0 3px rgba(232,164,74,0.08)" : "none",
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
                  className="flex-1 h-[52px] px-5 bg-transparent text-[14px] outline-none placeholder:opacity-30"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-[42px] px-6 mr-[5px] text-[12px] font-semibold uppercase tracking-[0.1em] rounded-[6px] transition-all duration-200 flex items-center gap-2.5 disabled:opacity-50 shrink-0 cursor-pointer"
                  style={{ fontFamily: "var(--font-display)", backgroundColor: "var(--accent)", color: "#0a0a0c" }}
                  onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; }}
                >
                  {isLoading ? (
                    <><Loader2 size={14} className="animate-spin" /><span>Testing</span></>
                  ) : (
                    <><span>Trash it</span><ArrowRight size={14} /></>
                  )}
                </button>
              </div>
            </motion.form>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center gap-2 text-[12px] mb-4"
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
                  className="mb-6 rounded-lg p-4"
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

            {/* Category pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="flex flex-wrap justify-center gap-2 mb-6"
            >
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.label}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-default)",
                      color: c.color,
                    }}
                  >
                    <Icon size={10} />
                    <span>{c.label}</span>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* ── Features — below the fold ── */}
          <div className="max-w-[620px] w-full mt-12 text-center">
            <Reveal delay={0}>
              <div className="mb-14">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                  <div className="section-label">What You Get</div>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                </div>
                <div className="space-y-4 text-left">
                  {FEATURES.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <Reveal key={f.title} delay={i * 0.08}>
                        <div
                          className="flex items-start gap-4 p-4 rounded-lg transition-colors duration-150"
                          style={{ border: "1px solid var(--border-default)", backgroundColor: "rgba(255,255,255,0.01)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,164,74,0.2)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: "rgba(232,164,74,0.08)", border: "1px solid rgba(232,164,74,0.15)" }}
                          >
                            <Icon size={14} style={{ color: "var(--accent)" }} />
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold mb-0.5" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                              {f.title}
                            </div>
                            <div className="text-[12px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                              {f.desc}
                            </div>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            </Reveal>

            {/* How it works — minimal numbered steps */}
            <Reveal delay={0.1}>
              <div className="mb-14">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                  <div className="section-label">How it Works</div>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                </div>
                <div className="flex gap-0">
                  {[
                    { step: "1", label: "Paste URL", desc: "We crawl the page, map every link, form, and button" },
                    { step: "2", label: "AI agents test", desc: "10 personas open real browsers and interact with your site" },
                    { step: "3", label: "Get results", desc: "Score, annotated screenshots, and a fix prompt you can copy" },
                  ].map((s, i) => (
                    <div key={s.step} className="flex-1 text-center px-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center mx-auto mb-2.5 text-[12px] font-bold"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", backgroundColor: "rgba(232,164,74,0.08)", border: "1px solid rgba(232,164,74,0.2)" }}
                      >
                        {s.step}
                      </div>
                      <div className="text-[12px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                        {s.label}
                      </div>
                      <div className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}>
                        {s.desc}
                      </div>
                      {i < 2 && (
                        <div className="hidden sm:block absolute" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </main>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between"
        >
          <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
            Built at HackIllinois 2026
          </span>
          <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}>
            v2.0
          </span>
        </motion.footer>
      </div>
    </div>
  );
}
