"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useScene } from "./SceneContext";

const sphereVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDistortion;
  uniform float uScore;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simple noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
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
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
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
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normal;
    vPosition = position;

    float n = snoise(position * 1.5 + uTime * 0.3) * uDistortion;
    float n2 = snoise(position * 3.0 + uTime * 0.5) * uDistortion * 0.3;
    vDisplacement = n + n2;

    vec3 newPos = position + normal * (n + n2);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

const sphereFragmentShader = /* glsl */ `
  uniform vec3 uColorLow;
  uniform vec3 uColorMid;
  uniform vec3 uColorHigh;
  uniform float uScore;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    // Fresnel rim glow
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);

    // Score-based color
    float s = uScore / 100.0;
    vec3 baseColor;
    if (s < 0.5) {
      baseColor = mix(uColorLow, uColorMid, s * 2.0);
    } else {
      baseColor = mix(uColorMid, uColorHigh, (s - 0.5) * 2.0);
    }

    // Add displacement color variation
    vec3 color = baseColor + vDisplacement * 0.3;

    // Fresnel brightens the rim
    color += fresnel * baseColor * 1.5;

    // Inner glow pulse
    float pulse = sin(uTime * 1.5) * 0.1 + 0.9;
    color *= pulse;

    float alpha = (0.7 + fresnel * 0.5) * uOpacity;

    gl_FragColor = vec4(color, alpha);
  }
`;

export function ScoreSphere() {
  const { phase, score } = useScene();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const scaleRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDistortion: { value: 0.15 },
      uScore: { value: 0 },
      uOpacity: { value: 0 },
      uColorLow: { value: new THREE.Color("#ef4444") },   // red (bad)
      uColorMid: { value: new THREE.Color("#eab308") },   // yellow (mid)
      uColorHigh: { value: new THREE.Color("#22c55e") },   // green (good)
    }),
    []
  );

  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;

    uniforms.uTime.value += delta;

    // Animate appearance
    const targetScale = phase === "done" ? 1 : 0;
    scaleRef.current += (targetScale - scaleRef.current) * 0.04;
    const s = scaleRef.current;
    meshRef.current.scale.set(s, s, s);

    // Animate score
    uniforms.uScore.value += (score - uniforms.uScore.value) * 0.03;
    uniforms.uOpacity.value += (targetScale - uniforms.uOpacity.value) * 0.05;

    // Slow rotation
    meshRef.current.rotation.y += delta * 0.15;
    meshRef.current.rotation.x = Math.sin(uniforms.uTime.value * 0.2) * 0.1;

    // Mouse-based subtle rotation
    const mx = state.pointer.x * 0.3;
    const my = state.pointer.y * 0.2;
    meshRef.current.rotation.y += mx * delta;
    meshRef.current.rotation.x += my * delta;
  });

  return (
    <mesh ref={meshRef} position={[0, 1, -5]}>
      <icosahedronGeometry args={[2.2, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={sphereVertexShader}
        fragmentShader={sphereFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
