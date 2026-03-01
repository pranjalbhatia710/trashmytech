"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Zap, Eye, Shield, Smartphone, Gauge, Bot } from "lucide-react";
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

const PERSONAS = [
  { initials: "MH", name: "Margaret, 68", trait: "200% zoom, low vision", cat: "accessibility" },
  { initials: "JO", name: "James, 74", trait: "Keyboard only, post-stroke", cat: "accessibility" },
  { initials: "PS", name: "Priya, 31", trait: "Screen reader, blind", cat: "accessibility" },
  { initials: "FA", name: "FormAnarchist", trait: "SQL injection, XSS payloads", cat: "security" },
  { initials: "RQ", name: "RageQuitter", trait: "3 second patience limit", cat: "security" },
  { initials: "AT", name: "Aiko, 22", trait: "iPhone SE, one-handed", cat: "mobile" },
  { initials: "DK", name: "Dana, 41", trait: "Reads privacy policy first", cat: "usability" },
  { initials: "MR", name: "Marco, 28", trait: "Clicks everything, explores", cat: "usability" },
  { initials: "SR", name: "SpeedRunner", trait: "50ms rapid double-clicks", cat: "security" },
  { initials: "KN", name: "Kai, 26", trait: "Keyboard shortcuts only", cat: "performance" },
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

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [trashUrl, setTrashUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 1000);
    return () => clearTimeout(timeout);
  }, []);

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
      {/* Trash animation overlay */}
      <TrashAnimation active={trashActive} url={trashUrl} />

      {/* Flow field particle background — full screen, behind everything */}
      <div className="fixed inset-0 z-0">
        <NeuralBackground
          color="#e8a44a"
          trailOpacity={0.06}
          particleCount={700}
          speed={0.7}
        />
      </div>

      {/* Radial gradient overlay for depth */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,12,0.4) 50%, rgba(10,10,12,0.85) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between"
        >
          <span
            className="text-[14px] font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            trashmy.tech
          </span>
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] uppercase tracking-[0.12em] font-medium"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
            >
              50 AI personas
            </span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 8px rgba(232,164,74,0.4)" }} />
          </div>
        </motion.header>

        {/* Hero — center of the page */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6">
          <div className="max-w-[620px] w-full">
            {/* Typewriter tagline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mb-3"
            >
              <span
                className="text-[11px] uppercase tracking-[0.15em] font-medium"
                style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
              >
                AI Website Stress Testing
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mb-6"
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="mb-10 h-7"
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
                className="text-[15px] sm:text-[16px]"
                cursor="_"
              />
            </motion.div>

            {/* URL Input — clean, solid, no glass */}
            <motion.form
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.65 }}
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
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-[42px] px-6 mr-[5px] text-[12px] font-semibold uppercase tracking-[0.1em] rounded-[6px] transition-all duration-200 flex items-center gap-2.5 disabled:opacity-50 shrink-0 cursor-pointer"
                  style={{
                    fontFamily: "var(--font-display)",
                    backgroundColor: "var(--accent)",
                    color: "#0a0a0c",
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) e.currentTarget.style.backgroundColor = "var(--accent-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--accent)";
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Testing</span>
                    </>
                  ) : (
                    <>
                      <span>Trash it</span>
                      <ArrowRight size={14} />
                    </>
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

            {/* Category pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.85 }}
              className="flex flex-wrap gap-2 mt-8 mb-10"
            >
              {CATEGORIES.map((c, i) => {
                const Icon = c.icon;
                return (
                  <motion.div
                    key={c.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 + i * 0.06, duration: 0.3 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-default)",
                      color: c.color,
                    }}
                  >
                    <Icon size={11} />
                    <span>{c.label}</span>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Persona roster */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="section-label">Testing Agents</div>
                <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-default)" }} />
                <span
                  className="text-[10px] font-medium"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                >
                  50 personas
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
                {PERSONAS.map((p, i) => (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 + i * 0.04, duration: 0.3 }}
                    className="flex items-center gap-2 px-2 py-2 rounded-md transition-colors duration-150 cursor-default group"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
                      style={{
                        fontFamily: "var(--font-display)",
                        backgroundColor: "var(--bg-surface)",
                        border: `1.5px solid ${catColor(p.cat)}`,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <div
                        className="text-[10px] leading-tight font-medium truncate"
                        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                      >
                        {p.name}
                      </div>
                      <div
                        className="text-[9px] leading-tight mt-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p.trait}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div
                className="text-[10px] mt-2 ml-1"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
              >
                + 40 custom personas generated per test
              </div>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="px-6 sm:px-8 py-5 flex items-center justify-between"
        >
          <span
            className="text-[10px] font-medium"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
          >
            Built at HackIllinois 2026
          </span>
          <span
            className="text-[10px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--border-default)" }}
          >
            v2.0
          </span>
        </motion.footer>
      </div>
    </div>
  );
}
