"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const gridVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Subtle wave displacement
    float wave = sin(pos.x * 0.3 + uTime * 0.4) * cos(pos.z * 0.3 + uTime * 0.3) * 0.3;
    pos.y += wave;

    vDist = length(pos.xz) / 30.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const gridFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  uniform float uTime;
  uniform vec3 uColor;

  void main() {
    // Grid lines
    vec2 grid = abs(fract(vUv * 40.0 - 0.5) - 0.5) / fwidth(vUv * 40.0);
    float line = min(grid.x, grid.y);
    float gridAlpha = 1.0 - min(line, 1.0);

    // Pulse wave from center
    float pulse = sin(vDist * 12.0 - uTime * 1.5) * 0.5 + 0.5;
    pulse = smoothstep(0.4, 0.6, pulse);

    // Fade at edges
    float edgeFade = 1.0 - smoothstep(0.3, 0.9, vDist);

    float alpha = gridAlpha * edgeFade * (0.04 + pulse * 0.04);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function FloatingGrid() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#4a506a") },
    }),
    []
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]}>
      <planeGeometry args={[60, 60, 60, 60]} />
      <shaderMaterial
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
