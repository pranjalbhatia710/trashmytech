"use client";

import { SceneProvider } from "@/components/three/SceneContext";
import AuthSessionProvider from "@/app/api/auth/session-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthSessionProvider>
      <SceneProvider>
        <div className="relative z-10">
          {children}
        </div>
      </SceneProvider>
    </AuthSessionProvider>
  );
}
