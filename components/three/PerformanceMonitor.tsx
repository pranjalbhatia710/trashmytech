"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useScene, type QualityTier } from "./SceneContext";

/** Detects GPU capability and sets quality tier in context. */
export function PerformanceMonitor() {
  const { gl } = useThree();
  const { setQualityTier } = useScene();

  useEffect(() => {
    // Check reduced motion preference
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setQualityTier("low");
      return;
    }

    // GPU detection via renderer info
    const info = gl.getContext().getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? gl.getContext().getParameter(info.UNMASKED_RENDERER_WEBGL)
      : "";

    let tier: QualityTier = "high";

    const r = renderer.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
    const isIntegrated = /intel|integrated|mesa|swiftshader|llvmpipe/i.test(r);

    if (isMobile) {
      tier = "low";
    } else if (isIntegrated) {
      tier = "medium";
    }

    setQualityTier(tier);
  }, [gl, setQualityTier]);

  return null;
}

/** Quality tier particle counts */
export function getParticleCount(tier: QualityTier): number {
  switch (tier) {
    case "high": return 2000;
    case "medium": return 800;
    case "low": return 300;
  }
}

/** Whether to enable postprocessing */
export function usePostProcessing(tier: QualityTier): boolean {
  return tier === "high";
}
