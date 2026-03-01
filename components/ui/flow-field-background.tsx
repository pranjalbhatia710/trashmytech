"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  className?: string;
  color?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
}

export default function NeuralBackground({
  className,
  color = "#e8a44a",
  trailOpacity = 0.08,
  particleCount = 600,
  speed = 0.8,
}: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    let particles: Particle[] = [];
    let animationFrameId: number;
    let mouse = { x: -1000, y: -1000 };
    let time = 0;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      age: number;
      life: number;
      size: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        this.life = Math.random() * 300 + 150;
        this.size = Math.random() * 1.5 + 0.5;
      }

      update() {
        const scale1 = 0.003;
        const scale2 = 0.008;
        const angle1 = (Math.cos(this.x * scale1 + time * 0.2) + Math.sin(this.y * scale1 + time * 0.15)) * Math.PI;
        const angle2 = (Math.sin(this.x * scale2 - time * 0.1) + Math.cos(this.y * scale2 + time * 0.12)) * Math.PI * 0.5;
        const angle = angle1 + angle2 * 0.3;

        this.vx += Math.cos(angle) * 0.15 * speed;
        this.vy += Math.sin(angle) * 0.15 * speed;

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const interactionRadius = 180;

        if (distance < interactionRadius) {
          const force = (interactionRadius - distance) / interactionRadius;
          this.vx -= dx * force * 0.03;
          this.vy -= dy * force * 0.03;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.96;
        this.vy *= 0.96;

        this.age++;
        if (this.age > this.life) this.reset();

        if (this.x < -10) this.x = width + 10;
        if (this.x > width + 10) this.x = -10;
        if (this.y < -10) this.y = height + 10;
        if (this.y > height + 10) this.y = -10;
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        this.life = Math.random() * 300 + 150;
      }

      draw(context: CanvasRenderingContext2D) {
        const alpha = 1 - Math.abs((this.age / this.life) - 0.5) * 2;
        context.globalAlpha = Math.max(0, alpha * 0.8);
        context.fillStyle = color;
        context.fillRect(this.x, this.y, this.size, this.size);
      }
    }

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      time += 0.01;
      ctx.fillStyle = `rgba(10, 10, 12, ${trailOpacity})`;
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p) => {
        p.update();
        p.draw(ctx);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      init();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    init();
    animate();

    window.addEventListener("resize", handleResize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color, trailOpacity, particleCount, speed]);

  return (
    <div ref={containerRef} className={cn("relative w-full h-full overflow-hidden", className)} style={{ backgroundColor: "#0a0a0c" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
