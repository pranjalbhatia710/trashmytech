"use client";

import { cn } from "@/lib/utils";

type BackdropVariant = "hero" | "compare" | "report";

interface ImmersiveBackdropProps {
  className?: string;
  variant?: BackdropVariant;
}

const TINTS: Record<BackdropVariant, string> = {
  hero: "rgba(208, 107, 42, 0.06)",
  compare: "rgba(93, 139, 214, 0.06)",
  report: "rgba(105, 183, 121, 0.05)",
};

export function ImmersiveBackdrop({
  className,
  variant = "hero",
}: ImmersiveBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("fixed inset-0 z-[1] pointer-events-none", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(13,15,18,0) 0%, rgba(13,15,18,0.16) 45%, rgba(13,15,18,0.3) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 1px 0 ${TINTS[variant]}`,
        }}
      />
    </div>
  );
}
