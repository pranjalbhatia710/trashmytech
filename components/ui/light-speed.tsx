"use client";

import React, { useEffect, useRef, useState } from "react";

const DEFAULT_FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
#define FC gl_FragCoord.xy
#define R  resolution
#define T  time
#define hue(a) (.6+.6*cos(6.3*(a)+vec3(0,83,21)))
float rnd(float a) {
  vec2 p = fract(a * vec2(12.9898, 78.233));
  p += dot(p, p*345.);
  return fract(p.x * p.y);
}
vec3 pattern(vec2 uv) {
  vec3 col = vec3(0.);
  for (float i=.0; i++<20.;) {
    float a = rnd(i);
    vec2 n = vec2(a, fract(a*34.56));
    vec2 p = sin(n*(T+7.) + T*.5);
    float d = dot(uv-p, uv-p);
    col += .00125/d * hue(dot(uv,uv) + i*.125 + T);
  }
  return col;
}
void main(void) {
  vec2 uv = (FC - .5 * R) / min(R.x, R.y);
  vec3 col = vec3(0.);
  float s = 2.4;
  float a = atan(uv.x, uv.y);
  float b = length(uv);
  uv = vec2(a * 5. / 6.28318, .05 / tan(b) + T);
  uv = fract(uv) - .5;
  col += pattern(uv * s);
  O = vec4(col, 1.);
}`;

const DEFAULT_VERT = `#version 300 es
precision highp float;
in vec2 position;
void main(){
  gl_Position = vec4(position, 0.0, 1.0);
}`;

type Props = {
  className?: string;
  paused?: boolean;
  speed?: number;
  fragmentSource?: string;
  onShaderError?: (err: string) => void;
};

function LightSpeed({
  className = "relative w-screen h-screen bg-black overflow-hidden",
  paused = false,
  speed = 1,
  fragmentSource = DEFAULT_FRAG,
  onShaderError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const buffersRef = useRef<{ vbo: WebGLBuffer | null }>({ vbo: null });
  const uniformsRef = useRef<{ time?: WebGLUniformLocation; resolution?: WebGLUniformLocation }>({});
  const rafRef = useRef<number>(0);
  const [webglOk, setWebglOk] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) { setWebglOk(false); return; }
    setWebglOk(true);
    glRef.current = gl;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh) || "Shader compile error";
        gl.deleteShader(sh);
        throw new Error(info);
      }
      return sh;
    };
    const link = (vs: WebGLShader, fs: WebGLShader) => {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(prog) || "Program link error";
        gl.deleteProgram(prog);
        throw new Error(info);
      }
      return prog;
    };

    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let prog: WebGLProgram | null = null;
    try {
      vs = compile(gl.VERTEX_SHADER, DEFAULT_VERT);
      fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      prog = link(vs, fs);
    } catch (err: unknown) {
      onShaderError?.(String(err));
      if (fragmentSource !== DEFAULT_FRAG) {
        try {
          fs = compile(gl.FRAGMENT_SHADER, DEFAULT_FRAG);
          prog = link(vs!, fs);
        } catch (err2: unknown) {
          onShaderError?.(String(err2));
          setWebglOk(false);
          return;
        }
      } else { setWebglOk(false); return; }
    }

    programRef.current = prog;
    gl.useProgram(prog);
    const vbo = gl.createBuffer();
    buffersRef.current.vbo = vbo;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    uniformsRef.current.time = gl.getUniformLocation(prog, "time")!;
    uniformsRef.current.resolution = gl.getUniformLocation(prog, "resolution")!;

    const resize = () => {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniformsRef.current.resolution!, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const start = performance.now();
    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (paused) return;
      const now = (t - start) * 0.001 * (speed || 1);
      gl.useProgram(programRef.current);
      gl.uniform1f(uniformsRef.current.time!, now);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (gl && programRef.current) {
        (gl.getAttachedShaders(programRef.current) || []).forEach(s => gl.deleteShader(s));
        gl.deleteProgram(programRef.current);
      }
      if (gl && buffersRef.current.vbo) gl.deleteBuffer(buffersRef.current.vbo);
    };
  }, [fragmentSource, paused, speed, onShaderError]);

  return (
    <div className={className}>
      {!webglOk && (
        <div className="absolute inset-0 grid place-items-center text-center text-neutral-200">
          <p className="text-sm opacity-80">WebGL 2.0 not supported</p>
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </div>
  );
}

export { LightSpeed };
