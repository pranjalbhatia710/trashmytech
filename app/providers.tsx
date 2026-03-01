"use client";

import { SceneProvider } from "@/components/three/SceneContext";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SceneProvider>
      <div className="relative z-10">
        {children}
      </div>
    </SceneProvider>
  );
}
