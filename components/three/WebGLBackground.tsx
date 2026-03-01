"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useScene } from "./SceneContext";
import { PerformanceMonitor, usePostProcessing } from "./PerformanceMonitor";
import { ParticleField } from "./ParticleField";
import { FloatingGrid } from "./FloatingGrid";
import { ScoreSphere } from "./ScoreSphere";

function Scene() {
  const { qualityTier } = useScene();
  const enablePost = usePostProcessing(qualityTier);

  return (
    <>
      <PerformanceMonitor />

      {/* Camera parallax driven by mouse is handled per-component */}
      <ambientLight intensity={0.3} />

      <ParticleField />
      <FloatingGrid />
      <ScoreSphere />

      {enablePost && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.4}
            luminanceSmoothing={0.9}
            intensity={0.4}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.7} />
        </EffectComposer>
      )}
    </>
  );
}

export default function WebGLBackground() {
  const { qualityTier } = useScene();
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent scroll interference
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => {
      // Let scroll pass through to the page
      e.stopPropagation();
    };
    el.addEventListener("wheel", prevent, { passive: true });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const dpr: [number, number] = qualityTier === "low" ? [0.5, 1] : [1, 2];

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        dpr={dpr}
        camera={{ position: [0, 0, 15], fov: 60, near: 0.1, far: 100 }}
        gl={{
          alpha: true,
          antialias: qualityTier !== "low",
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
        }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
