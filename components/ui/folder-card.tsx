"use client";

import React from "react";

interface FolderCardProps {
  title: string;
  subtitle?: string;
  step?: string;
}

export function FolderCard({ title, subtitle, step }: FolderCardProps) {
  return (
    <div className="relative group flex flex-col items-center justify-center w-full">
      <div className="file relative w-full max-w-[200px] h-[130px] cursor-pointer origin-bottom [perspective:1500px] z-50">
        {/* Back folder panel */}
        <div className="w-full h-full origin-top rounded-2xl rounded-tl-none group-hover:shadow-[0_20px_40px_rgba(0,0,0,.2)] transition-all ease duration-300 relative after:absolute after:content-[''] after:bottom-[99%] after:left-0 after:w-16 after:h-3.5 after:rounded-t-2xl before:absolute before:content-[''] before:-top-[13px] before:left-[61px] before:w-3.5 before:h-3.5 before:[clip-path:polygon(0_35%,0%_100%,50%_100%)]"
          style={{
            backgroundColor: "var(--accent)",
          }}
        >
          <div className="absolute inset-0 rounded-2xl rounded-tl-none" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
          {/* Tab uses same color */}
          <style jsx>{`
            div::after, div::before {
              background-color: var(--accent) !important;
            }
          `}</style>
        </div>
        {/* Paper sheets */}
        <div className="absolute inset-1 rounded-2xl transition-all ease duration-300 origin-bottom select-none group-hover:[transform:rotateX(-20deg)]" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
        <div className="absolute inset-1 rounded-2xl transition-all ease duration-300 origin-bottom group-hover:[transform:rotateX(-30deg)]" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
        <div className="absolute inset-1 rounded-2xl transition-all ease duration-300 origin-bottom group-hover:[transform:rotateX(-38deg)]" style={{ backgroundColor: "rgba(255,255,255,0.05)" }} />
        {/* Front folder panel */}
        <div
          className="absolute bottom-0 w-full h-[118px] rounded-2xl rounded-tr-none after:absolute after:content-[''] after:bottom-[99%] after:right-0 after:w-[120px] after:h-[14px] after:rounded-t-2xl before:absolute before:content-[''] before:-top-[9px] before:right-[116px] before:size-3 before:[clip-path:polygon(100%_14%,50%_100%,100%_100%)] transition-all ease duration-300 origin-bottom flex items-end group-hover:[transform:rotateX(-46deg)_translateY(1px)]"
          style={{
            background: "linear-gradient(to top, var(--accent-hover), var(--accent))",
            boxShadow: "none",
          }}
        >
          <div className="group-hover:opacity-100 opacity-0 transition-opacity absolute inset-0 rounded-2xl rounded-tr-none" style={{ boxShadow: "inset 0 20px 40px rgba(232,164,74,0.4), inset 0 -20px 40px rgba(180,120,40,0.3)" }} />
        </div>
      </div>
      {/* Labels */}
      <div className="text-center mt-4">
        {step && (
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold block mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
          >
            {step}
          </span>
        )}
        <span
          className="text-[13px] font-semibold block"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="text-[11px] block mt-1"
            style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)" }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
