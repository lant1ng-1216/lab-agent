/**
 * Skin · daytime background — visual match of
 * https://dithering.niccolofanton.dev/
 *
 * Adapted from https://github.com/niccolofanton/dithering-shader (MIT)
 * Helmet: The Royal Armoury / Sketchfab, CC-BY-4.0
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Float, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DitherPostProcessing } from "./DitherPostProcessing";
import { EnvironmentWrapper } from "./EnvironmentWrapper";

const BG = "#ffffff";
const HELMET_URL = `${import.meta.env.BASE_URL}skin/jousting_helmet-transformed.glb`;

useGLTF.preload(HELMET_URL);

function Helmet(props: Record<string, unknown>) {
  const { nodes, materials } = useGLTF(HELMET_URL) as unknown as {
    nodes: { Object_2: THREE.Mesh };
    materials: { model_Material_u1_v1: THREE.MeshStandardMaterial };
  };
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        geometry={nodes.Object_2.geometry}
        material={materials.model_Material_u1_v1}
        material-roughness={0.15}
        position={[-2.016, -0.06, 1.381]}
        rotation={[-1.601, 0.068, 2.296]}
        scale={0.038}
      />
    </group>
  );
}

function DemoScene() {
  const modelScale = useMemo(() => (typeof window !== "undefined" && window.innerWidth <= 768 ? 2.4 : 3), []);

  return (
    <>
      <group position={[0, -0.5, 0]}>
        <Float floatIntensity={2} rotationIntensity={1} speed={2}>
          <Center scale={modelScale} position={[0, 0.8, 0]} rotation={[0, -Math.PI / 3.5, -0.4]}>
            <Helmet />
          </Center>
        </Float>
      </group>
      <EnvironmentWrapper intensity={1.5} highlight="#066aff" />
      {/* Demo leva defaults: gridSize 4, pixelSizeRatio 1, grayscale */}
      <DitherPostProcessing gridSize={4} pixelSizeRatio={1} grayscaleOnly />
    </>
  );
}

/**
 * Full-bleed dither background matching the official demo look.
 * pointer-events none — chat UI stays interactive above.
 */
export default function SkinDitherBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, -1, 4], fov: 65 }}
        gl={{ alpha: false, antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(BG));
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={[BG]} />
        <Suspense fallback={null}>
          <DemoScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
