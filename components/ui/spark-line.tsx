"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface SparkLineProps {
  data: number[]
  width?: number
  height?: number
  strokeWidth?: number
  color?: string
  className?: string
}

export function SparkLine({
  data,
  width = 280,
  height = 60,
  strokeWidth = 2,
  color = "#ef4444",
  className,
}: SparkLineProps) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min === 0 ? 1 : max - min

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((d - min) / range) * (height - strokeWidth * 2) - strokeWidth
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("", className)}
    >
      <defs>
        <linearGradient id={`spark-grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`M${points}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
      <motion.path
        d={`M${points} L${width},${height} L0,${height} Z`}
        fill={`url(#spark-grad-${color.replace('#','')})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.2, ease: "easeInOut" }}
      />
    </svg>
  )
}
