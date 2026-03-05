"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  className?: string;
  color?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
  /** 0 = calm, 1 = intense. Changes live without remount. */
  intensity?: number;
  /** When true, particles swirl around center in orbit mode. */
  orbit?: boolean;
}

export default function NeuralBackground({
  className,
  color = "#e8a44a",
  trailOpacity: _t = 0.06,
  particleCount = 300,
  speed = 1.0,
  intensity = 0.5,
  orbit = false,
}: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(intensity);
  const orbitRef = useRef(orbit);

  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  useEffect(() => { orbitRef.current = orbit; }, [orbit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = container.clientWidth;
    let h = container.clientHeight;
    let raf: number;
    let t = 0;
    let mouse = { x: w * 0.5, y: h * 0.5, active: false };
    // Smooth intensity that lerps toward the target
    let currentIntensity = intensityRef.current;

    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);

    interface Pt {
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      life: number; maxLife: number;
      size: number;
    }

    let particles: Pt[] = [];

    function flow(x: number, y: number, z: number, t: number, k: number) {
      const turb = 1 + k * 1.5;
      // Very low frequencies = wide gentle currents, no clumping
      return {
        ax: (Math.sin(x * 0.0015 + t * 0.2 * turb) + Math.cos(y * 0.0012 + t * 0.15) * 0.5) * (0.4 + k * 0.5),
        ay: (Math.cos(y * 0.0015 - t * 0.18 * turb) + Math.sin(x * 0.002 + z * 0.003 + t * 0.12) * 0.4) * (0.4 + k * 0.5),
        az: Math.sin(z * 0.004 + t * 0.1 * turb) * (0.1 + k * 0.2),
      };
    }

    function spawn(): Pt {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 500 - 250,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        maxLife: Math.random() * 350 + 150,
        size: Math.random() * 1.2 + 0.3,
      };
    }

    function proj(p: Pt) {
      const d = 800 / (800 + p.z + 250);
      return {
        sx: w * 0.5 + (p.x - w * 0.5) * d,
        sy: h * 0.5 + (p.y - h * 0.5) * d,
        s: d,
      };
    }

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      particles = [];
      const count = Math.min(particleCount, 500);
      for (let i = 0; i < count; i++) {
        const p = spawn();
        p.life = Math.random() * p.maxLife;
        particles.push(p);
      }
    };

    const render = () => {
      // Smooth lerp toward target intensity
      const target = intensityRef.current;
      currentIntensity += (target - currentIntensity) * 0.02;
      const k = currentIntensity;

      // Speed scales with intensity
      const frameSpeed = speed * (0.6 + k * 1.0);
      t += 0.008 * frameSpeed;

      ctx.clearRect(0, 0, w, h);

      const connDist = 80 + k * 40;

      // Update particles
      const cx = w * 0.5;
      const cy = h * 0.5;
      const isOrbiting = orbitRef.current;
      // Smooth orbit blend
      const orbitStrength = isOrbiting ? Math.min(k + 0.3, 1) : 0;

      for (const p of particles) {
        const f = flow(p.x, p.y, p.z, t, k);
        const flowMul = isOrbiting ? 0.08 : 0.2;
        p.vx = (p.vx + f.ax * flowMul * frameSpeed) * (0.94 + k * 0.03);
        p.vy = (p.vy + f.ay * flowMul * frameSpeed) * (0.94 + k * 0.03);
        p.vz = (p.vz + f.az * 0.1 * frameSpeed) * (0.94 + k * 0.03);

        const dx0 = cx - p.x;
        const dy0 = cy - p.y;
        const distCenter = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
        const maxR = Math.min(w, h) * 0.45;

        if (isOrbiting) {
          // Swirl around center but across the full screen
          const nx = dx0 / distCenter;
          const ny = dy0 / distCenter;
          const tx = -ny;
          const ty = nx;
          const orbitSpeed = 0.6 + k * 0.4;
          p.vx += tx * orbitSpeed * 0.03 * orbitStrength;
          p.vy += ty * orbitSpeed * 0.03 * orbitStrength;
          // Only pull back if way off screen
          if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
            p.vx += dx0 * 0.003;
            p.vy += dy0 * 0.003;
          }
        } else {
          // Normal: only correct if drifting off screen
          if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
            p.vx += dx0 * 0.001;
            p.vy += dy0 * 0.001;
          }
        }

        // Mouse interaction
        if (mouse.active) {
          const { sx, sy } = proj(p);
          const dx = mouse.x - sx;
          const dy = mouse.y - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 + k * 80) {
            const force = (180 + k * 80 - dist) / (180 + k * 80);
            p.vx += (dx / (dist + 1)) * force * (0.3 + k * 0.5);
            p.vy += (dy / (dist + 1)) * force * (0.3 + k * 0.5);
          }
        }

        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.life++;
      }

      particles.sort((a, b) => a.z - b.z);

      // Connection lines — thicker and brighter at high intensity
      const lineAlphaScale = 0.15 + k * 0.25;
      ctx.lineWidth = 0.3 + k * 0.4;
      for (let i = 0; i < particles.length; i++) {
        const pi = proj(particles[i]);
        const ai = pAlpha(particles[i], k);
        if (ai < 0.05) continue;
        for (let j = i + 1; j < Math.min(i + 12, particles.length); j++) {
          const pj = proj(particles[j]);
          const dx = pi.sx - pj.sx;
          const dy = pi.sy - pj.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 < connDist * connDist) {
            const aj = pAlpha(particles[j], k);
            const a = (1 - Math.sqrt(d2) / connDist) * Math.min(ai, aj) * lineAlphaScale;
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${a})`;
            ctx.beginPath();
            ctx.moveTo(pi.sx, pi.sy);
            ctx.lineTo(pj.sx, pj.sy);
            ctx.stroke();
          }
        }
      }

      // Draw dots — size scales with intensity
      for (const p of particles) {
        const { sx, sy, s } = proj(p);
        const a = pAlpha(p, k);
        if (a < 0.01) continue;

        const r = Math.max(0.4, p.size * s * (0.8 + k * 0.6));
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      // Respawn
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (
          p.life > p.maxLife ||
          p.x < -150 || p.x > w + 150 ||
          p.y < -150 || p.y > h + 150 ||
          p.z < -350 || p.z > 400
        ) {
          particles[i] = spawn();
        }
      }

      raf = requestAnimationFrame(render);
    };

    function pAlpha(p: Pt, k: number) {
      const pct = p.life / p.maxLife;
      const base = Math.min(p.life / 15, 1) * (pct > 0.8 ? (1 - pct) / 0.2 : 1);
      return base * (0.5 + k * 0.5);
    }

    const onResize = () => { w = container.clientWidth; h = container.clientHeight; init(); };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; };

    init();
    render();

    window.addEventListener("resize", onResize);
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [color, _t, particleCount, speed]);

  return (
    <div ref={containerRef} className={cn("relative w-full h-full overflow-hidden", className)} style={{ backgroundColor: "#0a0a0c" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
