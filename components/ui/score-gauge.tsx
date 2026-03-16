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
  if (score >= 70) return "var(--status-pass)";
  if (score >= 35) return "var(--status-warn)";
  return "var(--status-fail)";
}

// Resolve CSS variable to a hex color for SVG filter usage
function resolvedColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 35) return "#eab308";
  return "#ef4444";
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
  const resolvedCol = resolvedColor(score);

  useEffect(() => {
    if (score === animatingTo.current) return;
    animatingTo.current = score;

    const startVal = 0;
    const endVal = score;
    const duration = 1500; // ms
    let startTime: number | null = null;
    let raf: number;

    const delayMs = delay * 1000;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplayedScore(endVal);
      return;
    }

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
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={displayedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Score: ${score} out of 100, grade ${grade.letter}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Glow filter */}
        <defs>
          <filter id={`score-glow-${size}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
        />

        {/* Ambient glow arc (wider, blurred) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedCol}
          strokeWidth={strokeWidth + 6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          opacity={0.12}
          filter={`url(#score-glow-${size})`}
          style={{
            transition: "stroke-dashoffset 0.05s linear",
          }}
        />

        {/* Score arc */}
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
            filter: `drop-shadow(0 0 6px ${resolvedCol})`,
            transition: "stroke-dashoffset 0.05s linear",
          }}
        />
      </svg>

      {/* Center content */}
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
            className="font-medium leading-none"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: size * 0.1,
              color: "var(--text-muted)",
              opacity: 0.6,
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
              fontSize: size * 0.13,
              color: grade.color,
              textShadow: `0 0 12px ${grade.color}40`,
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
