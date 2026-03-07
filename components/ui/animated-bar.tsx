"use client";

import { motion } from "framer-motion";

interface AnimatedBarProps {
  value: number;
  maxValue?: number;
  color?: string;
  height?: number;
  label?: string;
  showValue?: boolean;
  delay?: number;
  className?: string;
}

export function AnimatedBar({
  value,
  maxValue = 100,
  color = "var(--accent)",
  height = 6,
  label,
  showValue = true,
  delay = 0,
  className = "",
}: AnimatedBarProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span
              className="text-[12px] font-medium"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-secondary)",
              }}
            >
              {label}
            </span>
          )}
          {showValue && (
            <span
              className="text-[12px] font-semibold tabular-nums"
              style={{
                fontFamily: "var(--font-mono)",
                color,
              }}
            >
              {value}
            </span>
          )}
        </div>
      )}
      <div
        className="rounded-full overflow-hidden"
        style={{
          height,
          backgroundColor: "rgba(255,255,255,0.04)",
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 0.8,
            delay,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>
    </div>
  );
}
