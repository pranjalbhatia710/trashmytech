"use client";

import { motion } from "framer-motion";
import { Clock, RefreshCw } from "lucide-react";

interface CachedReportBannerProps {
  cachedAt?: string | number | null;
  testUrl: string;
  className?: string;
}

function getRelativeTime(dateInput: string | number): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

export function CachedReportBanner({
  cachedAt,
  testUrl,
  className = "",
}: CachedReportBannerProps) {
  if (!cachedAt) return null;

  const relativeTime = getRelativeTime(cachedAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg ${className}`}
      style={{
        backgroundColor: "rgba(59, 130, 246, 0.04)",
        border: "1px solid rgba(59, 130, 246, 0.12)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Clock size={13} style={{ color: "var(--status-info)", flexShrink: 0 }} />
        <span
          className="text-[11px] font-medium truncate"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-secondary)",
          }}
        >
          This report was generated{" "}
          <span style={{ color: "var(--status-info)" }}>{relativeTime}</span>
        </span>
      </div>
      <a
        href={`/?url=${encodeURIComponent(testUrl)}&fresh=true`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors no-underline shrink-0 cursor-pointer"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--status-info)",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.15)",
        }}
      >
        <RefreshCw size={10} />
        Re-analyze
      </a>
    </motion.div>
  );
}
