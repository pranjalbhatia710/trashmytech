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
  /** When set, particles form this word then dissolve back to flow. */
  formWord?: string;
  /** When true, hold the word indefinitely until formWord is cleared. */
  holdWord?: boolean;
}

export default function NeuralBackground({
  className,
  color = "#e8a44a",
  trailOpacity = 0.02,
  particleCount = 350,
  speed = 0.6,
  intensity = 0.25,
  orbit = false,
  formWord = "",
  holdWord = false,
}: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intensityRef = useRef(intensity);
  const orbitRef = useRef(orbit);
  const formWordRef = useRef(formWord);
  const holdWordRef = useRef(holdWord);

  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  useEffect(() => { orbitRef.current = orbit; }, [orbit]);
  useEffect(() => { formWordRef.current = formWord; }, [formWord]);
  useEffect(() => { holdWordRef.current = holdWord; }, [holdWord]);

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
    let currentIntensity = intensityRef.current;

    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);

    // ── Particle types ──────────────────────────────────────
    interface Pt {
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      life: number; maxLife: number;
      size: number;
      trail: Array<{ x: number; y: number; z: number }>;
      trailLen: number;
      chain: number;
      chainPhase: number;
      // Text formation target (null = follow flow)
      tx: number | null; ty: number | null;
    }

    let particles: Pt[] = [];
    const CHAIN_COUNT = 12; // fewer chains = less visual noise

    const chainPhases: number[] = [];
    for (let i = 0; i < CHAIN_COUNT; i++) {
      chainPhases.push((i / CHAIN_COUNT) * Math.PI * 2);
    }

    // ── Text formation state ────────────────────────────────
    let activeWord = "";
    let formPhase: "idle" | "forming" | "holding" | "dissolving" = "idle";
    let formTimer = 0;
    const FORM_DURATION = 120;
    const HOLD_DURATION = 150;
    const DISSOLVE_DURATION = 90;

    function textToPositions(text: string, count: number): Array<{ x: number; y: number }> {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const offCtx = off.getContext("2d")!;

      let fontSize = Math.min((w * 0.75) / (text.length * 0.6), h * 0.3);
      fontSize = Math.max(fontSize, 60);
      offCtx.font = `900 ${fontSize}px "Inter", "SF Pro Display", "Helvetica Neue", sans-serif`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillStyle = "white";
      offCtx.fillText(text, w / 2, h * 0.42);

      const imageData = offCtx.getImageData(0, 0, w, h);
      const filled: Array<{ x: number; y: number }> = [];

      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const idx = (y * w + x) * 4;
          if (imageData.data[idx + 3] > 100) {
            filled.push({ x, y });
          }
        }
      }

      if (filled.length === 0) return [];

      const positions: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < count; i++) {
        positions.push(filled[Math.floor(Math.random() * filled.length)]);
      }
      return positions;
    }

    function assignTargets(word: string) {
      const positions = textToPositions(word, particles.length);
      if (positions.length === 0) return;

      const indices = Array.from({ length: particles.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[indices[i]];
        const pos = positions[i % positions.length];
        p.tx = pos.x;
        p.ty = pos.y;
      }
    }

    function clearTargets() {
      for (const p of particles) {
        p.tx = null;
        p.ty = null;
      }
    }

    // ── Flow field — gentler, more organic ──────────────────
    function flow(x: number, y: number, _z: number, t: number, k: number, chainPhase: number) {
      const freq = 0.0004; // lower freq = bigger, smoother curves
      const tScale = 0.08 * (1 + k * 0.5); // slower time evolution
      const angle1 = Math.sin(x * freq + t * tScale) * Math.PI * 0.8 +
        Math.cos(y * freq * 0.7 + t * tScale * 0.6) * Math.PI * 0.4 +
        chainPhase * 0.2;
      const angle2 = Math.cos(x * freq * 1.8 + y * freq * 1.2 + t * tScale * 0.9) * 0.3;
      const angle = angle1 + angle2 * (0.2 + k * 0.3);
      const mag = 0.3 + k * 0.4; // gentler force
      return {
        ax: Math.cos(angle) * mag,
        ay: Math.sin(angle) * mag,
        az: Math.sin(x * 0.0008 + y * 0.0008 + t * 0.05) * 0.05,
      };
    }

    function spawn(): Pt {
      const chain = Math.floor(Math.random() * CHAIN_COUNT);
      const trailLen = Math.floor(Math.random() * 12) + 8; // shorter trails
      const x = Math.random() * w;
      const y = Math.random() * h;
      const z = Math.random() * 200 - 100; // less z spread
      const f = flow(x, y, z, t, 0.3, chainPhases[chain]);
      return {
        x, y, z,
        vx: f.ax * 0.4 + (Math.random() - 0.5) * 0.02,
        vy: f.ay * 0.4 + (Math.random() - 0.5) * 0.02,
        vz: 0,
        life: 0,
        maxLife: Math.random() * 600 + 400, // longer lived = less respawn flicker
        size: Math.random() * 1.0 + 0.2, // smaller particles
        trail: [],
        trailLen,
        chain,
        chainPhase: chainPhases[chain],
        tx: null, ty: null,
      };
    }

    function proj(x: number, y: number, z: number) {
      const d = 800 / (800 + z + 100);
      return {
        sx: w * 0.5 + (x - w * 0.5) * d,
        sy: h * 0.5 + (y - h * 0.5) * d,
        s: d,
      };
    }

    let chainCenters: Array<{ x: number; y: number; z: number; count: number }> = [];

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      particles = [];
      const count = Math.min(particleCount, 600);
      for (let i = 0; i < count; i++) {
        const p = spawn();
        p.life = Math.random() * p.maxLife;
        for (let j = 0; j < Math.floor(p.trailLen * 0.3); j++) {
          p.trail.push({ x: p.x - p.vx * j * 0.5, y: p.y - p.vy * j * 0.5, z: p.z });
        }
        particles.push(p);
      }
    };

    function pAlpha(p: Pt, k: number) {
      const pct = p.life / p.maxLife;
      const fadeIn = Math.min(p.life / 50, 1); // slower fade in
      const fadeOut = pct > 0.85 ? (1 - pct) / 0.15 : 1;
      return fadeIn * fadeOut * (0.3 + k * 0.4); // overall dimmer
    }

    const render = () => {
      const target = intensityRef.current;
      currentIntensity += (target - currentIntensity) * 0.015; // slower transitions
      const k = currentIntensity;

      const frameSpeed = speed * (0.7 + k * 0.4);
      t += 0.004 * frameSpeed; // slower time

      // ── Check for formWord changes ─────────────────────
      const newWord = formWordRef.current;
      if (newWord && newWord !== activeWord) {
        activeWord = newWord;
        formPhase = "forming";
        formTimer = 0;
        assignTargets(newWord);
      } else if (!newWord && activeWord && formPhase !== "dissolving") {
        activeWord = "";
        formPhase = "dissolving";
        formTimer = 0;
      }

      // Advance formation timer
      if (formPhase === "forming") {
        formTimer++;
        if (formTimer >= FORM_DURATION) {
          formPhase = "holding";
          formTimer = 0;
        }
      } else if (formPhase === "holding") {
        formTimer++;
        if (!holdWordRef.current && formTimer >= HOLD_DURATION) {
          formPhase = "dissolving";
          formTimer = 0;
        }
      } else if (formPhase === "dissolving") {
        formTimer++;
        if (formTimer >= DISSOLVE_DURATION) {
          formPhase = "idle";
          formTimer = 0;
          activeWord = "";
          clearTargets();
        }
      }

      // Formation strength
      let formStrength = 0;
      if (formPhase === "forming") {
        const p = formTimer / FORM_DURATION;
        formStrength = p * p * (3 - 2 * p);
      } else if (formPhase === "holding") {
        formStrength = 1.0;
      } else if (formPhase === "dissolving") {
        formStrength = 1 - (formTimer / DISSOLVE_DURATION);
        formStrength = formStrength * formStrength;
      }

      // Fade trail — lower = longer trails = more visible
      ctx.fillStyle = `rgba(8, 9, 13, ${trailOpacity + 0.035})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const isOrbiting = orbitRef.current;

      // ── Compute chain centers ─────────────────
      chainCenters = [];
      for (let c = 0; c < CHAIN_COUNT; c++) {
        chainCenters.push({ x: 0, y: 0, z: 0, count: 0 });
      }
      for (const p of particles) {
        const cc = chainCenters[p.chain];
        cc.x += p.x;
        cc.y += p.y;
        cc.z += p.z;
        cc.count++;
      }
      for (const cc of chainCenters) {
        if (cc.count > 0) {
          cc.x /= cc.count;
          cc.y /= cc.count;
          cc.z /= cc.count;
        }
      }

      // ── Update particles ────────────────────────────────
      for (const p of particles) {
        p.trail.push({ x: p.x, y: p.y, z: p.z });
        if (p.trail.length > p.trailLen) p.trail.shift();

        // ── Text formation spring ──
        if (p.tx !== null && p.ty !== null && formStrength > 0.01) {
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;

          const spring = 0.05 * formStrength;
          p.vx += dx * spring;
          p.vy += dy * spring;
          p.vz += (0 - p.z) * 0.03 * formStrength;

          const formDamp = 0.85 + (1 - formStrength) * 0.11;
          p.vx *= formDamp;
          p.vy *= formDamp;
          p.vz *= formDamp;

          if (formPhase === "holding") {
            p.vx += (Math.random() - 0.5) * 0.04;
            p.vy += (Math.random() - 0.5) * 0.04;
          }
        } else {
          // ── Normal flow physics ──
          const f = flow(p.x, p.y, p.z, t, k, p.chainPhase);

          if (isOrbiting) {
            const dx0 = cx - p.x;
            const dy0 = cy - p.y;
            const distCenter = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
            const nx = dx0 / distCenter;
            const ny = dy0 / distCenter;
            const orbitSpeed = 0.5 + k * 0.3;
            p.vx += (-ny * orbitSpeed * 0.03 + f.ax * 0.03) * frameSpeed;
            p.vy += (nx * orbitSpeed * 0.03 + f.ay * 0.03) * frameSpeed;
            if (distCenter > Math.max(w, h) * 0.6) {
              p.vx += dx0 * 0.002;
              p.vy += dy0 * 0.002;
            }
          } else {
            const flowStr = 0.06 * frameSpeed * (0.6 + k * 0.3); // gentler flow
            p.vx += f.ax * flowStr;
            p.vy += f.ay * flowStr;
            p.vz += f.az * 0.03 * frameSpeed;

            // Gentle cohesion
            const cc = chainCenters[p.chain];
            if (cc.count > 1) {
              const dcx = cc.x - p.x;
              const dcy = cc.y - p.y;
              const cohesion = 0.0002 * (0.3 + k * 0.3);
              p.vx += dcx * cohesion;
              p.vy += dcy * cohesion;
            }

            // Soft boundary pull
            const dx0 = cx - p.x;
            const dy0 = cy - p.y;
            if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
              p.vx += dx0 * 0.001;
              p.vy += dy0 * 0.001;
            }
          }

          // Gentle mouse attraction
          if (mouse.active) {
            const { sx, sy } = proj(p.x, p.y, p.z);
            const dx = mouse.x - sx;
            const dy = mouse.y - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = 180 + k * 60;
            if (dist < radius) {
              const force = (radius - dist) / radius;
              p.vx += (dx / (dist + 1)) * force * (0.15 + k * 0.25);
              p.vy += (dy / (dist + 1)) * force * (0.15 + k * 0.25);
            }
          }

          const damp = 0.97; // slightly more damped
          p.vx *= damp;
          p.vy *= damp;
          p.vz *= 0.95;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.life++;
      }

      // Sort by z
      particles.sort((a, b) => a.z - b.z);

      // ── Draw trails (batched, subtler) ──────
      const bands = [0.08, 0.18, 0.35];
      for (let b = 0; b < bands.length; b++) {
        const loAlpha = b === 0 ? 0.01 : bands[b - 1];
        const hiAlpha = bands[b];
        const bandAlpha = (loAlpha + hiAlpha) * 0.5;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${bandAlpha * (0.2 + k * 0.25)})`;
        ctx.lineWidth = 0.2 + b * 0.15 + k * 0.1;
        ctx.beginPath();
        for (const p of particles) {
          const a = pAlpha(p, k);
          if (a < loAlpha || a >= hiAlpha || p.trail.length < 3) continue;
          const first = proj(p.trail[0].x, p.trail[0].y, p.trail[0].z);
          ctx.moveTo(first.sx, first.sy);
          for (let i = 1; i < p.trail.length; i++) {
            const pt = proj(p.trail[i].x, p.trail[i].y, p.trail[i].z);
            ctx.lineTo(pt.sx, pt.sy);
          }
          const head = proj(p.x, p.y, p.z);
          ctx.lineTo(head.sx, head.sy);
        }
        ctx.stroke();
      }

      // ── Chain connections — more subtle ──
      const chainBuckets: Map<number, number[]> = new Map();
      for (let i = 0; i < particles.length; i++) {
        const c = particles[i].chain;
        if (!chainBuckets.has(c)) chainBuckets.set(c, []);
        chainBuckets.get(c)!.push(i);
      }

      const chainDist = 120 + k * 50; // wider connection range
      const chainDistSq = chainDist * chainDist;
      const tierPaths: Array<{ alpha: number; lineWidth: number; segs: Array<[number, number, number, number]> }> = [
        { alpha: (0.06 + k * 0.05), lineWidth: 0.3 + k * 0.1, segs: [] },
        { alpha: (0.12 + k * 0.08), lineWidth: 0.5 + k * 0.15, segs: [] },
      ];

      for (const [, indices] of chainBuckets) {
        for (let ii = 0; ii < indices.length; ii++) {
          const pi = particles[indices[ii]];
          const ai = pAlpha(pi, k);
          if (ai < 0.04) continue;
          const pri = proj(pi.x, pi.y, pi.z);
          for (let jj = ii + 1; jj < Math.min(ii + 5, indices.length); jj++) {
            const pj = particles[indices[jj]];
            const aj = pAlpha(pj, k);
            if (aj < 0.04) continue;
            const prj = proj(pj.x, pj.y, pj.z);
            const dx = pri.sx - prj.sx;
            const dy = pri.sy - prj.sy;
            const d2 = dx * dx + dy * dy;
            if (d2 < chainDistSq) {
              const closeness = 1 - Math.sqrt(d2) / chainDist;
              const tier = closeness > 0.5 ? 1 : 0;
              tierPaths[tier].segs.push([pri.sx, pri.sy, prj.sx, prj.sy]);
            }
          }
        }
      }

      for (const tier of tierPaths) {
        if (tier.segs.length === 0) continue;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${tier.alpha})`;
        ctx.lineWidth = tier.lineWidth;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of tier.segs) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }

      // Cross-chain connections
      const crossDist = 50 + k * 20;
      const crossDistSq = crossDist * crossDist;
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.04 + k * 0.04})`;
      ctx.lineWidth = 0.15 + k * 0.08;
      ctx.beginPath();
      for (let i = 0; i < particles.length; i += 6) {
        const pi = particles[i];
        const ai = pAlpha(pi, k);
        if (ai < 0.06) continue;
        const pri = proj(pi.x, pi.y, pi.z);
        for (let j = i + 1; j < Math.min(i + 6, particles.length); j++) {
          const pj = particles[j];
          if (pj.chain === pi.chain) continue;
          const prj = proj(pj.x, pj.y, pj.z);
          const dx = pri.sx - prj.sx;
          const dy = pri.sy - prj.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 < crossDistSq) {
            ctx.moveTo(pri.sx, pri.sy);
            ctx.lineTo(prj.sx, prj.sy);
          }
        }
      }
      ctx.stroke();

      // ── Particle dots with glow ─────────────
      for (const p of particles) {
        const { sx, sy, s } = proj(p.x, p.y, p.z);
        const a = pAlpha(p, k);
        if (a < 0.03) continue;
        const r = Math.max(0.4, p.size * s * (0.6 + k * 0.4));
        // Glow halo
        const glowR = r * 3;
        const grad = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, glowR);
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.9})`);
        grad.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.25})`);
        grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fill();
        // Core dot
        ctx.fillStyle = `rgba(${Math.min(255, cr + 60)}, ${Math.min(255, cg + 40)}, ${Math.min(255, cb + 20)}, ${a * 0.95})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Respawn dead particles ──────────────────
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.tx !== null && formStrength > 0.3) continue;
        if (
          p.life > p.maxLife ||
          p.x < -100 || p.x > w + 100 ||
          p.y < -100 || p.y > h + 100 ||
          p.z < -200 || p.z > 300
        ) {
          particles[i] = spawn();
        }
      }

      raf = requestAnimationFrame(render);
    };

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
  }, [color, trailOpacity, particleCount, speed]);

  return (
    <div ref={containerRef} className={cn("relative w-full h-full overflow-hidden", className)} style={{ backgroundColor: "#08090d" }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
