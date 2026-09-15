import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, EffectPass, RenderPass } from "postprocessing";
import * as THREE from "three";
import { DitheringEffect } from "./DitheringEffect";

/** Post-processing: Bayer dither pass (no Leva). */
export function DitherPostProcessing({
  gridSize = 4,
  pixelSizeRatio = 1,
  grayscaleOnly = true,
}: {
  gridSize?: number;
  pixelSizeRatio?: number;
  grayscaleOnly?: boolean;
}) {
  const composerRef = useRef<EffectComposer | null>(null);
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [camera, setCamera] = useState<THREE.Camera | null>(null);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const handleResize = useCallback(() => {
    const composer = composerRef.current;
    const gl = glRef.current;
    if (!composer || !gl) return;
    composer.setSize(gl.domElement.clientWidth, gl.domElement.clientHeight);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (!scene || !camera || !composerRef.current) return;
    const composer = composerRef.current;
    composer.removeAllPasses();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new EffectPass(
        camera,
        new DitheringEffect({
          gridSize,
          pixelSizeRatio,
          grayscaleOnly,
        }),
      ),
    );
  }, [scene, camera, gridSize, pixelSizeRatio, grayscaleOnly]);

  useFrame(({ gl, scene: currentScene, camera: currentCamera }, delta) => {
    glRef.current = gl;
    if (!composerRef.current) {
      composerRef.current = new EffectComposer(gl);
      handleResize();
    }
    if (scene !== currentScene) setScene(currentScene);
    if (camera !== currentCamera) setCamera(currentCamera);
    composerRef.current.render(delta);
  }, 1);

  useEffect(() => {
    return () => {
      composerRef.current?.dispose();
      composerRef.current = null;
    };
  }, []);

  return null;
}
