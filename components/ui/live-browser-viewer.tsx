"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveBrowserViewerProps {
  screenshot?: string; // base64 JPEG
  agentName?: string;
  step?: number;
  url?: string;
  annotated?: boolean;
  className?: string;
}

export function LiveBrowserViewer({
  screenshot,
  agentName,
  step,
  url,
  annotated,
  className = "",
}: LiveBrowserViewerProps) {
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
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)", opacity: 0.8 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-warn)", opacity: 0.6 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--status-pass)", opacity: 0.6 }} />
        </div>

        {/* URL bar */}
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

        {/* Agent label + step */}
        {agentName && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--status-pass)" }} />
            <span
              className="text-[10px] font-medium truncate max-w-[120px]"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}
            >
              {agentName}
            </span>
            {step !== undefined && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent)",
                  backgroundColor: "rgba(232,164,74,0.1)",
                }}
              >
                Step {step}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Viewport */}
      <div className="relative" style={{ aspectRatio: "16/10", backgroundColor: "#0a0a0c" }}>
        <AnimatePresence mode="wait">
          {screenshot ? (
            <motion.img
              key={screenshot.slice(-20)}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              src={`data:image/jpeg;base64,${screenshot}`}
              alt="Live browser view"
              className="w-full h-full object-cover object-top"
            />
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

        {/* Scanline overlay for "live" feel */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)",
            mixBlendMode: "overlay",
          }}
        />

        {/* Badges — top right */}
        {screenshot && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {/* Annotated badge */}
            {annotated && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{
                  backgroundColor: "rgba(239,68,68,0.15)",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <span
                  className="text-[9px] font-semibold uppercase tracking-[0.1em]"
                  style={{ fontFamily: "var(--font-display)", color: "#ef4444" }}
                >
                  Annotated
                </span>
              </div>
            )}
            {/* Live badge */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                backgroundColor: "rgba(10,10,12,0.7)",
                backdropFilter: "blur(4px)",
                border: "1px solid rgba(232,164,74,0.2)",
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--accent)" }} />
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.1em]"
                style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
              >
                Live
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
