"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

const METRICS = [
  { label: "personas", value: "50", note: "parallel browser sessions" },
  { label: "turnaround", value: "~60s", note: "report with ranked fixes" },
  { label: "coverage", value: "6 lanes", note: "ux, a11y, mobile, security, performance, AI readability" },
];

const CHECKS = [
  "Crawl the site and map links, forms, buttons, and accessibility violations.",
  "Launch demographic, accessibility, behavioral, and chaos personas in parallel.",
  "Capture screenshots, blocked flows, and interaction traces from real browsers.",
  "Generate a report with scores, evidence, and copy-paste fix prompts.",
];

const OUTPUTS = [
  "Overall score plus category breakdowns",
  "Annotated screenshots with exact failures",
  "Persona verdicts and blocked user journeys",
  "Actionable fixes ordered by impact",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 250);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    let testUrl = url.trim();
    if (!testUrl) {
      inputRef.current?.focus();
      return;
    }

    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = `https://${testUrl}`;
      setUrl(testUrl);
    }

    try {
      new URL(testUrl);
    } catch {
      setError("Enter a valid URL.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/tests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: testUrl }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        setError(data?.error?.message || "The backend rejected this run.");
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      router.push(`/test/${data.test_id}?url=${encodeURIComponent(testUrl)}`);
    } catch {
      setError("Can't reach the backend. Start the API server first.");
      setIsLoading(false);
    }
  };

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
          <nav className="flex items-center gap-4 text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
            <Link href="/test/demo" className="no-underline" style={{ color: "var(--text-secondary)" }}>
              demo report
            </Link>
            <Link href="/compare" className="no-underline" style={{ color: "var(--text-secondary)" }}>
              compare
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <section className="space-y-8">
            <div className="space-y-4">
              <div
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                website QA with hostile personas
              </div>
              <h1
                className="max-w-[12ch] text-[40px] font-semibold leading-[0.98] tracking-tight sm:text-[64px]"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
              >
                Run the user test your release probably skipped.
              </h1>
              <p
                className="max-w-[58ch] text-[15px] leading-7 sm:text-[16px]"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
              >
                Paste a URL. trashmy.tech crawls the site, launches 50 parallel personas in real browsers,
                and returns a report covering accessibility, security, mobile, usability, performance, and
                AI readability.
              </p>
            </div>

            <section className="focus-shell p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-1">
                <label
                  htmlFor="site-url"
                  className="text-[11px] uppercase tracking-[0.14em]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  website url
                </label>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                  Enter the public URL you want to test. The run opens a live session page immediately.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    id="site-url"
                    ref={inputRef}
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    disabled={isLoading}
                    className="h-12 w-full border px-4 text-[14px] outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-default)",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                    }}
                    aria-label="Enter a website URL to analyze"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="depth-button depth-button-accent flex h-12 items-center justify-center gap-2 px-5 text-[12px] font-semibold uppercase tracking-[0.14em]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>starting</span>
                      </>
                    ) : (
                      <>
                        <span>run test</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>

                {error ? (
                  <p className="text-[12px]" style={{ color: "var(--status-fail)", fontFamily: "var(--font-mono)" }}>
                    {error}
                  </p>
                ) : null}
              </form>
            </section>

            <div className="grid gap-3 sm:grid-cols-3">
              {METRICS.map((metric) => (
                <div key={metric.label} className="focus-shell p-4">
                  <div
                    className="text-[11px] uppercase tracking-[0.14em]"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                  >
                    {metric.label}
                  </div>
                  <div
                    className="mt-3 text-[28px] font-semibold tracking-tight"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                  >
                    {metric.value}
                  </div>
                  <p className="mt-2 text-[13px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    {metric.note}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="focus-shell p-4 sm:p-5">
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                what the run does
              </div>
              <ul className="mt-4 space-y-3">
                {CHECKS.map((item) => (
                  <li
                    key={item}
                    className="border-b pb-3 text-[14px] leading-6 last:border-b-0 last:pb-0"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="focus-shell p-4 sm:p-5">
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                output
              </div>
              <ul className="mt-4 space-y-2">
                {OUTPUTS.map((item) => (
                  <li
                    key={item}
                    className="text-[14px] leading-6"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
