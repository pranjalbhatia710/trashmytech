"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * Full-screen trash bin animation overlay.
 * Shows a glowing trash can that "eats" the URL, then expands into a warp transition.
 */
export function TrashAnimation({ active, url }: { active: boolean; url: string }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: "rgba(8, 9, 13, 0.95)" }}
        >
          {/* URL text flying into bin */}
          <motion.div
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: 60, scale: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="absolute font-mono text-[13px]"
            style={{ color: "#8b90a7", top: "38%" }}
          >
            {url}
          </motion.div>

          {/* Trash bin SVG */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 200 }}
            className="relative"
          >
            <svg width="80" height="96" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Bin body */}
              <motion.rect
                x="12" y="28" width="56" height="60" rx="6"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              />
              {/* Lid */}
              <motion.path
                d="M6 28h68"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              />
              {/* Handle */}
              <motion.path
                d="M30 28V20a10 10 0 0 1 20 0v8"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              />
              {/* Slats */}
              {[28, 40, 52].map((x, i) => (
                <motion.line
                  key={x}
                  x1={x} y1="40" x2={x} y2="76"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.5 }}
                  transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
                />
              ))}
            </svg>

            {/* Glow behind bin */}
            <div
              className="absolute inset-0 -m-8 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />
          </motion.div>

          {/* Lid bounce animation */}
          <motion.div
            className="absolute"
            style={{ top: "calc(50% - 36px)" }}
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, -15, 0, -8, 0] }}
            transition={{ delay: 0.7, duration: 0.5, ease: "easeInOut" }}
          />

          {/* Shockwave ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ border: "1px solid rgba(239,68,68,0.3)" }}
            initial={{ width: 0, height: 0, opacity: 1 }}
            animate={{ width: 400, height: 400, opacity: 0 }}
            transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
          />

          {/* "Trashing..." text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="absolute font-mono text-[12px] uppercase tracking-[3px]"
            style={{ color: "#ef4444", top: "64%" }}
          >
            Trashing...
          </motion.div>

          {/* Warp out — expanding circle that covers screen */}
          <motion.div
            className="absolute rounded-full"
            style={{ backgroundColor: "#08090d" }}
            initial={{ width: 0, height: 0, opacity: 0 }}
            animate={{ width: 3000, height: 3000, opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
