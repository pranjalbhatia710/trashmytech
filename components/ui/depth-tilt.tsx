"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface DepthTiltProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  maxTilt?: number;
  perspective?: number;
  lift?: number;
  glareOpacity?: number;
  travel?: number;
  reflect?: boolean;
  reflectionTint?: string;
  shadowOpacity?: number;
  contentClassName?: string;
}

export const DepthTilt = React.forwardRef<HTMLDivElement, DepthTiltProps>(
  (
    {
      children,
      className,
      contentClassName,
      maxTilt,
      perspective,
      lift,
      glareOpacity,
      travel,
      reflect,
      reflectionTint,
      shadowOpacity,
      transition,
      style,
      ...props
    },
    ref
  ) => {
    void maxTilt;
    void perspective;
    void lift;
    void glareOpacity;
    void travel;
    void reflect;
    void reflectionTint;
    void shadowOpacity;

    return (
      <motion.div
        ref={ref}
        className={cn("relative", className)}
        transition={transition ?? { duration: 0.16 }}
        style={style}
        {...props}
      >
        <div className={cn("relative", contentClassName)}>{children}</div>
      </motion.div>
    );
  }
);

DepthTilt.displayName = "DepthTilt";
