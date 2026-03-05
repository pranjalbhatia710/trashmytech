"use client";

import { motion } from "framer-motion";

function getGradeFromScore(score: number): { letter: string; color: string; bg: string } {
  if (score >= 90) return { letter: "A", color: "#22c55e", bg: "rgba(34, 197, 94, 0.1)" };
  if (score >= 80) return { letter: "B", color: "#84cc16", bg: "rgba(132, 204, 22, 0.1)" };
  if (score >= 60) return { letter: "C", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" };
  if (score >= 40) return { letter: "D", color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" };
  return { letter: "F", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" };
}

interface GradeBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GradeBadge({ score, size = "md", className = "" }: GradeBadgeProps) {
  const grade = getGradeFromScore(score);

  const sizeClasses = {
    sm: "w-6 h-6 text-[10px]",
    md: "w-8 h-8 text-[13px]",
    lg: "w-12 h-12 text-[18px]",
  };

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", damping: 12 }}
      className={`rounded-full flex items-center justify-center font-bold ${sizeClasses[size]} ${className}`}
      style={{
        fontFamily: "var(--font-mono)",
        backgroundColor: grade.bg,
        color: grade.color,
        border: `1px solid ${grade.color}30`,
        boxShadow: `0 0 12px ${grade.color}20`,
      }}
    >
      {grade.letter}
    </motion.div>
  );
}
