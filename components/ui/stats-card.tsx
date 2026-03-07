"use client";

import React from "react";
import { motion } from "framer-motion";

interface StatItem {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
}

interface StatsCardProps {
  title: string;
  stats: StatItem[];
  accentColor?: string;
  className?: string;
}

export function StatsCard({ title, stats, accentColor = "#ef4444", className = "" }: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card depth-panel depth-panel-strong overflow-hidden ${className}`}
      style={{ borderRadius: "18px" }}
    >
      {/* Header with accent stripe */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(124, 137, 168, 0.16)" }}>
        <div
          className="depth-pill flex h-7 w-7 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${accentColor}14`,
            border: `1px solid ${accentColor}20`,
            boxShadow: "0 10px 18px rgba(0,0,0,0.18)",
          }}
        >
          <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[2px] font-semibold" style={{ color: "#8b90a7" }}>
          {title}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)` }}>
        {stats.map((stat, i) => (
          <div
            key={i}
            className="depth-panel px-5 py-4 relative"
            style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              borderRight: i < stats.length - 1 ? "1px solid rgba(124, 137, 168, 0.12)" : "none",
            }}
          >
            {stat.icon && (
              <div className="mb-2 opacity-60">{stat.icon}</div>
            )}
            <div className="font-mono text-[24px] font-bold leading-none mb-1.5" style={{ color: "#e2e5ed" }}>
              {stat.value}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[1.5px]" style={{ color: "#4a506a" }}>
              {stat.label}
            </div>
            {stat.change && (
              <div
                className="font-mono text-[10px] mt-1.5 font-medium"
                style={{
                  color: stat.changeType === "positive" ? "#22c55e" :
                    stat.changeType === "negative" ? "#ef4444" : "#8b90a7",
                }}
              >
                {stat.change}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
