"use client";

import { useEffect, useRef, useState } from "react";

function getGradeFromScore(score: number): { letter: string; color: string } {
  if (score >= 85) return { letter: "A", color: "#22c55e" };
  if (score >= 70) return { letter: "B", color: "#84cc16" };
  if (score >= 55) return { letter: "C", color: "#f59e0b" };
  if (score >= 35) return { letter: "D", color: "#f97316" };
  return { letter: "F", color: "#ef4444" };
}

function scoreColor(score: number): string {
  if (score >= 60) return "var(--status-pass)";
  if (score >= 30) return "var(--status-warn)";
  return "var(--status-fail)";
}

interface ScoreGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showGrade?: boolean;
  className?: string;
  delay?: number;
}

export function ScoreGauge({
  score,
  size = 200,
  strokeWidth = 8,
  showGrade = true,
  className = "",
  delay = 0,
}: ScoreGaugeProps) {
  const [displayedScore, setDisplayedScore] = useState(0);
  const animatingTo = useRef(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const grade = getGradeFromScore(score);
  const color = scoreColor(score);

  useEffect(() => {
    if (score === animatingTo.current) return;
    animatingTo.current = score;

    const startVal = 0;
    const endVal = score;
    const duration = 1500; // ms
    let startTime: number | null = null;
    let raf: number;

    const delayMs = delay * 1000;

    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime - delayMs;
      if (elapsed < 0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * eased);
      setDisplayedScore(current);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, delay]);

  const progress = displayedScore / 100;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`depth-stage relative inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <div
        className="absolute inset-[16%] rounded-full"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
        }}
      />
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: "stroke-dashoffset 0.05s linear",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-0.5">
          <span
            className="font-bold leading-none tabular-nums"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: size * 0.28,
              color: "var(--text-primary)",
            }}
          >
            {displayedScore}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: size * 0.11,
              color: "var(--text-muted)",
            }}
          >
            /100
          </span>
        </div>
        {showGrade && (
          <span
            className="font-bold mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: size * 0.14,
              color: grade.color,
              letterSpacing: "0.08em",
            }}
          >
            {grade.letter}
          </span>
        )}
      </div>
    </div>
  );
}

export { getGradeFromScore, scoreColor };
