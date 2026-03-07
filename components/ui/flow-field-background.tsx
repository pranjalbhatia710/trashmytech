"use client";

import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  className?: string;
  color?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
  intensity?: number;
  orbit?: boolean;
  formWord?: string;
  holdWord?: boolean;
}

export default function NeuralBackground({
  className,
  color = "#d06b2a",
  intensity = 0.2,
  formWord = "",
}: NeuralBackgroundProps) {
  const gridOpacity = Math.min(0.08 + intensity * 0.12, 0.18);

  return (
    <div aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: gridOpacity,
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: color, opacity: 0.35 }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-40"
        style={{
          background:
            "linear-gradient(180deg, rgba(13,15,18,0) 0%, rgba(13,15,18,0.74) 72%, rgba(13,15,18,0.96) 100%)",
        }}
      />
      {formWord ? (
        <div
          className="absolute bottom-5 right-5 text-[10px] uppercase tracking-[0.28em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.55 }}
        >
          {formWord}
        </div>
      ) : null}
    </div>
  );
}
