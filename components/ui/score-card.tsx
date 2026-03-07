"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface StatData {
  title: string
  value: string | number
  unit?: string
  changePercent?: number
  changeDirection?: "up" | "down"
}

export interface ScoreBarData {
  label: string
  value: number
  color?: string
  description?: string
}

export interface ScoreCardProps extends React.HTMLAttributes<HTMLDivElement> {
  headerIcon?: React.ReactNode
  title: string
  stats: StatData[]
  graphData?: ScoreBarData[]
  graphHeight?: number
  showLegend?: boolean
  legendTitle?: string
  legendFormat?: (item: ScoreBarData) => string
}

export const ScoreCard = React.forwardRef<HTMLDivElement, ScoreCardProps>(
  (
    {
      className,
      headerIcon,
      title,
      stats,
      graphData,
      graphHeight = 100,
      showLegend = true,
      legendTitle = "Score Breakdown",
      legendFormat,
      ...props
    },
    ref
  ) => {
    const containerVariants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.05 },
      },
    }

    const barVariants = {
      hidden: { scaleY: 0 },
      visible: {
        scaleY: 1,
        transition: { type: "spring" as const, stiffness: 100, damping: 15 },
      },
    }

    return (
      <div
        ref={ref}
        className={cn("glass-card depth-panel depth-panel-strong w-full rounded-[20px] p-5", className)}
        style={{
          backgroundColor: "#0f141b",
          border: "1px solid rgba(124, 137, 168, 0.18)",
        }}
        {...props}
      >
        {/* Header */}
        <div className="mb-4 flex items-center gap-2.5">
          {headerIcon && (
            <div
              className="depth-pill flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                color: "#ef4444",
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.14)",
              }}
            >
              {headerIcon}
            </div>
          )}
          <h2 className="font-mono text-[12px] uppercase tracking-[1.5px]" style={{ color: "#7a8099" }}>
            {title}
          </h2>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-3 gap-3 text-center">
          {stats.map((item, i) => (
            <div
              key={i}
              className="depth-panel rounded-2xl px-3 py-3"
              style={{
                backgroundColor: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(124, 137, 168, 0.14)",
              }}
            >
              <div className="flex items-center justify-center gap-1">
                <p className="font-mono text-[22px] font-bold" style={{ color: "#d4d7e0" }}>
                  {item.value}
                </p>
                {item.unit && (
                  <span className="font-mono text-[11px]" style={{ color: "#4a506a" }}>
                    {item.unit}
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.5px]" style={{ color: "#4a506a" }}>
                {item.title}
              </p>
              {item.changePercent !== undefined && (
                <div
                  className="mt-0.5 font-mono text-[10px] font-medium"
                  style={{
                    color: item.changeDirection === "up" ? "#22c55e" : "#ef4444",
                  }}
                >
                  {item.changeDirection === "up" ? "\u25B2" : "\u25BC"} {Math.abs(item.changePercent)}%
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Animated Graph */}
        {graphData && (
          <TooltipProvider delayDuration={100}>
            <div
              className="depth-panel depth-panel-cool rounded-[18px] p-3"
              style={{
                backgroundColor: "#151a22",
                border: "1px solid rgba(124, 137, 168, 0.12)",
              }}
            >
              <motion.div
                className="flex w-full items-end justify-between gap-1.5"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                style={{ height: graphHeight }}
              >
                {graphData.map((bar, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <motion.div
                        className="relative flex-1 cursor-pointer overflow-hidden rounded-[10px]"
                        style={{
                          height: `${bar.value}%`,
                          background: bar.color || "#ef4444",
                          boxShadow: "0 10px 18px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -8px 14px rgba(0,0,0,0.24)",
                          originY: 1,
                        }}
                        variants={barVariants}
                        whileHover={{
                          scale: 1.08,
                          y: -4,
                          boxShadow: "0 16px 24px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -8px 14px rgba(0,0,0,0.24)",
                          transition: { type: "spring", stiffness: 200, damping: 10 },
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span
                          className="absolute inset-x-[10%] top-0 h-[36%] rounded-full"
                          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0))" }}
                        />
                        <span
                          className="absolute inset-y-[18%] left-[18%] right-[18%] rounded-full blur-md"
                          style={{ backgroundColor: bar.color || "#ef4444", opacity: 0.35 }}
                        />
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-mono">
                      <p className="font-semibold" style={{ color: "#d4d7e0" }}>{bar.label}</p>
                      <p style={{ color: "#7a8099" }}>{bar.value}/100</p>
                      {bar.description && (
                        <p className="mt-1" style={{ color: "#4a506a" }}>{bar.description}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </motion.div>
            </div>
          </TooltipProvider>
        )}

        {/* Legend */}
        {showLegend && graphData && (
          <div className="mt-4">
            <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[1px]" style={{ color: "#4a506a" }}>
              {legendTitle}
            </h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {graphData.map((item, i) => (
                <div
                  key={i}
                  className="depth-pill flex items-center gap-1.5 rounded-full px-2 py-1"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(124, 137, 168, 0.12)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: item.color || "#ef4444" }}
                  />
                  <span className="font-mono text-[10px]" style={{ color: "#7a8099" }}>
                    {legendFormat
                      ? legendFormat(item)
                      : `${item.label} (${item.value})`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

ScoreCard.displayName = "ScoreCard"
