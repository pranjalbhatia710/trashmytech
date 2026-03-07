"use client";

import { useEffect, useState } from "react";

export type PerformanceTier = "low" | "medium" | "high";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
};

export function getPerformanceTier(): PerformanceTier {
  if (typeof window === "undefined") return "medium";

  const nav = navigator as NavigatorWithHints;
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const width = window.innerWidth;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  if (reducedMotion) return "low";

  if (width < 480 || memory <= 4 || cores <= 4) return "low";

  if (coarsePointer || width < 900 || memory <= 8 || cores <= 8) {
    return "medium";
  }

  return "high";
}

export function usePerformanceTier() {
  const [tier, setTier] = useState<PerformanceTier>("medium");

  useEffect(() => {
    const updateTier = () => setTier(getPerformanceTier());

    updateTier();

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(pointer: coarse)");

    window.addEventListener("resize", updateTier, { passive: true });
    reducedMotionQuery.addEventListener("change", updateTier);
    pointerQuery.addEventListener("change", updateTier);

    return () => {
      window.removeEventListener("resize", updateTier);
      reducedMotionQuery.removeEventListener("change", updateTier);
      pointerQuery.removeEventListener("change", updateTier);
    };
  }, []);

  return tier;
}
