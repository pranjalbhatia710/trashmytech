"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useScene } from "./SceneContext";
import { getParticleCount } from "./PerformanceMonitor";

// ── Simplex 3D noise (compact) ──────────────────────────────────
const GRAD3 = new Float32Array([
  1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
  1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
  0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1,
]);
const PERM = new Uint8Array(512);
{
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 256; i++) { PERM[i] = p[i]; PERM[i + 256] = p[i]; }
}

function noise3D(x: number, y: number, z: number): number {
  const F3 = 1/3, G3 = 1/6;
  const s = (x+y+z)*F3;
  const i = Math.floor(x+s), j = Math.floor(y+s), k = Math.floor(z+s);
  const t = (i+j+k)*G3;
  const X0 = i-t, Y0 = j-t, Z0 = k-t;
  const x0 = x-X0, y0 = y-Y0, z0 = z-Z0;
  let i1,j1,k1,i2,j2,k2;
  if(x0>=y0){if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0}else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1}else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1}}else{if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1}else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1}else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0}}
  const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3;
  const x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3;
  const x3=x0-0.5,y3=y0-0.5,z3=z0-0.5;
  const ii=i&255,jj=j&255,kk=k&255;
  let n=0;
  let t0=0.6-x0*x0-y0*y0-z0*z0;
  if(t0>0){t0*=t0;const gi=(PERM[ii+PERM[jj+PERM[kk]]]%12)*3;n+=t0*t0*(GRAD3[gi]*x0+GRAD3[gi+1]*y0+GRAD3[gi+2]*z0)}
  let t1=0.6-x1*x1-y1*y1-z1*z1;
  if(t1>0){t1*=t1;const gi=(PERM[ii+i1+PERM[jj+j1+PERM[kk+k1]]]%12)*3;n+=t1*t1*(GRAD3[gi]*x1+GRAD3[gi+1]*y1+GRAD3[gi+2]*z1)}
  let t2=0.6-x2*x2-y2*y2-z2*z2;
  if(t2>0){t2*=t2;const gi=(PERM[ii+i2+PERM[jj+j2+PERM[kk+k2]]]%12)*3;n+=t2*t2*(GRAD3[gi]*x2+GRAD3[gi+1]*y2+GRAD3[gi+2]*z2)}
  let t3=0.6-x3*x3-y3*y3-z3*z3;
  if(t3>0){t3*=t3;const gi=(PERM[ii+1+PERM[jj+1+PERM[kk+1]]]%12)*3;n+=t3*t3*(GRAD3[gi]*x3+GRAD3[gi+1]*y3+GRAD3[gi+2]*z3)}
  return 32*n;
}

// ── Shaders ─────────────────────────────────────────────────────
const vertexShader = /* glsl */ `
  attribute float aOpacity;
  attribute float aSize;
  varying float vOpacity;
  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    vOpacity = aOpacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (80.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 12.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vOpacity;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uTime;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, d) * vOpacity;
    vec3 color = mix(uColor, uColor2, sin(uTime * 0.3) * 0.5 + 0.5);
    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Component ───────────────────────────────────────────────────
export function ParticleField() {
  const { phase, qualityTier, sectionMood } = useScene();
  const { viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);

  const count = getParticleCount(qualityTier);
  const SPREAD = 25;
  const DEPTH = 15;

  // Initialize particle data
  const { positions, velocities, opacities, sizes, basePositions } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const sizes = new Float32Array(count);
    const basePositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * SPREAD * 2;
      const y = (Math.random() - 0.5) * SPREAD * 2;
      const z = (Math.random() - 0.5) * DEPTH * 2;
      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      basePositions[i3] = x;
      basePositions[i3 + 1] = y;
      basePositions[i3 + 2] = z;
      velocities[i3] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0;
      opacities[i] = Math.random() * 0.4 + 0.1;
      sizes[i] = Math.random() * 2 + 0.5;
    }
    return { positions, velocities, opacities, sizes, basePositions };
  }, [count]);

  // Mouse tracking
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Phase-based speed multiplier
  const getSpeed = () => {
    switch (phase) {
      case "swarming": return 1.8;
      case "reporting": return 0.6;
      case "done": return 0.4;
      default: return 1.0;
    }
  };

  // Update particles each frame
  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const opArr = (geo.attributes.aOpacity as THREE.BufferAttribute).array as Float32Array;

    timeRef.current += delta;
    const t = timeRef.current;
    const speed = getSpeed();
    const noiseScale = 0.03;
    const mouseX = mouseRef.current.x * viewport.width * 0.5;
    const mouseY = mouseRef.current.y * viewport.height * 0.5;

    // Convergence for reporting phase
    const converge = phase === "reporting" ? 0.3 : 0;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Noise-based flow field
      const nx = posArr[i3] * noiseScale;
      const ny = posArr[i3 + 1] * noiseScale;
      const nz = posArr[i3 + 2] * noiseScale + t * 0.05;
      const angle = noise3D(nx, ny, nz) * Math.PI * 2;
      const angle2 = noise3D(nx + 100, ny + 100, nz) * Math.PI * 2;

      velocities[i3] += Math.cos(angle) * 0.015 * speed;
      velocities[i3 + 1] += Math.sin(angle) * 0.015 * speed;
      velocities[i3 + 2] += Math.sin(angle2) * 0.008 * speed;

      // Mouse repulsion
      const dx = posArr[i3] - mouseX;
      const dy = posArr[i3 + 1] - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4) {
        const force = (4 - dist) / 4 * 0.08;
        velocities[i3] += (dx / dist) * force;
        velocities[i3 + 1] += (dy / dist) * force;
      }

      // Convergence pull toward center
      if (converge > 0) {
        velocities[i3] -= posArr[i3] * converge * 0.01;
        velocities[i3 + 1] -= posArr[i3 + 1] * converge * 0.01;
        velocities[i3 + 2] -= posArr[i3 + 2] * converge * 0.01;
      }

      // Apply velocity with damping
      velocities[i3] *= 0.94;
      velocities[i3 + 1] *= 0.94;
      velocities[i3 + 2] *= 0.94;
      posArr[i3] += velocities[i3];
      posArr[i3 + 1] += velocities[i3 + 1];
      posArr[i3 + 2] += velocities[i3 + 2];

      // Wrap edges
      if (posArr[i3] > SPREAD) posArr[i3] = -SPREAD;
      if (posArr[i3] < -SPREAD) posArr[i3] = SPREAD;
      if (posArr[i3 + 1] > SPREAD) posArr[i3 + 1] = -SPREAD;
      if (posArr[i3 + 1] < -SPREAD) posArr[i3 + 1] = SPREAD;
      if (posArr[i3 + 2] > DEPTH) posArr[i3 + 2] = -DEPTH;
      if (posArr[i3 + 2] < -DEPTH) posArr[i3 + 2] = DEPTH;

      // Breathing opacity
      opArr[i] = opacities[i] * (0.7 + 0.3 * Math.sin(t * 0.5 + i * 0.1));
    }

    posAttr.needsUpdate = true;
    (geo.attributes.aOpacity as THREE.BufferAttribute).needsUpdate = true;

    // Update uniforms
    const mat = pointsRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = t;
  });

  // Color based on mood
  const primaryColor = useMemo(() => {
    switch (sectionMood) {
      case "positive": return new THREE.Color("#22c55e");
      case "negative": return new THREE.Color("#ef4444");
      case "alert": return new THREE.Color("#eab308");
      default: return new THREE.Color("#ef4444");
    }
  }, [sectionMood]);

  const secondaryColor = useMemo(() => new THREE.Color("#3b82f6"), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: primaryColor },
      uColor2: { value: secondaryColor },
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
    }),
    [primaryColor, secondaryColor]
  );

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aOpacity"
          args={[opacities, 1]}
          count={count}
          array={opacities}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aSize"
          args={[sizes, 1]}
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
