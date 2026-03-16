"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Smoothly animates between number values with an ease-out curve.
 * Uses requestAnimationFrame for 60fps updates.
 */
export function AnimatedCounter({
  value,
  duration = 600,
  className = "",
  style,
}: AnimatedCounterProps) {
  const [displayed, setDisplayed] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (from === to) return;

    let startTime: number | null = null;

    const animate = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span className={`tabular-nums ${className}`} style={style}>
      {displayed}
    </span>
  );
}
