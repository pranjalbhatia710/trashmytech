"use client";

import { motion } from "framer-motion";

type OutcomeType = "blocked" | "struggled" | "completed" | string;

function outcomeConfig(outcome: OutcomeType): { color: string; bg: string; label: string } {
  switch (outcome) {
    case "blocked":
      return { color: "#ef4444", bg: "rgba(239, 68, 68, 0.08)", label: "BLOCKED" };
    case "struggled":
      return { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)", label: "STRUGGLED" };
    case "completed":
      return { color: "#4ade80", bg: "rgba(74, 222, 128, 0.08)", label: "FINE" };
    default:
      return { color: "var(--text-muted)", bg: "rgba(255,255,255,0.03)", label: outcome };
  }
}

function catColor(cat: string) {
  switch (cat) {
    case "accessibility": return "var(--cat-accessibility)";
    case "chaos": case "security": return "var(--cat-security)";
    case "demographic": return "var(--cat-ai-seo)";
    case "behavioral": case "usability": return "var(--cat-usability)";
    case "mobile": return "var(--cat-mobile)";
    case "performance": return "var(--cat-performance)";
    default: return "var(--text-muted)";
  }
}

function initials(name: string | undefined) {
  if (!name) return "??";
  return name.replace(/[^A-Za-z ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

interface PersonaCardProps {
  name: string;
  age?: number | null;
  category?: string;
  outcome: OutcomeType;
  narrative?: string;
  primaryBarrier?: string | null;
  delay?: number;
  className?: string;
  onClick?: () => void;
}

export function PersonaCard({
  name,
  age,
  category = "",
  outcome,
  narrative,
  primaryBarrier,
  delay = 0,
  className = "",
  onClick,
}: PersonaCardProps) {
  const config = outcomeConfig(outcome);
  const accentColor = catColor(category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={`rounded-xl overflow-hidden transition-colors duration-200 ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        backgroundColor: config.bg,
        border: `1px solid ${config.color}20`,
      }}
      whileHover={onClick ? { scale: 1.01 } : undefined}
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2.5">
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{
              backgroundColor: `${accentColor}15`,
              color: accentColor,
              fontFamily: "var(--font-display)",
              border: `1px solid ${accentColor}25`,
            }}
          >
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                {name}
              </span>
              {age && (
                <span
                  className="text-[10px] shrink-0"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  {age}
                </span>
              )}
            </div>
          </div>
          <span
            className="text-[9px] px-2 py-0.5 rounded font-semibold uppercase tracking-[0.06em] shrink-0"
            style={{
              fontFamily: "var(--font-display)",
              backgroundColor: config.bg,
              color: config.color,
              border: `1px solid ${config.color}25`,
            }}
          >
            {config.label}
          </span>
        </div>

        {narrative && (
          <p
            className="text-[11px] leading-relaxed mb-2"
            style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
          >
            {narrative}
          </p>
        )}

        {primaryBarrier && (
          <div
            className="text-[10px] px-2 py-1.5 rounded mt-2"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "rgba(248,113,113,0.05)",
              border: "1px solid rgba(248,113,113,0.1)",
              color: "var(--status-fail)",
            }}
          >
            {primaryBarrier}
          </div>
        )}
      </div>
    </motion.div>
  );
}
