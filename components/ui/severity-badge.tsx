"use client";

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", label: "Critical" },
  major: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", label: "Major" },
  high: { color: "#f97316", bg: "rgba(249, 115, 22, 0.1)", label: "High" },
  medium: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)", label: "Medium" },
  minor: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)", label: "Minor" },
  low: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)", label: "Low" },
  info: { color: "#60a5fa", bg: "rgba(96, 165, 250, 0.1)", label: "Info" },
};

export function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity.toLowerCase()] || SEVERITY_CONFIG.info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase tracking-[0.08em] font-semibold ${className}`}
      style={{
        fontFamily: "var(--font-display)",
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.color}20`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
