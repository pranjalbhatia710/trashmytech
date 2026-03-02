"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface ReportFolderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ReportFolder({
  title,
  subtitle,
  icon,
  accentColor = "var(--accent)",
  count,
  defaultOpen = false,
  children,
  className = "",
}: ReportFolderProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`overflow-hidden ${className}`}>
      {/* Folder tab */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full group flex items-center gap-3 px-5 py-3.5 rounded-t-xl transition-all duration-300"
        style={{
          backgroundColor: open ? "rgba(15, 17, 23, 0.7)" : "rgba(15, 17, 23, 0.3)",
          border: `1px solid ${open ? `${accentColor}25` : "rgba(30, 34, 50, 0.4)"}`,
          borderBottom: open ? "none" : `1px solid rgba(30, 34, 50, 0.4)`,
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Folder icon/tab shape */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
          style={{
            backgroundColor: `${accentColor}12`,
            boxShadow: open ? `0 0 12px ${accentColor}15` : "none",
          }}
        >
          {icon || (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
          )}
        </div>

        <div className="flex-1 text-left">
          <div className="font-mono text-[12px] font-semibold" style={{ color: "#e2e5ed" }}>
            {title}
          </div>
          {subtitle && (
            <div className="font-mono text-[10px] mt-0.5" style={{ color: "#4a506a" }}>
              {subtitle}
            </div>
          )}
        </div>

        {count != null && (
          <span
            className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            {count}
          </span>
        )}

        <ChevronDown
          size={14}
          style={{
            color: "#4a506a",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </button>

      {/* Folder contents */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className="px-5 py-4 rounded-b-xl"
              style={{
                backgroundColor: "rgba(15, 17, 23, 0.5)",
                border: `1px solid ${accentColor}25`,
                borderTop: "none",
                backdropFilter: "blur(12px)",
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
