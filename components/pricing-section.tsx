"use client";

import { motion } from "framer-motion";
import { Check, Zap, Shield, BarChart3, Globe } from "lucide-react";

interface PricingSectionProps {
  onGetStarted?: () => void;
}

export function PricingSection({ onGetStarted }: PricingSectionProps) {
  const features = [
    { icon: Zap, text: "Unlimited website analyses" },
    { icon: BarChart3, text: "All audit modes — Fast, Standard, Deep" },
    { icon: Globe, text: "Full AI-generated reports with 30+ agents" },
    { icon: Shield, text: "No subscription. No recurring charges." },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="px-6 sm:px-8 py-16 max-w-[600px] mx-auto w-full"
    >
      <div className="text-center mb-8">
        <span
          className="text-[10px] uppercase tracking-[0.14em] font-medium px-2.5 py-1 rounded-md inline-block mb-4"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--accent)",
            backgroundColor: "rgba(232,164,74,0.08)",
            border: "1px solid rgba(232,164,74,0.15)",
          }}
        >
          Simple pricing
        </span>
        <h2
          className="text-[28px] sm:text-[32px] font-bold leading-tight mb-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          <span className="text-gradient-amber">$5</span> one-time.{" "}
          <span style={{ color: "var(--text-secondary)" }}>Unlimited forever.</span>
        </h2>
        <p
          className="text-[14px] leading-relaxed"
          style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
        >
          One payment. No subscription. Every analysis mode, every AI agent, forever.
        </p>
      </div>

      {/* Feature list */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div className="space-y-4">
          {features.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "rgba(232,164,74,0.08)",
                  border: "1px solid rgba(232,164,74,0.12)",
                }}
              >
                <Icon size={14} style={{ color: "var(--accent)" }} />
              </div>
              <span
                className="text-[13px]"
                style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)" }}
              >
                {text}
              </span>
            </div>
          ))}
        </div>

        {/* First analysis free note */}
        <div
          className="mt-5 pt-4 flex items-center gap-2"
          style={{ borderTop: "1px solid var(--border-default)" }}
        >
          <Check size={14} style={{ color: "var(--status-pass)" }} />
          <span
            className="text-[12px]"
            style={{ fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}
          >
            First analysis is free — no account needed
          </span>
        </div>
      </div>

      {/* CTA */}
      {onGetStarted && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onGetStarted}
          className="w-full h-[48px] rounded-lg text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
          style={{
            fontFamily: "var(--font-display)",
            backgroundColor: "var(--accent)",
            color: "#0a0a0c",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; }}
        >
          Get Started
        </motion.button>
      )}
    </motion.section>
  );
}
