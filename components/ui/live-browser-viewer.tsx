"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveBrowserViewerProps {
  screenshot?: string; // base64 JPEG
  fallbackScreenshot?: string; // crawl screenshot as fallback
  agentName?: string;
  step?: number;
  url?: string;
  annotated?: boolean;
  className?: string;
  showEmbed?: boolean; // show live iframe of the site
}

export function LiveBrowserViewer({
  screenshot,
  fallbackScreenshot,
  agentName,
  step,
  url,
  annotated,
  className = "",
  showEmbed,
}: LiveBrowserViewerProps) {
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const displayImage = screenshot || fallbackScreenshot;
  const isFallback = !screenshot && !!fallbackScreenshot;

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      {/* Browser chrome bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{
          borderBottom: "1px solid var(--border-default)",
          backgroundColor: "rgba(10,10,12,0.6)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)", opacity: 0.8 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-warn)", opacity: 0.6 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-pass)", opacity: 0.6 }} />
        </div>

        <div
          className="flex-1 px-3 py-1 rounded-md text-[11px] truncate"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {url || "about:blank"}
        </div>

        {agentName && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)" }} />
            <span
              className="text-[10px] font-medium truncate max-w-[120px]"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}
            >
              {agentName}
            </span>
          </div>
        )}
      </div>

      {/* Viewport */}
      <div className="relative" style={{ aspectRatio: "16/10", backgroundColor: "#0a0a0c" }}>
        <AnimatePresence mode="wait">
          {showEmbed && url ? (
            <motion.div
              key="embed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full relative"
            >
              <iframe
                src={url}
                className="w-full h-full border-0"
                style={{ pointerEvents: "none" }}
                title="Site preview"
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => setEmbedLoaded(true)}
              />
              {!embedLoaded && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#0a0a0c" }}>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "200ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "400ms" }} />
                    </div>
                    <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}>
                      Loading site...
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : displayImage ? (
            <motion.div
              key={screenshot ? screenshot.slice(-20) : "fallback"}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full relative"
            >
              <img
                src={`data:image/jpeg;base64,${displayImage}`}
                alt="Browser view"
                className="w-full h-full object-cover object-top"
              />
              {/* Dim overlay when showing fallback */}
              {isFallback && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(10,10,12,0.5)" }}>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "200ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)", animationDelay: "400ms" }} />
                    </div>
                    <span className="text-[11px]" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                      Agent navigating...
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex items-center justify-center"
            >
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "200ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)", animationDelay: "400ms" }} />
                </div>
                <span
                  className="text-[11px]"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-muted)" }}
                >
                  Waiting for agent...
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)",
            mixBlendMode: "overlay",
          }}
        />

        {/* Badges */}
        {(screenshot || showEmbed) && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {annotated && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", backdropFilter: "blur(4px)", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "#ef4444" }}>Annotated</span>
              </div>
            )}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{ backgroundColor: "rgba(10,10,12,0.7)", backdropFilter: "blur(4px)", border: "1px solid rgba(232,164,74,0.2)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)" }} />
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>Live</span>
            </div>
          </div>
        )}

        {/* Step counter */}
        {step !== undefined && step > 0 && (
          <div className="absolute bottom-3 left-3">
            <span
              className="text-[9px] px-2 py-1 rounded-md"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                backgroundColor: "rgba(10,10,12,0.7)",
                backdropFilter: "blur(4px)",
                border: "1px solid rgba(232,164,74,0.15)",
              }}
            >
              step {step}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
