"use client";

import React, { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

interface LiveBrowserViewerProps {
  screenshot?: string;
  fallbackScreenshot?: string;
  agentName?: string;
  step?: number;
  url?: string;
  annotated?: boolean;
  className?: string;
  showEmbed?: boolean;
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
      className={`depth-browser overflow-hidden ${className}`.trim()}
      style={{
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      <div
        className="depth-browser-bar flex flex-wrap items-center gap-2 px-3 py-2"
        style={{
          borderBottom: "1px solid var(--border-default)",
          backgroundColor: "var(--bg-elevated)",
        }}
      >
        <span
          className="depth-pill px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
        >
          {agentName || "viewer"}
        </span>
        <div
          className="min-w-0 flex-1 truncate px-2 py-1 text-[11px]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          {url || "about:blank"}
        </div>
        {step !== undefined && step > 0 ? (
          <span
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
          >
            step {step}
          </span>
        ) : null}
      </div>

      <div className="relative" style={{ aspectRatio: "16 / 10", backgroundColor: "#0d0f12" }}>
        <AnimatePresence mode="wait">
          {showEmbed && url ? (
            <motion.div
              key="embed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full w-full"
            >
              <iframe
                src={url}
                className="h-full w-full border-0"
                style={{ pointerEvents: "none" }}
                title="Site preview"
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => setEmbedLoaded(true)}
              />
              {!embedLoaded ? (
                <div
                  className="absolute inset-0 flex items-center justify-center text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  loading site
                </div>
              ) : null}
            </motion.div>
          ) : displayImage ? (
            <motion.div
              key={screenshot ? screenshot.slice(-20) : "fallback"}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="relative h-full w-full"
            >
              <Image
                src={`data:image/jpeg;base64,${displayImage}`}
                alt="Browser view"
                fill
                unoptimized
                sizes="100vw"
                className="object-cover object-top"
              />
              {isFallback ? (
                <div
                  className="absolute inset-x-0 bottom-0 px-3 py-2 text-[10px] uppercase tracking-[0.12em]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-secondary)",
                    backgroundColor: "rgba(13,15,18,0.88)",
                    borderTop: "1px solid var(--border-default)",
                  }}
                >
                  using crawler screenshot while agent moves
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full w-full items-center justify-center"
            >
              <div
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                waiting for browser output
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(screenshot || showEmbed) && (annotated || agentName) ? (
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {annotated ? (
              <span
                className="depth-pill px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--status-fail)" }}
              >
                annotated
              </span>
            ) : null}
            {agentName ? (
              <span
                className="depth-pill px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
              >
                {agentName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
