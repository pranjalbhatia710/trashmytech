"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * Full-screen warp transition overlay.
 * Cinematic scan-line + particle burst effect when submitting a URL.
 */
export function TrashAnimation({ active, url }: { active: boolean; url: string }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: "rgba(8, 9, 13, 0.98)" }}
        >
          {/* Radial glow pulse */}
          <motion.div
            className="absolute"
            style={{
              width: 300,
              height: 300,
              background: "radial-gradient(circle, rgba(232,164,74,0.15) 0%, rgba(232,164,74,0.03) 50%, transparent 70%)",
              filter: "blur(40px)",
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />

          {/* Scanning ring 1 */}
          <motion.div
            className="absolute rounded-full"
            style={{ border: "1px solid rgba(232,164,74,0.2)" }}
            initial={{ width: 0, height: 0, opacity: 0.8 }}
            animate={{ width: 600, height: 600, opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
          />

          {/* Scanning ring 2 */}
          <motion.div
            className="absolute rounded-full"
            style={{ border: "1px solid rgba(232,164,74,0.15)" }}
            initial={{ width: 0, height: 0, opacity: 0.6 }}
            animate={{ width: 800, height: 800, opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
          />

          {/* Center dot */}
          <motion.div
            className="absolute w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 20px rgba(232,164,74,0.6)" }}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.5, 1] }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Orbiting particles */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full"
              style={{ backgroundColor: "var(--accent)", opacity: 0.6 }}
              initial={{
                x: Math.cos((i / 6) * Math.PI * 2) * 20,
                y: Math.sin((i / 6) * Math.PI * 2) * 20,
                scale: 0,
              }}
              animate={{
                x: [
                  Math.cos((i / 6) * Math.PI * 2) * 20,
                  Math.cos((i / 6) * Math.PI * 2 + Math.PI) * 80,
                  Math.cos((i / 6) * Math.PI * 2 + Math.PI * 2) * 200,
                ],
                y: [
                  Math.sin((i / 6) * Math.PI * 2) * 20,
                  Math.sin((i / 6) * Math.PI * 2 + Math.PI) * 80,
                  Math.sin((i / 6) * Math.PI * 2 + Math.PI * 2) * 200,
                ],
                scale: [0, 1, 0],
                opacity: [0, 0.8, 0],
              }}
              transition={{ duration: 1.2, delay: 0.2 + i * 0.05, ease: "easeOut" }}
            />
          ))}

          {/* URL text — fading and compressing */}
          <motion.div
            initial={{ opacity: 0.7, y: 0, scale: 1, letterSpacing: "0px" }}
            animate={{ opacity: 0, y: -8, scale: 0.95, letterSpacing: "4px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="absolute font-mono text-[12px] tracking-wide"
            style={{ color: "var(--text-muted)", top: "42%" }}
          >
            {url}
          </motion.div>

          {/* Status text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.6, times: [0, 0.2, 0.7, 1], delay: 0.3 }}
            className="absolute font-mono text-[10px] uppercase tracking-[4px]"
            style={{ color: "var(--accent)", top: "58%", opacity: 0.7 }}
          >
            Initializing audit
          </motion.div>

          {/* Horizontal scan line */}
          <motion.div
            className="absolute left-0 right-0 h-px"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(232,164,74,0.4) 30%, rgba(232,164,74,0.6) 50%, rgba(232,164,74,0.4) 70%, transparent 100%)",
            }}
            initial={{ top: "30%", opacity: 0 }}
            animate={{ top: "70%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.0, ease: "easeInOut", delay: 0.2 }}
          />

          {/* Final warp — expanding circle covers screen */}
          <motion.div
            className="absolute rounded-full"
            style={{ backgroundColor: "#08090d" }}
            initial={{ width: 0, height: 0, opacity: 0 }}
            animate={{ width: 3000, height: 3000, opacity: 1 }}
            transition={{ delay: 1.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
