/**
 * DitheringEffect — adapted from
 * https://github.com/niccolofanton/dithering-shader (MIT)
 */

import { Effect } from "postprocessing";
import * as THREE from "three";
import ditheringShader from "./DitheringShader";

export interface DitheringEffectOptions {
  time?: number;
  resolution?: THREE.Vector2;
  gridSize?: number;
  luminanceMethod?: number;
  invertColor?: boolean;
  pixelSizeRatio?: number;
  grayscaleOnly?: boolean;
}

export class DitheringEffect extends Effect {
  uniforms: Map<string, THREE.Uniform<number | THREE.Vector2>>;

  constructor({
    time = 0,
    resolution = new THREE.Vector2(1, 1),
    gridSize = 4,
    luminanceMethod = 0,
    invertColor = false,
    pixelSizeRatio = 1,
    grayscaleOnly = true,
  }: DitheringEffectOptions = {}) {
    const uniforms = new Map<string, THREE.Uniform<number | THREE.Vector2>>([
      ["time", new THREE.Uniform(time)],
      ["resolution", new THREE.Uniform(resolution)],
      ["gridSize", new THREE.Uniform(gridSize)],
      ["luminanceMethod", new THREE.Uniform(luminanceMethod)],
      ["invertColor", new THREE.Uniform(invertColor ? 1 : 0)],
      ["ditheringEnabled", new THREE.Uniform(1)],
      ["pixelSizeRatio", new THREE.Uniform(pixelSizeRatio)],
      ["grayscaleOnly", new THREE.Uniform(grayscaleOnly ? 1 : 0)],
    ]);

    super("DitheringEffect", ditheringShader, { uniforms });
    this.uniforms = uniforms;
  }

  update(
    _renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
  ): void {
    const timeUniform = this.uniforms.get("time");
    if (timeUniform && typeof timeUniform.value === "number") {
      timeUniform.value += deltaTime;
    }
    const resolutionUniform = this.uniforms.get("resolution");
    if (resolutionUniform && resolutionUniform.value instanceof THREE.Vector2) {
      resolutionUniform.value.set(inputBuffer.width, inputBuffer.height);
    }
  }
}
