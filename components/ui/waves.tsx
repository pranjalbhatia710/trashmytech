"use client";

import React, { useEffect, useRef } from "react";

interface WavesProps {
  lineColor?: string;
  backgroundColor?: string;
  waveSpeedX?: number;
  waveSpeedY?: number;
  waveAmpX?: number;
  waveAmpY?: number;
  friction?: number;
  tension?: number;
  maxCursorMove?: number;
  xGap?: number;
  yGap?: number;
  className?: string;
}

// ── WebGL 3D wave shader ──────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Full-screen fragment shader: 3D perspective grid waves with simplex noise,
// mouse-reactive ripples, depth fog, and glow.
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uMouse;       // normalised 0-1
uniform float uWaveSpeedX;
uniform float uWaveSpeedY;
uniform float uWaveAmpX;
uniform float uWaveAmpY;
uniform float uTension;
uniform float uMaxCursor;
uniform float uXGap;
uniform float uYGap;
uniform vec3  uLineColor;
uniform vec3  uBgColor;

// ── Simplex 3D noise (Ashima Arts) ──
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x  = x_*ns.x + ns.yyyy;
  vec4 y  = y_*ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// ── 3D perspective projection ──
vec2 project(vec3 p, vec2 res) {
  float fov = 1.8;
  float zOff = 3.0;
  float perspective = fov / (p.z + zOff);
  return vec2(p.x * perspective, p.y * perspective) * res.y * 0.5 + res * 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy;
  vec2 res = uResolution;
  float t = uTime;

  // Background
  vec3 col = uBgColor;

  // Camera tilt — looking down at the wave grid
  float camTiltX = (uMouse.x - 0.5) * 0.3;
  float camTiltY = (uMouse.y - 0.5) * 0.15;

  float totalAlpha = 0.0;

  // Draw horizontal wave lines in 3D
  float rowCount = 48.0;
  float colCount = 140.0;

  for (float row = 0.0; row < rowCount; row += 1.0) {
    float rowT = row / rowCount;
    // Z goes from far to near
    float z = mix(6.0, -0.5, rowT);
    // Depth fog
    float depthFade = smoothstep(6.0, 0.0, z) * smoothstep(-0.5, 0.8, z);
    // Y position on "floor plane"
    float baseY = -0.8 + rowT * 0.3;

    float prevScreenX = -1.0;
    float prevScreenY = -1.0;

    for (float c = 0.0; c < colCount; c += 1.0) {
      float colT = c / colCount;
      float baseX = (colT - 0.5) * 4.5;

      // Noise displacement
      float nx = snoise(vec3(baseX * 0.4 + t * uWaveSpeedX, z * 0.3, t * 0.15));
      float ny = snoise(vec3(baseX * 0.3, z * 0.4 + t * uWaveSpeedY, t * 0.12));
      float nz = snoise(vec3(baseX * 0.2, z * 0.2, t * 0.1));

      float dx = nx * uWaveAmpX * 0.015;
      float dy = ny * uWaveAmpY * 0.025;
      float dz = nz * 0.3;

      vec3 p = vec3(
        baseX + dx + camTiltX * z * 0.3,
        baseY + dy + camTiltY * z * 0.2,
        z + dz
      );

      // Project to screen
      vec2 screenPos = project(p, res);

      // Mouse repulsion in screen space
      vec2 mouseScreen = uMouse * res;
      vec2 diff = screenPos - mouseScreen;
      float dist = length(diff);
      float cursorRadius = uMaxCursor * res.y * 0.001;
      if (dist < cursorRadius && dist > 0.0) {
        float force = (1.0 - dist / cursorRadius);
        force = force * force * uTension * 40.0;
        screenPos += normalize(diff) * force * cursorRadius;
      }

      // Draw line segment
      if (c > 0.0) {
        vec2 segDir = screenPos - vec2(prevScreenX, prevScreenY);
        float segLen = length(segDir);
        if (segLen > 0.1 && segLen < res.x * 0.5) {
          vec2 segNorm = vec2(-segDir.y, segDir.x) / segLen;
          vec2 toPixel = uv - vec2(prevScreenX, prevScreenY);
          float along = dot(toPixel, segDir) / segLen;
          float perp = abs(dot(toPixel, segNorm));

          if (along >= 0.0 && along <= segLen) {
            // Line thickness varies with depth (thicker = closer)
            float thickness = mix(0.4, 2.0, depthFade);
            // Core line
            float line = smoothstep(thickness + 0.8, thickness, perp);
            // Glow
            float glow = smoothstep(thickness + 12.0, thickness, perp) * 0.15;

            float alpha = (line + glow) * depthFade;
            totalAlpha += alpha;
          }
        }
      }

      prevScreenX = screenPos.x;
      prevScreenY = screenPos.y;
    }
  }

  // Draw vertical cross-lines (sparser, for grid depth effect)
  float vColCount = 40.0;
  for (float vc = 0.0; vc < vColCount; vc += 1.0) {
    float colT = vc / vColCount;
    float baseX = (colT - 0.5) * 4.5;

    float prevSX = -1.0, prevSY = -1.0;
    float vRowCount = 20.0;
    for (float vr = 0.0; vr < vRowCount; vr += 1.0) {
      float rowT2 = vr / vRowCount;
      float z2 = mix(6.0, -0.5, rowT2);
      float baseY2 = -0.8 + rowT2 * 0.3;
      float depthFade2 = smoothstep(6.0, 0.0, z2) * smoothstep(-0.5, 0.8, z2);

      float nx2 = snoise(vec3(baseX * 0.4 + uTime * uWaveSpeedX, z2 * 0.3, uTime * 0.15));
      float ny2 = snoise(vec3(baseX * 0.3, z2 * 0.4 + uTime * uWaveSpeedY, uTime * 0.12));
      float nz2 = snoise(vec3(baseX * 0.2, z2 * 0.2, uTime * 0.1));

      vec3 p2 = vec3(
        baseX + nx2 * uWaveAmpX * 0.015 + camTiltX * z2 * 0.3,
        baseY2 + ny2 * uWaveAmpY * 0.025 + camTiltY * z2 * 0.2,
        z2 + nz2 * 0.3
      );
      vec2 sp2 = project(p2, res);

      if (vr > 0.0) {
        vec2 sd = sp2 - vec2(prevSX, prevSY);
        float sl = length(sd);
        if (sl > 0.1 && sl < res.y * 0.8) {
          vec2 sn2 = vec2(-sd.y, sd.x) / sl;
          vec2 tp = uv - vec2(prevSX, prevSY);
          float al2 = dot(tp, sd) / sl;
          float pp2 = abs(dot(tp, sn2));
          if (al2 >= 0.0 && al2 <= sl) {
            float th2 = mix(0.3, 1.2, depthFade2);
            float ln2 = smoothstep(th2 + 0.6, th2, pp2) * 0.5;
            float gl2 = smoothstep(th2 + 8.0, th2, pp2) * 0.08;
            totalAlpha += (ln2 + gl2) * depthFade2;
          }
        }
      }
      prevSX = sp2.x; prevSY = sp2.y;
    }
  }

  totalAlpha = clamp(totalAlpha, 0.0, 1.0);
  col = mix(col, uLineColor, totalAlpha);

  // Subtle vignette
  vec2 vUv = gl_FragCoord.xy / res;
  float vig = 1.0 - smoothstep(0.3, 1.2, length(vUv - 0.5) * 1.4);
  col *= mix(0.6, 1.0, vig);

  fragColor = vec4(col, totalAlpha * 0.85);
}`;

function parseColor(c: string): [number, number, number] {
  // Handle "rgba(r, g, b, a)" or "#rrggbb" or named
  if (c.startsWith("rgba")) {
    const m = c.match(/[\d.]+/g);
    if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
  }
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
  }
  return [0.94, 0.27, 0.27]; // default red
}

export function Waves({
  lineColor = "rgba(239, 68, 68, 0.15)",
  backgroundColor = "transparent",
  waveSpeedX = 0.012,
  waveSpeedY = 0.008,
  waveAmpX = 40,
  waveAmpY = 15,
  friction: _friction = 0.925,
  tension = 0.005,
  maxCursorMove = 100,
  xGap = 12,
  yGap = 36,
  className = "",
}: WavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const mouseTarget = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) return; // fallback: nothing renders, graceful

    // Compile shader
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("Waves shader error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("Waves link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uRes = gl.getUniformLocation(prog, "uResolution");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouseLoc = gl.getUniformLocation(prog, "uMouse");
    const uWSX = gl.getUniformLocation(prog, "uWaveSpeedX");
    const uWSY = gl.getUniformLocation(prog, "uWaveSpeedY");
    const uWAX = gl.getUniformLocation(prog, "uWaveAmpX");
    const uWAY = gl.getUniformLocation(prog, "uWaveAmpY");
    const uTen = gl.getUniformLocation(prog, "uTension");
    const uMaxC = gl.getUniformLocation(prog, "uMaxCursor");
    const uXG = gl.getUniformLocation(prog, "uXGap");
    const uYG = gl.getUniformLocation(prog, "uYGap");
    const uLC = gl.getUniformLocation(prog, "uLineColor");
    const uBC = gl.getUniformLocation(prog, "uBgColor");

    const lc = parseColor(lineColor);
    const bc = backgroundColor === "transparent" ? [0.031, 0.035, 0.051] : parseColor(backgroundColor);

    gl.uniform1f(uWSX, waveSpeedX);
    gl.uniform1f(uWSY, waveSpeedY);
    gl.uniform1f(uWAX, waveAmpX);
    gl.uniform1f(uWAY, waveAmpY);
    gl.uniform1f(uTen, tension);
    gl.uniform1f(uMaxC, maxCursorMove);
    gl.uniform1f(uXG, xGap);
    gl.uniform1f(uYG, yGap);
    gl.uniform3fv(uLC, lc);
    gl.uniform3fv(uBC, bc as number[]);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseTarget.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener("mousemove", onMouse);

    const start = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const t = (now - start) * 0.001;

      // Smooth mouse
      mouseRef.current.x += (mouseTarget.current.x - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseTarget.current.y - mouseRef.current.y) * 0.08;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouseLoc, mouseRef.current.x, mouseRef.current.y);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouse);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [lineColor, backgroundColor, waveSpeedX, waveSpeedY, waveAmpX, waveAmpY, tension, maxCursorMove, xGap, yGap]);

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} style={{ pointerEvents: "none" }} />;
}
