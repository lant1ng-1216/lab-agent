import * as THREE from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import WebGPUContext from "../core/WebGPUContext";
import { CameraRig } from "../utils/CameraRig";
import InstancedModel from "../utils/InstancedModel";

const BASE = import.meta.env.BASE_URL || "./";

export default class Scene {
	constructor() {
		this.context = new WebGPUContext();
		const { width, height } = this.context.getFullScreenDimensions();
		this.width = width;
		this.height = height;

		this.envMap = this.#createEnvironment();
		this.solidScene = this.#createScene();
		this.wireScene = this.#createScene();

		this.#createInstancedModels();
		this.#createCamera();
	}

	#createInstancedModels() {
		const solid = new InstancedModel(this.solidScene, {
			url: `${BASE}skin/skull/man_comp-transformed.glb`,
			meshName: "body",
			heightMax: 1.0,
			roughness: 1.0,
		});

		const wire = new InstancedModel(this.wireScene, {
			url: `${BASE}skin/skull/skeleton_comp-transformed.glb`,
			meshName: "skeleton",
			heightMax: 0.9,
			roughness: 0.9,
		});

		this.ready = Promise.all([solid.ready, wire.ready]);
	}

	#createEnvironment() {
		const pmremGenerator = new THREE.PMREMGenerator(this.context.renderer);
		const envMap = pmremGenerator.fromScene(new RoomEnvironment()).texture;
		pmremGenerator.dispose();
		return envMap;
	}

	#createScene() {
		const scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x000000, 1, 3);
		scene.background = new THREE.Color(0x000000);
		scene.environment = this.envMap;
		scene.environmentIntensity = 0.1;

		const light = new THREE.PointLight(0xffffff, 0.75);
		light.position.set(1, 2, 1);
		scene.add(light);

		return scene;
	}

	#createCamera() {
		this.camera = new THREE.PerspectiveCamera(
			17,
			this.width / this.height,
			0.1,
			100,
		);
		this.cameraRig = new CameraRig(this.camera);
	}

	animate(delta, elapsed) {
		this.cameraRig?.update(delta, elapsed);
	}

	onResize(width, height) {
		this.width = width;
		this.height = height;
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}
}
