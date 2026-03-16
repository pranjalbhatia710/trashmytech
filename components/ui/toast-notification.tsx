"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, X } from "lucide-react";

interface ToastNotificationProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  duration?: number;
  variant?: "success" | "error" | "info";
}

const VARIANT_CONFIG = {
  success: {
    icon: Check,
    color: "var(--status-pass)",
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.2)",
  },
  error: {
    icon: X,
    color: "var(--status-fail)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
  },
  info: {
    icon: Copy,
    color: "var(--accent)",
    bg: "rgba(232, 164, 74, 0.08)",
    border: "rgba(232, 164, 74, 0.2)",
  },
};

export function ToastNotification({
  message,
  visible,
  onClose,
  duration = 2500,
  variant = "success",
}: ToastNotificationProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 z-[200] flex items-center gap-2.5 px-4 py-2.5 rounded-lg"
          style={{
            transform: "translateX(-50%)",
            backgroundColor: config.bg,
            border: `1px solid ${config.border}`,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <Icon size={13} style={{ color: config.color, flexShrink: 0 }} />
          <span
            className="text-[12px] font-medium whitespace-nowrap"
            style={{
              fontFamily: "var(--font-display)",
              color: config.color,
            }}
          >
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
