import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
loader.setDRACOLoader(dracoLoader);

export default class ImportGltf {
	constructor(url, { onLoad }) {
		this.ready = new Promise((resolve, reject) => {
			loader.load(
				url,
				(gltf) => {
					onLoad?.(gltf.scene);
					resolve();
				},
				undefined,
				(error) => {
					console.error("GLTF load error:", error);
					reject(error);
				},
			);
		});
	}
}
