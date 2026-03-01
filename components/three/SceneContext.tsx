"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Phase = "idle" | "connecting" | "crawling" | "swarming" | "reporting" | "done";
export type QualityTier = "high" | "medium" | "low";

interface SceneState {
  phase: Phase;
  score: number;
  scrollProgress: number; // 0-1
  sectionMood: "neutral" | "positive" | "negative" | "alert";
  agentCount: number;
  agentsComplete: number;
}

interface SceneContextValue extends SceneState {
  setPhase: (p: Phase) => void;
  setScore: (s: number) => void;
  setScrollProgress: (p: number) => void;
  setSectionMood: (m: SceneState["sectionMood"]) => void;
  setAgentProgress: (count: number, complete: number) => void;
  qualityTier: QualityTier;
  setQualityTier: (t: QualityTier) => void;
}

const SceneContext = createContext<SceneContextValue | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sectionMood, setSectionMood] = useState<SceneState["sectionMood"]>("neutral");
  const [agentCount, setAgentCount] = useState(0);
  const [agentsComplete, setAgentsComplete] = useState(0);
  const [qualityTier, setQualityTier] = useState<QualityTier>("high");

  const setAgentProgress = useCallback((count: number, complete: number) => {
    setAgentCount(count);
    setAgentsComplete(complete);
  }, []);

  return (
    <SceneContext.Provider
      value={{
        phase, setPhase,
        score, setScore,
        scrollProgress, setScrollProgress,
        sectionMood, setSectionMood,
        agentCount, agentsComplete, setAgentProgress,
        qualityTier, setQualityTier,
      }}
    >
      {children}
    </SceneContext.Provider>
  );
}

export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error("useScene must be used within SceneProvider");
  return ctx;
}
