"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { label: "accessibility", color: "#3b82f6", desc: "can they read it" },
  { label: "chaos", color: "#6b7280", desc: "can they break it" },
  { label: "demographics", color: "#14b8a6", desc: "does it work for everyone" },
  { label: "behavior", color: "#8b5cf6", desc: "how do they actually use it" },
];

const PERSONAS_PREVIEW = [
  { initials: "MH", name: "Margaret, 68", desc: "low vision, 200% zoom", cat: "accessibility" },
  { initials: "JO", name: "James, 74", desc: "keyboard only, post-stroke", cat: "accessibility" },
  { initials: "PS", name: "Priya, 31", desc: "screen reader, blind", cat: "accessibility" },
  { initials: "FA", name: "FormAnarchist", desc: "SQL injection, XSS", cat: "chaos" },
  { initials: "RQ", name: "RageQuitter", desc: "3s patience", cat: "chaos" },
  { initials: "AT", name: "Aiko, 22", desc: "mobile-only, one-handed", cat: "demographic" },
  { initials: "SR", name: "SpeedRunner", desc: "50ms clicks", cat: "chaos" },
  { initials: "DS", name: "Dana, 41", desc: "checks privacy policy first", cat: "behavioral" },
];

function categoryColor(cat: string) {
  switch (cat) {
    case "accessibility": return "#3b82f6";
    case "chaos": return "#6b7280";
    case "demographic": return "#14b8a6";
    case "behavioral": return "#8b5cf6";
    default: return "#4a506a";
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    let testUrl = url.trim();
    if (!testUrl) return;

    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = "https://" + testUrl;
      setUrl(testUrl);
    }

    try {
      new URL(testUrl);
    } catch {
      setError("enter a valid URL");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/tests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: testUrl }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message || "something went wrong");
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      router.push(`/test/${data.test_id}?url=${encodeURIComponent(testUrl)}`);
    } catch {
      setError("can't reach the API server. is the backend running?");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="px-6 py-5">
        <span className="font-mono text-sm" style={{ color: "#7a8099" }}>
          trashmy.tech
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-[520px] w-full"
        >
          {/* Headline */}
          <h1
            className="text-[28px] font-semibold leading-tight mb-4"
            style={{ fontFamily: "var(--font-dm-sans)" }}
          >
            find out what&apos;s actually wrong
            <br />
            with your website
          </h1>

          {/* Description */}
          <p
            className="text-[15px] leading-[1.7] mb-8 max-w-[480px]"
            style={{ color: "#7a8099", fontFamily: "var(--font-dm-sans)" }}
          >
            20 AI personas test your site the way real humans do.
            A retired teacher with failing vision. A keyboard-only user
            recovering from a stroke. A chaos agent submitting SQL injection
            in your name field. You get the full report in 60 seconds.
          </p>

          {/* Input row */}
          <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              disabled={isLoading}
              className="flex-1 h-11 px-3 rounded font-mono text-sm outline-none transition-colors"
              style={{
                backgroundColor: "#0f1117",
                border: "1px solid #252a3a",
                color: "#d4d7e0",
                borderRadius: "4px",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#3d4560")}
              onBlur={(e) => (e.target.style.borderColor = "#252a3a")}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 px-5 font-mono text-[13px] uppercase tracking-wider transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "#0f1117",
                border: "1px solid #252a3a",
                color: "#d4d7e0",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#181b25")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#0f1117")}
            >
              {isLoading ? "testing..." : "test"}
            </button>
          </form>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-mono mb-4"
                style={{ color: "#ef4444" }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Category labels */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 mt-12 mb-16">
            {CATEGORIES.map((c) => (
              <div key={c.label}>
                <div
                  className="font-mono text-[11px] uppercase tracking-[1px]"
                  style={{ color: c.color }}
                >
                  {c.label}
                </div>
                <div
                  className="text-[13px] mt-0.5"
                  style={{ color: "#4a506a", fontFamily: "var(--font-dm-sans)" }}
                >
                  {c.desc}
                </div>
              </div>
            ))}
          </div>

          {/* Persona preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-16">
            {PERSONAS_PREVIEW.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                className="flex items-center gap-2 py-2"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] shrink-0"
                  style={{
                    backgroundColor: "#0f1117",
                    border: `2px solid ${categoryColor(p.cat)}`,
                    color: "#7a8099",
                  }}
                >
                  {p.initials}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[11px] truncate" style={{ color: "#d4d7e0" }}>
                    {p.name}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "#4a506a" }}>
                    {p.desc}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5">
        <span className="font-mono text-[11px]" style={{ color: "#4a506a" }}>
          built at hackillinois 2026
        </span>
      </footer>
    </div>
  );
}
