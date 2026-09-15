import * as THREE from "three/webgpu";
import WebGPUContext from "./WebGPUContext";
import Scene from "../scenes/Scene";
import MouseTrail from "../utils/MouseTrail";
import FluidSim from "../postprocessing/FluidSim";
import PostProcessing from "../postprocessing/PostProcessing";

/**
 * Adapted from cullenwebber/three-skull (MIT).
 * Owns the animation loop; call dispose() on unmount.
 * setActive(false) pauses rAF but keeps WebGPU warm.
 */
class Three {
	constructor(container) {
		this.container = container;
		this.clock = new THREE.Clock();
		this._raf = 0;
		this._alive = true;
		this._active = true;
		this._onResize = () => this.#onResize();
	}

	async run() {
		this.context = new WebGPUContext(this.container);
		await this.context.init();
		if (!this._alive) {
			this.context.dispose();
			return;
		}

		this.#setup();
		if (this.scene?.ready) {
			await this.scene.ready;
		}
		if (!this._alive) {
			this.dispose();
			return;
		}
		window.addEventListener("resize", this._onResize);
		this.#animate();
	}

	setActive(active) {
		this._active = active;
		// Only start the loop once scene + post stack exist (run() may still be awaiting WebGPU).
		if (active && this._alive && !this._raf && this.scene && this.postProcessing) {
			this.clock.getDelta();
			this.#animate();
		}
	}

	#setup() {
		const { width, height } = this.context.getFullScreenDimensions();
		const pr = this.context.pixelRatio;
		this.scene = new Scene();
		this.mouseTrail = new MouseTrail(width * pr, height * pr);
		this.fluidSim = new FluidSim(width * pr, height * pr);

		this.postProcessing = new PostProcessing(
			this.context.renderer,
			this.scene.solidScene,
			this.scene.wireScene,
			this.scene.camera,
			this.fluidSim.texture,
		);
	}

	#animate() {
		if (!this._alive) return;
		if (!this._active) {
			this._raf = 0;
			return;
		}
		if (!this.scene || !this.postProcessing || !this.fluidSim || !this.mouseTrail) {
			this._raf = 0;
			return;
		}
		const delta = this.clock.getDelta();

		this.scene.animate(delta, this.clock.elapsedTime);

		this.mouseTrail.update(
			this.scene.cameraRig.mouseNormalized.x,
			this.scene.cameraRig.mouseNormalized.y,
		);
		this.fluidSim.update(this.context.renderer, this.mouseTrail.texture);
		this.postProcessing.render();

		this._raf = requestAnimationFrame(() => this.#animate());
	}

	#onResize() {
		if (!this._alive || !this.context || !this.scene) return;
		const { width, height } = this.context.getFullScreenDimensions();
		const pr = this.context.pixelRatio;

		this.context.onResize(width, height);
		this.scene.onResize(width, height);
		this.fluidSim?.onResize(width * pr, height * pr);
		this.mouseTrail?.resize?.(width * pr, height * pr);
	}

	dispose() {
		this._alive = false;
		this._active = false;
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		window.removeEventListener("resize", this._onResize);
		try {
			this.postProcessing?.dispose();
			this.fluidSim?.dispose();
			this.mouseTrail?.dispose();
			this.scene?.cameraRig?.dispose?.();
		} catch {
			/* ignore */
		}
		this.context?.dispose();
		this.context = null;
	}
}

export default Three;
