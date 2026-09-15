import * as THREE from "three/webgpu";

/**
 * Adapted from cullenwebber/three-skull (MIT) for embedding in Lab Agent.
 * Canvas mounts into a host container with pointer-events: none so UI stays usable.
 */
class WebGPUContext {
	constructor(container) {
		if (WebGPUContext.instance) {
			return WebGPUContext.instance;
		}

		this.container = container;
		this.renderer = null;
		this.canvas = null;
		this.pixelRatio = Math.min(window.devicePixelRatio, 2.0);

		WebGPUContext.instance = this;
	}

	async init() {
		this.canvas = this.#createCanvas();
		this.renderer = new THREE.WebGPURenderer({
			canvas: this.canvas,
			antialias: false,
		});

		await this.renderer.init();

		const { width, height } = this.getFullScreenDimensions();
		this.renderer.setSize(width, height);
		this.renderer.setPixelRatio(this.pixelRatio);
		this.renderer.shadowMap.enabled = false;
		this.renderer.autoClear = false;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
	}

	getFullScreenDimensions() {
		const el = this.container;
		if (el) {
			const w = el.clientWidth || el.offsetWidth;
			const h = el.clientHeight || el.offsetHeight;
			if (w > 0 && h > 0) return { width: w, height: h };
		}
		return {
			width: Math.max(1, window.innerWidth),
			height: Math.max(1, window.innerHeight),
		};
	}

	#createCanvas() {
		const canvas = document.createElement("canvas");
		canvas.style.position = "absolute";
		canvas.style.inset = "0";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.zIndex = "0";
		canvas.style.pointerEvents = "none";
		canvas.setAttribute("aria-hidden", "true");
		this.container.appendChild(canvas);
		return canvas;
	}

	onResize(width, height) {
		this.pixelRatio = Math.min(window.devicePixelRatio, 2);
		this.renderer.setSize(width, height);
		this.renderer.setPixelRatio(this.pixelRatio);
	}

	dispose() {
		try {
			this.renderer?.dispose();
		} catch {
			/* ignore */
		}
		this.canvas?.remove();
		this.renderer = null;
		this.canvas = null;
		WebGPUContext.instance = null;
	}
}

WebGPUContext.instance = null;

export default WebGPUContext;
